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

  it('uses a fresh cache version to invalidate old caches', () => {
    expect(sw).toMatch(/const CACHE_NAME = 'zhai-lu-v10';/)
  })
})
