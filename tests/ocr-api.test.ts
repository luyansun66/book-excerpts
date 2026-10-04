// @vitest-environment node
// /api/ocr 的行为验证，重点在三件容易坏的事：
//   1. 票缓存有没有生效（每次识别都去换票 = 白白多一次往返，还会拖慢首字）；
//   2. 票失效时会不会换新票重试，而不是把 110 直接甩给用户；
//   3. 高精度版报错时会不会退到通用版（这条降级链以前在前端，搬到服务端后最容易漏）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost, resetTokenCache } from '../functions/api/ocr';

const ENV = { BAIDU_OCR_API_KEY: 'ak', BAIDU_OCR_SECRET_KEY: 'sk' };
const IMAGE = 'ZmFrZS1pbWFnZQ==';

/** 记录每次 fetch，按 URL 决定返回什么；handler 抛错就当作网络请求失败。 */
function installFetch(handler: (url: string, body: string) => unknown) {
  const calls: { url: string; body: string }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? init.body : '';
    calls.push({ url, body });
    return new Response(JSON.stringify(handler(url, body)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return calls;
}

const TOKEN_OK = { access_token: 'tok-1', expires_in: 2592000 };

function post(payload: unknown) {
  return onRequestPost({
    request: new Request('https://example.com/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }),
    env: ENV,
  });
}

const countBy = (calls: { url: string }[], part: string) =>
  calls.filter((c) => c.url.includes(part)).length;

beforeEach(() => {
  resetTokenCache();
  vi.unstubAllGlobals();
});

describe('/api/ocr', () => {
  it('识别成功时按行返回文字', async () => {
    const calls = installFetch((url) =>
      url.includes('/oauth/2.0/token')
        ? TOKEN_OK
        : { words_result: [{ words: '第一行' }, { words: '第二行' }] },
    );

    const resp = await post({ image: `data:image/jpeg;base64,${IMAGE}` });

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ words: ['第一行', '第二行'] });
    // 发给百度的是裸 base64，不能带 data URL 前缀
    const ocrCall = calls.find((c) => c.url.includes('accurate_basic'))!;
    expect(ocrCall.body).toBe(`image=${encodeURIComponent(IMAGE)}`);
    expect(ocrCall.body).not.toContain('data:image');
  });

  it('第二次识别复用缓存里的票，不再换票', async () => {
    const calls = installFetch((url) =>
      url.includes('/oauth/2.0/token') ? TOKEN_OK : { words_result: [{ words: '字' }] },
    );

    await post({ image: IMAGE });
    await post({ image: IMAGE });

    expect(countBy(calls, '/oauth/2.0/token')).toBe(1);
    expect(countBy(calls, 'accurate_basic')).toBe(2);
  });

  it('票过期（110）时换新票重试，用户侧仍然成功', async () => {
    let tokenRound = 0;
    const calls = installFetch((url) => {
      if (url.includes('/oauth/2.0/token')) {
        tokenRound += 1;
        return { access_token: `tok-${tokenRound}`, expires_in: 2592000 };
      }
      // 第一次带着旧票调接口 → 百度说过期；换票之后才给结果
      return url.includes('tok-1')
        ? { error_code: 110, error_msg: 'Access token invalid or no longer valid' }
        : { words_result: [{ words: '重试成功' }] };
    });

    const resp = await post({ image: IMAGE });

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ words: ['重试成功'] });
    expect(countBy(calls, '/oauth/2.0/token')).toBe(2);
  });

  it('两张票都被判失效时，提示去检查密钥而不是抛百度原文', async () => {
    installFetch((url) =>
      url.includes('/oauth/2.0/token')
        ? TOKEN_OK
        : { error_code: 111, error_msg: 'Access token expired' },
    );

    const resp = await post({ image: IMAGE });

    expect(resp.status).toBe(500);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toContain('API Key');
    expect(body.error).not.toContain('Access token');
  });

  it('高精度版报错时退到通用版', async () => {
    const calls = installFetch((url) => {
      if (url.includes('/oauth/2.0/token')) return TOKEN_OK;
      if (url.includes('accurate_basic')) return { error_code: 282000, error_msg: 'internal error' };
      return { words_result: [{ words: '通用版结果' }] };
    });

    const resp = await post({ image: IMAGE });

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ words: ['通用版结果'] });
    expect(countBy(calls, 'accurate_basic')).toBe(1);
    expect(countBy(calls, 'general_basic')).toBe(1);
  });

  it('两条接口都没识别出文字时给出明确文案', async () => {
    installFetch((url) =>
      url.includes('/oauth/2.0/token') ? TOKEN_OK : { words_result: [] },
    );

    const resp = await post({ image: IMAGE });

    expect(resp.status).toBe(422);
    expect((await resp.json()) as { error: string }).toMatchObject({
      error: 'OCR 识别失败：未能识别出任何文字',
    });
  });

  it('没配置密钥时拒绝服务并说清要配哪个变量', async () => {
    installFetch(() => TOKEN_OK);

    const resp = await onRequestPost({
      request: new Request('https://example.com/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: IMAGE }),
      }),
      env: {},
    });

    expect(resp.status).toBe(500);
    expect((await resp.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('BAIDU_OCR_API_KEY'),
    });
  });

  it('百度这边超时时返回 422 和「识别服务响应超时」，而不是把 AbortError 抛出去', async () => {
    // 真实触发场景：跨境链路上 900KB 的整页图，百度那一次调用超过 25s。
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('/oauth/2.0/token')) {
        return new Response(JSON.stringify(TOKEN_OK), { headers: { 'Content-Type': 'application/json' } });
      }
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });

    const resp = await post({ image: IMAGE });

    expect(resp.status).toBe(422);
    expect(await resp.json()).toEqual({ error: '识别服务响应超时，请重试' });
  });

  it('业务错误不用 502/504：那些状态码在自定义域名上会被 Cloudflare 品牌错误页顶掉', async () => {
    // luyansun.top 实测过：同一个 502，pages.dev 能看到 {"error":"…图片格式不支持"}，
    // 自定义域名只剩 Cloudflare 的 HTML 错误页，用户看到的是「HTTP 502」而不是原因。
    // 所以这条测试盯的是「响应体必须还能被我们控制」这件事本身。
    installFetch((url) =>
      url.includes('/oauth/2.0/token') ? TOKEN_OK : { error_code: 216201, error_msg: 'image format error' },
    );

    const resp = await post({ image: IMAGE });

    expect(resp.status).toBe(422);
    expect(resp.headers.get('content-type')).toContain('application/json');
    expect(await resp.json()).toEqual({ error: 'OCR 识别失败：图片格式不支持' });
  });

  it('空图片与非法 JSON 都返回 400', async () => {
    installFetch(() => TOKEN_OK);

    const empty = await post({});
    expect(empty.status).toBe(400);

    const broken = await post('not-json');
    expect(broken.status).toBe(400);
  });

  it('图片过大时返回 413，不浪费一次换票和上传', async () => {
    const calls = installFetch((url) => (url.includes('/oauth') ? TOKEN_OK : {}));

    const resp = await post({ image: 'A'.repeat(3 * 1024 * 1024 + 1) });

    expect(resp.status).toBe(413);
    expect(calls).toHaveLength(0);
  });
});
