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
  cover: string | null;
  source: 'douban' | 'google' | 'openlibrary';
}

function isCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function buildCoverProxyUrl(remoteUrl: string): string {
  return `/api/books/cover?url=${encodeURIComponent(remoteUrl)}`;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function upgradeDoubanCover(url: string): string {
  return url.replace(/\/view\/subject\/[a-z]\/public\//, '/view/subject/l/public/');
}

async function searchDouban(q: string): Promise<BookCandidate[]> {
  const url = `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(q)}&cat=1001`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  if (!resp.ok) return [];

  const html = await resp.text();
  if (!html.includes('item-root')) return [];

  const results: BookCandidate[] = [];
  const blocks = html.split('class="item-root"');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    let cover: string | null = null;
    const imgMatch = block.match(/<img[^>]+src="([^"]+doubanio\.com[^"]*)"/);
    if (imgMatch) {
      cover = upgradeDoubanCover(imgMatch[1].replace(/&amp;/g, '&'));
    }

    let title = '';
    const titleMatch = block.match(/class="title-text"[^>]*>([\s\S]*?)<\/a>/);
    if (titleMatch) {
      title = stripHtml(titleMatch[1]);
    }

    let author = '';
    let year: string | null = null;
    const metaMatch = block.match(/class="meta abstract"[^>]*>([\s\S]*?)<\/div>/);
    if (metaMatch) {
      const metaText = stripHtml(metaMatch[1]);
      const parts = metaText.split('/').map((p) => p.trim());
      const authorPart = parts[0] ?? '';
      author = authorPart.replace(/^(作者|著者|译者|译)[:：]?\s*/i, '');
      const yearPart = parts.find((p) => /\d{4}/.test(p));
      if (yearPart) {
        const m = yearPart.match(/(\d{4})/);
        if (m) year = m[1];
      }
    }

    if (!title) continue;
    results.push({ title, author, year, isbn: null, cover, source: 'douban' });
  }

  return results.slice(0, 8);
}

async function searchGoogle(q: string, apiKey?: string): Promise<BookCandidate[]> {
  const params = new URLSearchParams({ q, maxResults: '10', printType: 'books' });
  if (apiKey) params.set('key', apiKey);
  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) return [];

  const data = (await resp.json()) as { items?: any[] };
  const items = data.items ?? [];

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
        cover: cover ? buildCoverProxyUrl(cover) : null,
        source: 'google',
      };
    })
    .filter((b: BookCandidate) => b.title.length > 0);
}

async function searchOpenLibrary(q: string): Promise<BookCandidate[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=title,author_name,first_publish_year,isbn,cover_i`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) return [];

  const data = (await resp.json()) as { docs?: any[] };
  const docs = data.docs ?? [];

  return docs
    .map((d: any): BookCandidate => {
      const coverId = d.cover_i;
      const cover = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null;
      return {
        title: typeof d.title === 'string' ? d.title : '',
        author: Array.isArray(d.author_name) ? (d.author_name[0] ?? '') : '',
        year: d.first_publish_year ? String(d.first_publish_year) : null,
        isbn: Array.isArray(d.isbn) ? (d.isbn[0] ?? null) : null,
        cover: cover ? buildCoverProxyUrl(cover) : null,
        source: 'openlibrary',
      };
    })
    .filter((b: BookCandidate) => b.title.length > 0);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function rankAndSlice(candidates: BookCandidate[], q: string): BookCandidate[] {
  if (!isCjk(q)) return candidates.slice(0, 6);

  const cjk: BookCandidate[] = [];
  const rest: BookCandidate[] = [];
  for (const candidate of candidates) {
    (isCjk(candidate.title) ? cjk : rest).push(candidate);
  }
  return [...cjk, ...rest].slice(0, 6);
}

export async function onRequestGet(context: SearchContext): Promise<Response> {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  if (!q) {
    return json({ results: [] });
  }

  const apiKey = context.env?.GOOGLE_BOOKS_API_KEY ?? '';

  try {
    // 1) 豆瓣优先
    const douban = await searchDouban(q);
    if (douban.length > 0) {
      return json({ results: douban });
    }

    // 2) Google Books + Open Library 兜底
    const settled = await Promise.allSettled([searchGoogle(q, apiKey), searchOpenLibrary(q)]);
    const merged: BookCandidate[] = [];
    const seen = new Set<string>();

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const candidate of result.value) {
        const key = `${candidate.title}|${candidate.author}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(candidate);
      }
    }

    return json({ results: rankAndSlice(merged, q) });
  } catch {
    return json({ results: [], error: 'search_failed' }, 502);
  }
}
