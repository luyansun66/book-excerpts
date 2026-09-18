import fs from 'node:fs'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/**
 * 把 harfbuzz 的子集化 wasm 拷到 dist 根目录，供 Pages Function
 * `functions/api/fonts/subset.ts` 通过 /hb-subset.wasm 取用。
 * 不走 public/：public/ 的内容会原样入库，那等于仓库里存两份 622KB 二进制。
 */
function copyHbSubsetWasm(): Plugin {
  const source = path.resolve(__dirname, 'node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm')
  return {
    name: 'copy-hb-subset-wasm',
    apply: 'build',
    writeBundle(options) {
      if (!fs.existsSync(source)) {
        // 没有 wasm，端点必然 500。宁可构建时炸，也别部署完才发现。
        this.error(`缺少 ${source}：先跑 npm install harfbuzzjs`)
      }
      const outDir = options.dir ?? path.resolve(__dirname, 'dist')
      fs.mkdirSync(outDir, { recursive: true })
      fs.copyFileSync(source, path.join(outDir, 'hb-subset.wasm'))
    },
  }
}

export default defineConfig({
 base: '/',
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    copyHbSubsetWasm(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
