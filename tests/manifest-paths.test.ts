// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readManifest(file: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'))
}

describe.each(['public/manifest-pwa.json', 'public/manifest.json'])(
  '%s for Cloudflare root deployment',
  (file) => {
    const manifest = readManifest(file)

    it('uses root start_url and scope', () => {
      expect(manifest.start_url).toBe('/')
      expect(manifest.scope).toBe('/')
    })

    it('uses root icon paths', () => {
      expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual([
        '/icon.svg',
        '/icon-180.png',
        '/icon-512.png',
      ])
    })
  },
)
