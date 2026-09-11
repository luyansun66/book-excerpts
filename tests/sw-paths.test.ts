// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sw = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

describe('Service Worker for Cloudflare root deployment', () => {
  it('does not reference the old /book-excerpts/ paths', () => {
    expect(sw).not.toContain('/book-excerpts/')
  })

  it('precaches root URLs only', () => {
    const block = sw.slice(sw.indexOf('const PRECACHE_URLS'), sw.indexOf('self.addEventListener'))
    expect(block).toContain("'/'")
    expect(block).toContain("'/index.html'")
    expect(block).toContain("'/manifest-pwa.json'")
    expect(block).toContain("'/icon.svg'")
    expect(block).toContain("'/icon-180.png'")
    expect(block).toContain("'/icon-512.png'")
  })

  // 这里只校验「缓存名带版本号」这个约束。写死具体版本号的话，每次改图标／资源
  // 升级缓存都会顺手把这个测试弄红，而它想拦的其实是「名字被改成不带版本号的固定值，
  // 旧缓存再也清不掉」这一类回退。升级版本号是发版时的固定动作，不靠这条断言兜底。
  it('uses a fresh cache version to invalidate old caches', () => {
    expect(sw).toMatch(/const CACHE_NAME = 'zhai-lu-v\d+';/)
  })

  it('不预缓存底图：装 SW 时下载会和点开信时的真实请求撞成两份并发下载', () => {
    const block = sw.slice(sw.indexOf('const PRECACHE_URLS'), sw.indexOf('self.addEventListener'))
    expect(block).not.toContain('/assets/')
    expect(block).not.toContain('.jpg')
    expect(block).not.toContain('.webp')
  })
})
