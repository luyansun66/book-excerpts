// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// search.ts 在模块顶层读 caches.default（Cloudflare 运行时才有），
// 所以必须先把这个全局补上，再动态 import。
const cacheStore = new Map<string, Response>();
vi.stubGlobal('caches', {
  default: {
    match: async (req: Request) => cacheStore.get(req.url),
    put: async (req: Request, res: Response) => void cacheStore.set(req.url, res),
  },
});

const { onRequestGet } = await import('../functions/api/books/search');
const { onRequestGet: onCoverGet } = await import('../functions/api/books/cover');

// ─── 假数据：三个源各自的返回形状 ──────────────────────────────────────────────
const DOUBAN_PAYLOAD = [
  {
    title: '昨日的世界',
    url: 'https://book.douban.com/subject/27615361/',
    pic: 'https://img9.doubanio.com/view/subject/s/public/s29786716.jpg',
    author_name: '[奥地利] 斯蒂芬·茨威格',
    year: '2018',
    type: 'b',
    id: '27615361',
  },
  // 影音条目，必须被过滤掉
  { title: '昨日的世界 电影', pic: 'https://img9.doubanio.com/x.jpg', type: 'm', id: '1' },
];

const GOOGLE_PAYLOAD = {
  items: [
    { volumeInfo: { title: '昨日的世界', authors: ['Stefan Zweig'], publishedDate: '2018-01-01' } },
    {
      volumeInfo: {
        title: 'Harry Potter',
        authors: ['J. K. Rowling'],
        publishedDate: '1998-01-01',
        imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc&zoom=1' },
      },
    },
  ],
};

const OPENLIBRARY_PAYLOAD = {
  docs: [{ title: '昨日的世界', author_name: ['茨威格'], first_publish_year: 1934, cover_i: 12345 }],
};

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('book.douban.com/j/subject_suggest')) {
      return new Response(JSON.stringify(DOUBAN_PAYLOAD), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('googleapis.com')) {
      return new Response(JSON.stringify(GOOGLE_PAYLOAD), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('openlibrary.org')) {
      return new Response(JSON.stringify(OPENLIBRARY_PAYLOAD), { headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

async function search(query: string) {
  const request = new Request(
    `https://book-excerpts-2dm.pages.dev/api/books/search?q=${encodeURIComponent(query)}&debug=1`,
  );
  const resp = await onRequestGet({ request, env: {} });
  return (await resp.json()) as any;
}

describe('书封来源', () => {
  beforeEach(() => {
    cacheStore.clear();
    vi.stubGlobal('fetch', mockFetch());
  });

  it('中文查询把豆瓣排在 Google 前面', async () => {
    const data = await search('昨日的世界');
    expect(data.results[0].source).toBe('douban');
    expect(data.results[0].title).toBe('昨日的世界');
  });

  it('豆瓣结果带上走代理的封面地址，且过滤掉影音条目', async () => {
    const data = await search('昨日的世界');
    const douban = data.results.filter((r: any) => r.source === 'douban');

    expect(douban).toHaveLength(1); // 电影那条 type='m' 不该出现
    expect(douban[0].cover).toBe(
      '/api/books/cover?url=' + encodeURIComponent('https://img9.doubanio.com/view/subject/s/public/s29786716.jpg'),
    );
  });

  it('豆瓣请求必须带 Referer，否则图床会返回 418', async () => {
    await search('昨日的世界');
    const call = (fetch as any).mock.calls.find(([u]: [string]) => String(u).includes('subject_suggest'));
    expect(call).toBeTruthy();
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).Referer).toBe('https://book.douban.com/');
  });

  it('英文查询不把豆瓣排到最前，避免中文译本挤掉原版', async () => {
    const data = await search('harry potter');
    expect(data.results[0].source).toBe('google');
  });

  it('Google 返回的 http 封面会升级成 https，并统计有封面的条数', async () => {
    const data = await search('harry potter');
    const google = data.results.filter((r: any) => r.source === 'google');
    expect(google.some((r: any) => String(r.cover).includes(encodeURIComponent('https://books.google.com')))).toBe(true);
    expect(data.debug.withCover).toBeGreaterThan(0);
  });

  it('debug 里能看到三个源各自的响应情况', async () => {
    const data = await search('昨日的世界');
    expect(data.debug.douban.ok).toBe(true);
    expect(data.debug.google.ok).toBe(true);
    expect(data.debug.openlibrary.ok).toBe(true);
  });
});

describe('封面代理', () => {
  async function proxy(target: string) {
    const request = new Request(
      'https://book-excerpts-2dm.pages.dev/api/books/cover?url=' + encodeURIComponent(target),
    );
    return onCoverGet({ request });
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('JPEGDATA', { headers: { 'Content-Type': 'image/jpeg' } })),
    );
  });

  it('放行豆瓣图床，并代上 Referer', async () => {
    const resp = await proxy('https://img9.doubanio.com/view/subject/s/public/s29786716.jpg');
    expect(resp.status).toBe(200);

    const init = (fetch as any).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Referer).toBe('https://book.douban.com/');
  });

  it('仍然拒绝白名单之外的域名', async () => {
    const resp = await proxy('https://evil.example.com/a.jpg');
    expect(resp.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('冒充豆瓣的域名不放行', async () => {
    const resp = await proxy('https://img9.doubanio.com.evil.example.com/a.jpg');
    expect(resp.status).toBe(400);
  });

  it('1×1 的透明占位图转成 404，让前端统一走空封面分支', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('GIF89a', {
            headers: { 'Content-Type': 'image/gif', 'Content-Length': '43' },
          }),
      ),
    );
    const resp = await proxy('https://covers.openlibrary.org/b/isbn/9787532777150-L.jpg');
    expect(resp.status).toBe(404);
  });

  it('正常图片原样透传，并带上长缓存', async () => {
    const resp = await proxy('https://covers.openlibrary.org/b/isbn/9787532777150-L.jpg');
    expect(resp.status).toBe(200);
    expect(resp.headers.get('Cache-Control')).toContain('max-age=86400');
  });
});
