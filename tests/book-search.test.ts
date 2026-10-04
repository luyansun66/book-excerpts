// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

// 按作者搜的假数据：豆瓣返回的是这个作者写的书，书名里**没有**作者名；
// Google 那条的书名里恰好带作者名。改之前，标题过滤会留下 Google、把豆瓣全删掉。
const DOUBAN_AUTHOR_PAYLOAD = [
  {
    title: '挪威的森林',
    url: 'https://book.douban.com/subject/27200257/',
    pic: 'https://img2.doubanio.com/view/subject/s/public/s34412041.jpg',
    author_name: '[日] 村上春树',
    year: '2018',
    type: 'b',
    id: '27200257',
  },
];

const GOOGLE_AUTHOR_PAYLOAD = {
  items: [{ volumeInfo: { title: '村上春树作品集', authors: ['Haruki Murakami'], publishedDate: '2015-01-01' } }],
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

  it('豆瓣的超时预算比其余源更长，否则中文查询会退回没有封面的老样子', async () => {
    const src = readFileSync(resolve(process.cwd(), 'functions/api/books/search.ts'), 'utf8');
    const base = Number(/const SOURCE_TIMEOUT_MS = (\d+);/.exec(src)?.[1]);
    const douban = Number(/const DOUBAN_TIMEOUT_MS = (\d+);/.exec(src)?.[1]);

    expect(base).toBeGreaterThan(0);
    expect(douban).toBeGreaterThan(base);
    // 豆瓣那次请求必须真的用上这个预算，而不是又退回通用值
    expect(src).toContain('fetchWithTimeout(url, DOUBAN_TIMEOUT_MS, DOUBAN_HEADERS)');
  });

  it('debug 里能看到三个源各自的响应情况', async () => {
    const data = await search('昨日的世界');
    expect(data.debug.douban.ok).toBe(true);
    expect(data.debug.google.ok).toBe(true);
    expect(data.debug.openlibrary.ok).toBe(true);
  });
});

describe('按作者搜：豆瓣不能被标题过滤吃掉', () => {
  beforeEach(() => {
    cacheStore.clear();
  });

  function authorFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('book.douban.com/j/subject_suggest')) {
          return new Response(JSON.stringify(DOUBAN_AUTHOR_PAYLOAD));
        }
        if (url.includes('googleapis.com')) {
          // Google 书名里带「村上春树」，只按书名过滤时它会活下来
          return new Response(JSON.stringify(GOOGLE_AUTHOR_PAYLOAD));
        }
        if (url.includes('openlibrary.org')) return new Response(JSON.stringify({ docs: [] }));
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  }

  it('查询词命中作者时，豆瓣结果保留下来并排在前面', async () => {
    authorFetch();
    const data = await search('村上春树');

    const douban = data.results.filter((r: any) => r.source === 'douban');
    expect(douban.map((r: any) => r.title)).toEqual(['挪威的森林']);
    // 中文查询下豆瓣仍然排最前（它不是靠书名命中的，不能被排到 Google 后面）
    expect(data.results[0].source).toBe('douban');
  });

  it('豆瓣超时的那一次不写缓存，下次搜索能自己补回来', async () => {
    // 第一次：豆瓣挂掉，结果里没有豆瓣
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('book.douban.com')) throw new Error('douban timeout');
        if (url.includes('googleapis.com')) return new Response(JSON.stringify(GOOGLE_AUTHOR_PAYLOAD));
        return new Response(JSON.stringify({ docs: [] }));
      }),
    );

    const first = await onRequestGet({
      request: new Request('https://x.pages.dev/api/books/search?q=%E6%9D%91%E4%B8%8A%E6%98%A5%E6%A0%91'),
      env: {},
    });
    const firstData = (await first.json()) as any;
    expect(firstData.results.some((r: any) => r.source === 'douban')).toBe(false);
    // 残缺结果不该进缓存 —— 否则同一个词会连着 5 分钟都没有豆瓣
    expect(cacheStore.size).toBe(0);

    // 第二次：豆瓣恢复。若上一步错误地写了缓存，这里拿到的仍是残缺结果
    authorFetch();
    const second = await onRequestGet({
      request: new Request('https://x.pages.dev/api/books/search?q=%E6%9D%91%E4%B8%8A%E6%98%A5%E6%A0%91'),
      env: {},
    });
    const secondData = (await second.json()) as any;
    expect(secondData.results.some((r: any) => r.source === 'douban')).toBe(true);
  });

  it('三个源都正常时才写缓存', async () => {
    authorFetch();
    await onRequestGet({
      request: new Request('https://x.pages.dev/api/books/search?q=%E6%9D%91%E4%B8%8A%E6%98%A5%E6%A0%91'),
      env: {},
    });
    expect(cacheStore.size).toBe(1);
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
