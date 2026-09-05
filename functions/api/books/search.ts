interface SearchContext {
  request: Request;
}

interface BookCandidate {
  title: string;
  author: string;
  year: string | null;
  isbn: string | null;
  cover: string | null;
  source: 'google' | 'openlibrary';
}

function buildCoverProxyUrl(remoteUrl: string): string {
  return `/api/books/cover?url=${encodeURIComponent(remoteUrl)}`;
}

async function searchGoogle(q: string): Promise<BookCandidate[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(q)}&maxResults=5`;
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
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=5&fields=title,author_name,first_publish_year,isbn,cover_i`;
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

export async function onRequestGet(context: SearchContext): Promise<Response> {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  if (!q) {
    return json({ results: [] });
  }

  try {
    const settled = await Promise.allSettled([searchGoogle(q), searchOpenLibrary(q)]);
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

    return json({ results: merged.slice(0, 6) });
  } catch {
    return json({ results: [], error: 'search_failed' }, 502);
  }
}
