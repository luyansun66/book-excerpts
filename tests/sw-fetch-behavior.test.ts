// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const SW_SOURCE = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

interface FetchRequest {
  mode?: string;
  destination: string;
  url: string;
  method?: string;
}

function makeResponse(contentType: string) {
  return {
    ok: true,
    headers: {
      get: () => contentType,
    },
    clone() {
      return this
    },
  }
}

function runServiceWorker(cache: {
  match?: () => Promise<unknown>;
  put?: () => Promise<void>;
  delete?: () => Promise<boolean>;
}) {
  const handlers = new Map<string, (event: any) => void>()
  const context: Record<string, unknown> = {
    console,
    URL,
    location: { origin: 'https://book-excerpts-2dm.pages.dev' },
    caches: {
      open: async () => cache,
      match: async () => (cache.match ? cache.match() : null),
    },
    fetch: async (_request: FetchRequest) => makeResponse('font/woff2'),
    skipWaiting() {},
    clients: { claim() {} },
  }
  context.self = context
  context.addEventListener = (type: string, callback: (event: any) => void) => {
    handlers.set(type, callback)
  }
  vm.runInNewContext(SW_SOURCE, context)

  return async function handleFetch(request: FetchRequest): Promise<unknown> {
    const fetchHandler = handlers.get('fetch')
    if (!fetchHandler) throw new Error('fetch handler not registered')
    let respondedPromise: Promise<unknown> | undefined
    const event = {
      request,
      respondWith(promise: Promise<unknown>) {
        respondedPromise = promise
      },
    }
    fetchHandler(event)
    if (!respondedPromise) throw new Error('respondWith was not called')
    return respondedPromise
  }
}

describe('Service Worker fetch behavior', () => {
  it('still returns the font response when writing to the cache fails', async () => {
    const handleFetch = runServiceWorker({
      match: async () => null,
      put: async () => {
        throw new Error('QuotaExceededError')
      },
    })

    const response = await handleFetch({
      method: 'GET',
      destination: 'font',
      url: 'https://book-excerpts-2dm.pages.dev/fonts/HuiWenMingChao.woff2',
    })

    expect(response).toMatchObject({ ok: true })
  })

  it('still returns the script response when writing to the cache fails', async () => {
    const handleFetch = runServiceWorker({
      match: async () => null,
      put: async () => {
        throw new Error('QuotaExceededError')
      },
    })

    const response = await handleFetch({
      method: 'GET',
      destination: 'script',
      url: 'https://book-excerpts-2dm.pages.dev/assets/index.js',
    })

    expect(response).toMatchObject({ ok: true })
  })

  it('does not cache an HTML fallback response as a font', async () => {
    let putCalls = 0
    const handleFetch = runServiceWorker({
      match: async () => null,
      put: async () => {
        putCalls += 1
      },
    })

    await handleFetch({
      method: 'GET',
      destination: 'font',
      url: 'https://book-excerpts-2dm.pages.dev/fonts/HuiWenMingChao.woff2',
    })

    expect(putCalls).toBe(0)
  })
})
