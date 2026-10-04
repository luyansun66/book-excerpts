// @vitest-environment jsdom
// 识别改回「浏览器直连百度」之后，客户端要自己管票和降级，这里盯四件事：
//   1. 票从 /api/ocr-token 取，取到后识别请求直连百度（不再绕服务端）；
//   2. 票在本地缓存住，短时间连拍多张不会反复取票；
//   3. 票被百度判失效（110）时换一张重来，而不是直接把错误抛给用户；
//   4. 各种失败都翻译成中文提示，不把百度原文糊到界面上。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN_STORAGE_KEY = 'ocr-access-token';

type OcrModule = typeof import('../ocr');
let recognizeText: OcrModule['recognizeText'];

/** 只用得上 ok / status / json，不依赖真实 Response 实现。 */
function res(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const TOKEN = { token: 'tok-1', expiresAt: Date.now() + 24 * 3600 * 1000 };

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: typeof init.body === 'string' ? init.body : undefined });
    return handler(url, init);
  });
  return calls;
}

const countBy = (calls: { url: string }[], part: string) =>
  calls.filter((c) => c.url.includes(part)).length;

beforeEach(async () => {
  // 票会落到 localStorage，用例之间必须清干净：不清的话上一个用例存的票会被下一个用例
  // 当成「手上已有的票」复用，取票次数就对不上了。
  localStorage.clear();
  vi.resetModules();
  ({ recognizeText } = await import('../ocr'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recognizeText — 浏览器直连百度', () => {
  it('先从本站取票，再带着票直连百度', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/api/ocr-token')) return res(TOKEN);
      return res({ words_result: [{ words: '第一行' }, { words: '第二行' }] });
    });

    await expect(recognizeText('data:image/jpeg;base64,AAA')).resolves.toBe('第一行\n第二行');

    expect(calls[0].url).toContain('/api/ocr-token');
    const ocr = calls[1];
    expect(ocr.url).toContain('aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic');
    expect(ocr.url).toContain('access_token=tok-1');
    // 发给百度的是裸 base64，不能带 data URL 前缀
    expect(ocr.body).toBe('image=AAA');
  });

  it('票缓存在本地，连拍第二张不再取票', async () => {
    const calls = stubFetch((url) =>
      url.includes('/api/ocr-token') ? res(TOKEN) : res({ words_result: [{ words: '字' }] }),
    );

    await recognizeText('AAA');
    await recognizeText('BBB');

    expect(countBy(calls, '/api/ocr-token')).toBe(1);
    expect(countBy(calls, 'accurate_basic')).toBe(2);
  });

  it('票写进 localStorage，重开 App 也能直接用（不用再等跨境取票）', async () => {
    const calls = stubFetch((url) =>
      url.includes('/api/ocr-token') ? res(TOKEN) : res({ words_result: [{ words: '字' }] }),
    );

    await recognizeText('AAA');
    expect(JSON.parse(localStorage.getItem(TOKEN_STORAGE_KEY)!).token).toBe('tok-1');

    // 模拟重开 App：模块级内存缓存没了，但 localStorage 还在
    vi.resetModules();
    ({ recognizeText } = await import('../ocr'));
    calls.length = 0;

    await expect(recognizeText('BBB')).resolves.toBe('字');

    expect(countBy(calls, '/api/ocr-token')).toBe(0);
    expect(calls[0].url).toContain('access_token=tok-1');
  });

  it('localStorage 里的票已过期时忽略它，重新取票', async () => {
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({ token: 'tok-expired', expiresAt: Date.now() - 1000 }),
    );
    let tokenRound = 0;
    const calls = stubFetch((url) => {
      if (url.includes('/api/ocr-token')) {
        tokenRound += 1;
        return res({ token: `tok-${tokenRound}`, expiresAt: Date.now() + 3600_000 });
      }
      return res({ words_result: [{ words: '字' }] });
    });

    await expect(recognizeText('AAA')).resolves.toBe('字');

    expect(countBy(calls, '/api/ocr-token')).toBe(1);
    expect(calls.some((c) => c.url.includes('access_token=tok-expired'))).toBe(false);
  });

  it('localStorage 里的票写坏了也不影响识别', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, '{ 这不是 JSON');
    const calls = stubFetch((url) =>
      url.includes('/api/ocr-token') ? res(TOKEN) : res({ words_result: [{ words: '字' }] }),
    );

    await expect(recognizeText('AAA')).resolves.toBe('字');

    expect(countBy(calls, '/api/ocr-token')).toBe(1);
  });

  it('高精度版报错时退到通用版', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/api/ocr-token')) return res(TOKEN);
      if (url.includes('accurate_basic')) return res({ error_code: 282000, error_msg: 'internal error' });
      return res({ words_result: [{ words: '通用版结果' }] });
    });

    await expect(recognizeText('AAA')).resolves.toBe('通用版结果');

    expect(countBy(calls, 'accurate_basic')).toBe(1);
    expect(countBy(calls, 'general_basic')).toBe(1);
  });

  it('票被判失效时换一张重来，用户侧无感', async () => {
    let tokenRound = 0;
    const calls = stubFetch((url) => {
      if (url.includes('/api/ocr-token')) {
        tokenRound += 1;
        return res({ token: `tok-${tokenRound}`, expiresAt: Date.now() + 3600_000 });
      }
      return url.includes('tok-1')
        ? res({ error_code: 110, error_msg: 'Access token invalid' })
        : res({ words_result: [{ words: '重试成功' }] });
    });

    await expect(recognizeText('AAA')).resolves.toBe('重试成功');

    expect(countBy(calls, '/api/ocr-token')).toBe(2);
  });

  it('换票后仍被判失效时提示去检查密钥', async () => {
    stubFetch((url) =>
      url.includes('/api/ocr-token')
        ? res(TOKEN)
        : res({ error_code: 111, error_msg: 'Access token expired' }),
    );

    await expect(recognizeText('AAA')).rejects.toThrow(/API Key/);
  });

  it('额度用完时给出中文提示，而不是百度的英文原文', async () => {
    stubFetch((url) =>
      url.includes('/api/ocr-token')
        ? res(TOKEN)
        : res({ error_code: 17, error_msg: 'Open api daily request limit reached' }),
    );

    await expect(recognizeText('AAA')).rejects.toThrow('今日识别额度已用完，请明天再试');
  });

  it('两条接口都没识别出文字时明确失败', async () => {
    stubFetch((url) => (url.includes('/api/ocr-token') ? res(TOKEN) : res({ words_result: [] })));

    await expect(recognizeText('AAA')).rejects.toThrow('未能识别出任何文字');
  });

  it('识别请求超时给出可读提示', async () => {
    stubFetch((url) => {
      if (url.includes('/api/ocr-token')) return res(TOKEN);
      throw new DOMException('aborted due to timeout', 'TimeoutError');
    });

    await expect(recognizeText('AAA')).rejects.toThrow('识别服务响应超时，请重试');
  });

  it('取票接口失败时把服务端的原因透出来', async () => {
    stubFetch(() => res({ error: 'OCR 未配置：请设置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY 后重新部署。' }, 500));

    await expect(recognizeText('AAA')).rejects.toThrow(/BAIDU_OCR_API_KEY/);
  });
});
