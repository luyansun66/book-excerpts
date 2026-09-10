interface SearchEnv {
  GOOGLE_BOOKS_API_KEY?: string;
}

interface SearchContext {
  request: Request;
  env: SearchEnv;
}

interface BookCandidate {
  title: string;
  author: string;
  year: string | null;
  isbn: string | null;
  publisher: string | null;
  cover: string | null;
  source: 'douban' | 'google' | 'openlibrary';
}

interface SourceResult {
  ok: boolean;
  results: BookCandidate[];
  ms: number;
}

const SOURCE_TIMEOUT_MS = 2500;
const CACHE_TTL_SECONDS = 300;

const defaultCache = (caches as unknown as { default: Cache }).default;

function isCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

function buildCoverProxyUrl(remoteUrl: string): string {
  return `/api/books/cover?url=${encodeURIComponent(remoteUrl)}`;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseGoogleItems(items: any[]): BookCandidate[] {
  return items
    .map((item: any): BookCandidate => {
      const vi = item.volumeInfo ?? {};
      const authors: string[] = Array.isArray(vi.authors) ? vi.authors : [];
      const identifiers: any[] = Array.isArray(vi.industryIdentifiers) ? vi.industryIdentifiers : [];
      const isbn =
        identifiers.find((id: any) => id?.type === 'ISBN_13' || id?.type === 'ISBN_10')?.identifier ?? null;

      let cover = vi.imageLinks?.thumbnail ?? null;
      if (typeof cover === 'string') cover = cover.replace(/^http:/, 'https:');

      return {
        title: typeof vi.title === 'string' ? vi.title : '',
        author: authors[0] ?? '',
        year: vi.publishedDate ? String(vi.publishedDate).slice(0, 4) : null,
        isbn,
        publisher: typeof vi.publisher === 'string' ? vi.publisher : null,
        cover: cover ? buildCoverProxyUrl(cover) : null,
        source: 'google',
      };
    })
    .filter((b: BookCandidate) => b.title.length > 0);
}

async function searchGoogle(q: string, apiKey?: string): Promise<SourceResult> {
  const started = Date.now();
  const buildUrl = (query: string) => {
    const params = new URLSearchParams({ q: query, maxResults: '20', printType: 'books' });
    if (apiKey) params.set('key', apiKey);
    return `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  };

  try {
    // 标题优先，避免全文检索带回无关书籍
    let resp = await fetchWithTimeout(buildUrl(`intitle:${q}`), SOURCE_TIMEOUT_MS);
    if (!resp.ok) {
      resp = await fetchWithTimeout(buildUrl(q), SOURCE_TIMEOUT_MS);
    }
    if (!resp.ok) {
      return { ok: false, results: [], ms: Date.now() - started };
    }

    let data = (await resp.json()) as { items?: any[] };
    let items = data.items ?? [];

    if (items.length === 0) {
      const fallback = await fetchWithTimeout(buildUrl(q), SOURCE_TIMEOUT_MS);
      if (fallback.ok) {
        const fallbackData = (await fallback.json()) as { items?: any[] };
        items = fallbackData.items ?? [];
      }
    }

    return { ok: true, results: parseGoogleItems(items), ms: Date.now() - started };
  } catch {
    return { ok: false, results: [], ms: Date.now() - started };
  }
}

// ─── 豆瓣：中文书的封面几乎只有这里有 ──────────────────────────────────────────
// Google Books 对中文版基本不给 imageLinks，实测「昨日的世界」20 条结果里
// 0 条有封面，而同样的查询在豆瓣 top 结果条条都有封面，所以中文查询以豆瓣优先。
// 用 subject_suggest 这个轻量 JSON 接口，不抓搜索结果页的 HTML（那份 HTML 结构
// 易变，且整页抓取更容易被拦）。
const DOUBAN_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://book.douban.com/',
};

function parseDoubanSuggest(items: any[]): BookCandidate[] {
  return items
    // subject_suggest 会混进影音条目（type = 'm'/'mv'），只要书
    .filter((d: any) => d?.type === 'b' && typeof d.title === 'string' && d.title.length > 0)
    .map((d: any): BookCandidate => ({
      title: d.title,
      author: typeof d.author_name === 'string' ? d.author_name : '',
      year: d.year ? String(d.year).slice(0, 4) : null,
      isbn: null,
      publisher: null,
      cover: typeof d.pic === 'string' && d.pic ? buildCoverProxyUrl(d.pic) : null,
      source: 'douban',
    }));
}

async function searchDouban(q: string): Promise<SourceResult> {
  const started = Date.now();
  const url = `https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(q)}`;

  try {
    const resp = await fetchWithTimeout(url, SOURCE_TIMEOUT_MS, DOUBAN_HEADERS);
    if (!resp.ok) {
      return { ok: false, results: [], ms: Date.now() - started };
    }
    const data = (await resp.json()) as any;
    const items = Array.isArray(data) ? data : [];
    return { ok: true, results: parseDoubanSuggest(items), ms: Date.now() - started };
  } catch {
    return { ok: false, results: [], ms: Date.now() - started };
  }
}

function parseOpenLibraryDocs(docs: any[]): BookCandidate[] {
  return docs
    .map((d: any): BookCandidate => {
      const coverId = d.cover_i;
      const cover = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null;
      return {
        title: typeof d.title === 'string' ? d.title : '',
        author: Array.isArray(d.author_name) ? (d.author_name[0] ?? '') : '',
        year: d.first_publish_year ? String(d.first_publish_year) : null,
        isbn: Array.isArray(d.isbn) ? (d.isbn[0] ?? null) : null,
        publisher: Array.isArray(d.publisher) ? (d.publisher[0] ?? null) : typeof d.publisher === 'string' ? d.publisher : null,
        cover: cover ? buildCoverProxyUrl(cover) : null,
        source: 'openlibrary',
      };
    })
    .filter((b: BookCandidate) => b.title.length > 0);
}

async function searchOpenLibrary(q: string): Promise<SourceResult> {
  const started = Date.now();
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=20&fields=title,author_name,first_publish_year,isbn,cover_i,publisher`;

  try {
    const resp = await fetchWithTimeout(url, SOURCE_TIMEOUT_MS);
    if (!resp.ok) {
      return { ok: false, results: [], ms: Date.now() - started };
    }
    const data = (await resp.json()) as { docs?: any[] };
    return { ok: true, results: parseOpenLibraryDocs(data.docs ?? []), ms: Date.now() - started };
  } catch {
    return { ok: false, results: [], ms: Date.now() - started };
  }
}

function mergeResults(...groups: BookCandidate[][]): BookCandidate[] {
  const merged: BookCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of groups.flat()) {
    // 用「书名|作者|年份|ISBN|出版社」去重，保留不同版本
    const key = [candidate.title, candidate.author, candidate.year, candidate.isbn, candidate.publisher]
      .map((v) => (v ?? '').toLowerCase())
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }

  return merged;
}

