// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import viteConfigExport from '../vite.config';

type PreviewMiddleware = (
  req: { method?: string; url?: string; headers: Record<string, string> },
  res: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(chunk: Uint8Array): void;
  },
  next: () => void,
) => void;

function pluginNamed(config: Record<string, any>, name: string) {
  const plugins = (config.plugins ?? []).flat(Infinity).filter(Boolean) as Array<Record<string, any>>;
  const plugin = plugins.find((item) => item.name === name);
  if (!plugin) throw new Error('missing plugin: ' + name);
  return plugin;
}

describe('手机预览的书籍 API', () => {
  it('vite preview 会拦截封面代理，而不是把请求交给静态文件服务', async () => {
    const config =
      typeof viteConfigExport === 'function'
        ? await (viteConfigExport as any)({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: true })
        : viteConfigExport;
    const plugin = pluginNamed(config, 'books-dev-api');

    let middleware: PreviewMiddleware | null = null;
    plugin.configurePreviewServer?.({
      middlewares: {
        use(handler: PreviewMiddleware) {
          middleware = handler;
        },
      },
    });
    expect(middleware).toBeTypeOf('function');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('JPEGDATA', { headers: { 'Content-Type': 'image/jpeg' } })),
    );

    let statusCode = 0;
    const headers: Record<string, string> = {};
    let body = Buffer.alloc(0);
    let nextCalled = false;
    let resolveEnd!: () => void;
    const ended = new Promise<void>((resolve) => {
      resolveEnd = resolve;
    });

    middleware!(
      {
        method: 'GET',
        url: '/api/books/cover?url=' + encodeURIComponent('https://covers.openlibrary.org/b/id/1-L.jpg'),
        headers: {},
      },
      {
        get statusCode() {
          return statusCode;
        },
        set statusCode(value: number) {
          statusCode = value;
        },
        setHeader(name, value) {
          headers[name.toLowerCase()] = value;
        },
        end(chunk) {
          body = Buffer.from(chunk);
          resolveEnd();
        },
      },
      () => {
        nextCalled = true;
      },
    );

    await ended;
    expect(nextCalled).toBe(false);
    expect(statusCode, body.toString()).toBe(200);
    expect(headers['content-type']).toBe('image/jpeg');
    expect(body.toString()).toBe('JPEGDATA');
  });
});
