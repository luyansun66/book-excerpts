import path from 'path'
import type { Connect, Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { onRequestGet as ocrTokenHandler } from './functions/api/ocr-token'

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
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
