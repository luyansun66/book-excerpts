import path from 'path'
import type { Connect, Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { onRequestGet as ocrTokenHandler } from './functions/api/ocr-token'
import { proxyToSupabase } from './functions/api/supa/[[path]]'

/**
 * 本地跑 `vite dev` / `vite preview` 时，functions/ 里的 Cloudflare Function 不会执行
 * （那是 Pages 的运行时，只有线上和 wrangler 才认）。这里把 /api/ocr-token 挂到同一个
 * onRequestGet 上，好处是本地和线上共用一份实现 —— 换票、缓存、报错文案全都一致，
 * 不会出现「线上能取票、本地不能」这种只在一边复现的问题。
 *
 * 密钥从 .env.local 读。注意变量名不带 VITE_ 前缀，所以不会被注入到浏览器产物里，
 * 浏览器拿到的只有那张 30 天有效的票，拿不到 API Key / Secret Key。
 *
 * 顺带说明：识别本身不经过这里 —— 浏览器直连百度，比经边缘回源快 19 倍，
 * 原因写在 functions/api/ocr-token.ts 顶部。
 */
function ocrDevApi(env: Record<string, string>): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.method !== 'GET') return next()
    try {
      const request = new Request('http://localhost/api/ocr-token', { method: 'GET' })
      const response = await ocrTokenHandler({ request, env })
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: `本地取票接口出错：${(e as Error).message}` }))
    }
  }

  return {
    name: 'ocr-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/ocr-token', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ocr-token', handler)
    },
  }
}

/**
 * 本地跑 `vite dev` / `vite preview` 时把 /api/supa/* 接到 Pages Function 的同一份实现上。
 *
 * 为什么不能省：前端改成走同源反代之后，本地要是没有这个中间件，登录会直接 404 ——
 * 开发时反而比线上更难用。和 ocrDevApi 一样共用同一个 handler，本地和线上的转发逻辑
 * 就是同一份，不会出现「线上能登、本地不能」这类只在一边复现的问题。
 *
 * 挂在子路径上时 req.url 只剩后半截，所以要把 /api/supa 前缀拼回去。
 */
function supaDevApi(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res) => {
    try {
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined) continue
        headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      }

      // 云同步的载荷都是几 KB 的 JSON，整段读进来比在 dev 里搭流式转换省事
      const chunks: Buffer[] = []
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        for await (const chunk of req) chunks.push(chunk as Buffer)
      }

      const request = new Request(new URL('/api/supa' + (req.url ?? ''), 'http://localhost'), {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      })
      const response = await proxyToSupabase(request)

      res.statusCode = response.status
      response.headers.forEach((value, name) => {
        // 长度和编码交给 Node 按实际写出的字节重算
        if (name === 'content-length' || name === 'content-encoding') return
        res.setHeader(name, value)
      })
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: `本地 Supabase 反代出错：${(e as Error).message}` }))
    }
  }

  return {
    name: 'supa-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/supa', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/supa', handler)
    },
  }
}

export default defineConfig(({ mode }) => {
  // 第三个参数传空字符串 = 不做前缀过滤，BAIDU_OCR_* 这类服务端变量才拿得到
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: '/',
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
      ocrDevApi(env),
      supaDevApi(),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],

    // 手机预览时 IP 会随 DHCP 变化，书签里的 http://192.168.x.x:5173 说失效就失效。
    // 用 Bonjour 名字（<机器名>.local:5173）才稳定，但 Vite 默认只放行 localhost 和
    // IP，.local 一律回 403 空页面（看着就像「无法访问网页」）。这里放行 .local。
    // 只影响 dev/preview，不影响 build 产物。
    server: {
      allowedHosts: ['.local'],
    },
    preview: {
      allowedHosts: ['.local'],
    },
  }
})
