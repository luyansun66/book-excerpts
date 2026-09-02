// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/fonts.css'), 'utf8')

describe('fonts.css for Cloudflare root deployment', () => {
  it('does not contain the old /book-excerpts/ prefix', () => {
    expect(css).not.toContain('/book-excerpts/')
  })

  it('loads every subset font from /fonts/', () => {
    const urls = [...css.matchAll(/url\((['"])(\/[^)'"]+\.woff2)\1\)/g)].map((m) => m[2])
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url.startsWith('/fonts/')).toBe(true)
  })
})
