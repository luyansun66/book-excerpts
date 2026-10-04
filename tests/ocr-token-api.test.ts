// @vitest-environment node
// /api/ocr-token 是浏览器直连百度前唯一的服务端环节，盯三件事：
//   1. 票要缓存住 —— 每次识别都换票等于白白多一次往返，还会拖慢首字；
//   2. 响应头必须 no-store —— 被缓存层兜住的话，客户端会拿到已经作废的票；
//   3. 缺密钥/换票失败要说清楚是配错了，不能甩一句英文原文给用户。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, resetTokenCache } from '../functions/api/ocr-token';

const ENV = { BAIDU_OCR_API_KEY: 'ak', BAIDU_OCR_SECRET_KEY: 'sk' };

function installFetch(handler: (url: string) => unknown) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(handler(url)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return calls;
}

const call = (env: Record<string, string> = ENV) =>
  onRequestGet({ request: new Request('https://example.com/api/ocr-token'), env });

const TOKEN_OK = { access_token: 'tok-1', expires_in: 2592000 };

beforeEach(() => {
  resetTokenCache();
  vi.unstubAllGlobals();
});

describe('/api/ocr-token', () => {
  it('返回票和到期时间', async () => {
    installFetch(() => TOKEN_OK);

    const resp = await call();

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { token: string; expiresAt: number };
    expect(body.token).toBe('tok-1');
    // 到期时间按 expires_in 往后推，允许几秒误差
    expect(body.expiresAt).toBeGreaterThan(Date.now() + 2592000 * 1000 - 5000);
  });

  it('响应头带 no-store，避免缓存层兜住旧票', async () => {
    installFetch(() => TOKEN_OK);

    const resp = await call();

    expect(resp.headers.get('Cache-Control')).toBe('no-store');
  });

  it('第二次取票复用缓存，不再换票', async () => {
    const calls = installFetch(() => TOKEN_OK);

    const first = (await (await call()).json()) as { token: string };
    const second = (await (await call()).json()) as { token: string };

    expect(first.token).toBe('tok-1');
    expect(second.token).toBe('tok-1');
    expect(calls.filter((u) => u.includes('/oauth/2.0/token'))).toHaveLength(1);
  });

  it('换票请求带上 client_id / client_secret', async () => {
    const calls = installFetch(() => TOKEN_OK);

    await call();

    const oauth = calls.find((u) => u.includes('/oauth/2.0/token'))!;
    expect(oauth).toContain('client_id=ak');
    expect(oauth).toContain('client_secret=sk');
    expect(oauth).toContain('grant_type=client_credentials');
  });

  it('没配置密钥时返回 500 并说清要配哪个变量', async () => {
    installFetch(() => TOKEN_OK);

    const resp = await call({});

    expect(resp.status).toBe(500);
    expect((await resp.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('BAIDU_OCR_API_KEY'),
    });
  });

  it('失败一律用 500，不用 502/503/504', async () => {
    // 网关型状态码（502/503/504）在自定义域名上会被 Cloudflare 品牌错误页替换掉响应体，
    // 用户只看到一句「HTTP 502」，我们写的中文原因全丢。以前那个 OCR 代理函数踩过，
    // 这里钉住别再犯。
    installFetch(() => ({ error: 'invalid_client', error_description: 'unknown client id' }));

    const resp = await call();

    expect([502, 503, 504]).not.toContain(resp.status);
    expect(resp.status).toBe(500);
  });

  it('百度不认密钥时把原因透出来', async () => {
    installFetch(() => ({ error: 'invalid_client', error_description: 'unknown client id' }));

    const resp = await call();

    expect(resp.status).toBe(500);
    expect((await resp.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('unknown client id'),
    });
  });
});
