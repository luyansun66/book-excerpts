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

// 豆瓣是慢链路：实测中位 1.7s，偶发超过 2.5s（10 次采样里 2 次卡在超时上）。
// 它一旦被超时掐掉，中文查询就退回「一条封面都没有」的老样子——正是这次要修的
// 问题，所以单独给豆瓣更长的预算。代价是最慢情况下整次搜索多等约 1.5s，
// 而搜索结果本身有 5 分钟缓存，重复查询不会重复付这个成本。
//
// 2026-10 又从 4s 提到 5s：边缘机房回源豆瓣的实测分布里，成功的那批最长见到 3.9s，
// 而失败的几次都正好停在 4s 预算上（顶到上限被掐），说明 4s 卡在分布中间而不是尾部。
const DOUBAN_TIMEOUT_MS = 5000;
// 第一次没过就再试一次。边缘回源豆瓣的卡顿是突发的：实测同一个词连着打，典型 220ms，
// 但会成串地冒出 2.5s 以上乃至顶满预算的请求；而顶满的那几次紧接着重试，都在 220ms
// 左右就回来了。所以重试的命中率很高，代价只在失败路径上（正常情况一次都不多打）。
const DOUBAN_RETRY_TIMEOUT_MS = 3000;
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

async function fetchDoubanSuggest(q: string, timeoutMs: number): Promise<BookCandidate[]> {
  const url = `https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(q)}`;
  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, timeoutMs, DOUBAN_HEADERS);
  } catch {
    throw new Error('豆瓣请求超时或被拒');
  }
  if (!resp.ok) throw new Error(`豆瓣返回 HTTP ${resp.status}`);

  const data = (await resp.json().catch(() => null)) as any;
  return parseDoubanSuggest(Array.isArray(data) ? data : []);
}

async function searchDouban(q: string): Promise<SourceResult> {
  const started = Date.now();

  try {
    return { ok: true, results: await fetchDoubanSuggest(q, DOUBAN_TIMEOUT_MS), ms: Date.now() - started };
  } catch {
    // 一次不成不急着认输 —— 详见 DOUBAN_RETRY_TIMEOUT_MS 上面那段实测。
    try {
      const results = await fetchDoubanSuggest(q, DOUBAN_RETRY_TIMEOUT_MS);
      return { ok: true, results, ms: Date.now() - started };
    } catch {
      return { ok: false, results: [], ms: Date.now() - started };
    }
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

/**
 * 相关度：查询词命中书名**或作者**都算。
 *
 * 只认书名会把「按作者搜」毁掉：豆瓣对「村上春树」返回的是《挪威的森林》，书名里
 * 没有作者名，于是被当噪音删掉；而 Google 的全文检索总能捞到几条书名带作者名的
 * 条目，一进一出，列表里一条豆瓣都不剩 —— 用户反馈的「豆瓣没有加入搜索列表、
 * 列表都是 Google 的书」就是这个。
 *
 * 实测（改之前，线上）：村上春树 / 王小波 / 加缪 三个查询，豆瓣分别抓到 2 / 3 / 4 条，
 * 展示里一条都没有（加缪那次是 merged 24 条只剩 1 条）。
 *
 * 时间线也对得上：`eb53f91` 引入标题过滤在前，`33af7bf` 补回豆瓣源在后，
 * 两者叠加之后，凡是「书名不含关键词」的豆瓣结果就全被过滤掉了。
 */
function isRelevant(candidate: BookCandidate, normalizedQuery: string): boolean {
  return (
    normalize(candidate.title).includes(normalizedQuery) ||
    normalize(candidate.author).includes(normalizedQuery)
  );
}

function filterRelevant(candidates: BookCandidate[], q: string): BookCandidate[] {
  const nq = normalize(q);
  if (!nq) return candidates;

  const matches = candidates.filter((c) => isRelevant(c, nq));
  // 全都对不上时保留原样：查询词可能是译名、拼音之类，与其给个空列表，不如把
  // 各源的原始结果交给用户自己挑。
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

  // 只要有一个源没跑成，这次结果就是残缺的（最典型的是豆瓣超时 —— 实测约 3% 的查询
  // 会顶到预算上，那一次结果里一条豆瓣都没有）。残缺结果一旦写进 5 分钟缓存，用户
  // 反复搜同一个词就一直是残缺的，看起来像「豆瓣再也不出现了」。所以只在三个源都
  // 正常时才缓存，慢一次换下次自动重试。
  const allSourcesOk = doubanResult.ok && googleResult.ok && openResult.ok;

  if (debug) {
    payload.debug = {
      query: q,
      douban: { ok: doubanResult.ok, count: doubanResult.results.length, ms: doubanResult.ms },
      google: { ok: googleResult.ok, count: googleResult.results.length, ms: googleResult.ms },
      openlibrary: { ok: openResult.ok, count: openResult.results.length, ms: openResult.ms },
      merged: merged.length,
      relevant: relevant.length,
      withCover: ranked.filter((c) => c.cover).length,
      cacheable: allSourcesOk,
    };
  }

  const response = json(payload);

  if (!debug && response.ok && allSourcesOk) {
    response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`);
    await defaultCache.put(context.request, response.clone());
  }

  return response;
}
