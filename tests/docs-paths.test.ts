// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8')
const preview = readFileSync(resolve(ROOT, 'preview.sh'), 'utf8')

describe('docs point to Cloudflare root', () => {
  it('README advertises the Cloudflare URL and no longer the GitHub Pages one', () => {
    expect(readme).toContain('https://book-excerpts-2dm.pages.dev/')
    expect(readme).not.toContain('https://luyansun66.github.io/book-excerpts/')
  })

  it('README OCR section documents Cloudflare Pages environment variables', () => {
    expect(readme).toContain('Workers & Pages')
    expect(readme).toContain('Environment variables')
  })

  it('preview.sh prints root URLs', () => {
    expect(preview).not.toContain('/book-excerpts/')
  })

  it('GitHub Pages workflow has been removed', () => {
    expect(existsSync(resolve(ROOT, '.github/workflows/deploy.yml'))).toBe(false)
  })
})