function filterRelevant(candidates: BookCandidate[], q: string): BookCandidate[] {
  const nq = normalize(q);
  if (!nq) return candidates;

  const matches = candidates.filter((c) => normalize(c.title).includes(nq));
  return matches.length > 0 ? matches : candidates;
}

function rankResults(candidates: BookCandidate[], q: string): BookCandidate[] {
  if (!isCjk(q)) return candidates;

  const cjk: BookCandidate[] = [];
  const rest: BookCandidate[] = [];
  for (const candidate of candidates) {
    (isCjk(candidate.title) ? cjk : rest).push(candidate);
  }
  return [...cjk, ...rest];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestGet(context: SearchContext): Promise<Response> {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const debug = url.searchParams.get('debug') === '1';

  if (!q) {
    return json({ results: [], debug: debug ? { query: q } : undefined });
  }

  if (!debug) {
    const cached = await defaultCache.match(context.request);
    if (cached) return cached;
  }

  const apiKey = context.env?.GOOGLE_BOOKS_API_KEY ?? '';
  const [douban, google, openlibrary] = await Promise.allSettled([
    searchDouban(q),
    searchGoogle(q, apiKey),
    searchOpenLibrary(q),
  ]);

  const empty: SourceResult = { ok: false, results: [], ms: 0 };
  const doubanResult: SourceResult = douban.status === 'fulfilled' ? douban.value : empty;
  const googleResult: SourceResult = google.status === 'fulfilled' ? google.value : empty;
  const openResult: SourceResult = openlibrary.status === 'fulfilled' ? openlibrary.value : empty;

  // 中文查询把豆瓣排在最前：它的中文版封面覆盖是三者里最好的。
  // 非中文查询则把豆瓣放最后，避免它拿中文译本挤掉用户真正要找的原版。
  const merged = isCjk(q)
    ? mergeResults(doubanResult.results, googleResult.results, openResult.results)
    : mergeResults(googleResult.results, openResult.results, doubanResult.results);
  const relevant = filterRelevant(merged, q);
  const ranked = rankResults(relevant, q);

  const payload: Record<string, unknown> = {
    results: ranked.slice(0, 12),
  };

  if (debug) {
    payload.debug = {
      query: q,
      douban: { ok: doubanResult.ok, count: doubanResult.results.length, ms: doubanResult.ms },
      google: { ok: googleResult.ok, count: googleResult.results.length, ms: googleResult.ms },
      openlibrary: { ok: openResult.ok, count: openResult.results.length, ms: openResult.ms },
      merged: merged.length,
      relevant: relevant.length,
      withCover: ranked.filter((c) => c.cover).length,
    };
  }

  const response = json(payload);

  if (!debug && response.ok) {
    response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`);
    await defaultCache.put(context.request, response.clone());
  }

  return response;
}
