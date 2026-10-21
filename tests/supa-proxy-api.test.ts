// @vitest-environment node
// /api/supa/* 是前端登录、云同步唯一的出口，盯四件事：
//   1. 路径、查询串、方法、请求体要原样转给 Supabase，状态码和正文要原样带回来
//      —— supabase-js 靠 400 + invalid_credentials 判断「密码错了」，动一下就变成别的错；
//   2. 不能变成通用代理：目标固定 + 路径白名单，别的一律 404；
//   3. 上游给 502/503/504 时降级成 500 —— 这几个码在自定义域名上会被 Cloudflare
//      换成品牌错误页，用户侧只剩「HTTP 502」，真正的原因全丢；
//   4. 连不上上游时要说得出原因，不能甩一个空 500。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest, proxyToSupabase } from '../functions/api/supa/[[path]]';

const ORIGIN = 'https://vnbudeahnuysdbqxtzgk.supabase.co';

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  });
  return calls;
}

const call = (path: string, init?: RequestInit) =>
  onRequest({ request: new Request('https://luyansun.top' + path, init) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/api/supa 反代', () => {
  it('路径、查询串、方法、请求体原样转给 Supabase', async () => {
    const calls = stubFetch(
      () =>
        new Response(JSON.stringify({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const resp = await call('/api/supa/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'anon-key' },
      body: JSON.stringify({ email: 'a@b.com', password: 'secret' }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ORIGIN}/auth/v1/token?grant_type=password`);
    expect(calls[0].init.method).toBe('POST');
    const sent = new Headers(calls[0].init.headers);
    expect(sent.get('apikey')).toBe('anon-key');
    expect(sent.get('content-type')).toBe('application/json');
    expect(await new Response(calls[0].init.body as ReadableStream).text()).toBe(
      JSON.stringify({ email: 'a@b.com', password: 'secret' }),
    );

    // 状态码和正文原样 —— supabase-js 靠它们区分「密码错了」和其他错误
    expect(resp.status).toBe(400);
    expect(await resp.json()).toEqual({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
  });

  it('不带 Host / Origin / Referer 给上游', async () => {
    const calls = stubFetch(() => new Response('{}', { status: 200 }));

    await call('/api/supa/auth/v1/health', {
      headers: { Origin: 'https://luyansun.top', Referer: 'https://luyansun.top/settings' },
    });

    const sent = new Headers(calls[0].init.headers);
    expect(sent.get('host')).toBeNull();
    expect(sent.get('origin')).toBeNull();
    expect(sent.get('referer')).toBeNull();
  });

  it('白名单之外的路径一律 404，不当通用代理', async () => {
    const calls = stubFetch(() => new Response('{}', { status: 200 }));

    for (const path of ['/api/supa/', '/api/supa/evil', '/api/supa/auth/v2/token', '/api/supa/rest/v2/x']) {
      expect((await call(path)).status).toBe(404);
    }
    expect(calls).toHaveLength(0);
  });

  it('上游 502/503/504 降级成 500，原因留在正文里', async () => {
    stubFetch(() => new Response('upstream exploded', { status: 502 }));

    const resp = await call('/api/supa/rest/v1/books');

    expect(resp.status).toBe(500);
    const body = (await resp.json()) as { error: string; detail: string };
    expect(body.error).toContain('502');
    expect(body.detail).toContain('upstream exploded');
  });

  it('连不上上游时给出可读原因', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });

    const resp = await call('/api/supa/auth/v1/token');

    expect(resp.status).toBe(500);
    expect(((await resp.json()) as { error: string }).error).toContain('fetch failed');
  });

  it('proxyToSupabase 直接可用（本地 dev 中间件走的就是它）', async () => {
    stubFetch(() => new Response('{}', { status: 200 }));

    const resp = await proxyToSupabase(new Request('http://localhost/api/supa/rest/v1/books?select=*'));

    expect(resp.status).toBe(200);
  });
});
