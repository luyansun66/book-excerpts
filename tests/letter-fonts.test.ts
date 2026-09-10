// @vitest-environment node
// 每日书签（时光信箱引言卡）字体：必须引用子集化后的 woff2，而不是原始 TTF/TTC。
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const template = readFileSync(resolve(process.cwd(), 'src/app/mailbox/letterTemplate.svg'), 'utf8')

const SUBSETS = [
  '华康宋体W3-P.woff2',
  'Georgia-Bold.woff2',
  'Georgia-Italic.woff2',
  'TrebuchetMS.woff2',
]

describe('每日书签字体：子集化 + woff2', () => {
  it('模板引用了全部子集字体', () => {
    for (const file of SUBSETS) {
      expect(template).toContain(`url("/fonts/${file}")`)
    }
  })

  it('不再引用原始 ttf/ttc', () => {
    expect(template).not.toMatch(/url\([^)]*\.(ttf|ttc)["')]/i)
  })

  it('woff2 文件已产出且带 wOF2 签名', () => {
    for (const file of SUBSETS) {
      const path = resolve(process.cwd(), 'public/fonts', file)
      expect(statSync(path).size).toBeGreaterThan(0)
      expect(readFileSync(path).subarray(0, 4).toString('latin1')).toBe('wOF2')
    }
  })

  it('中文字体子集明显小于原始 TTF', () => {
    const subset = statSync(resolve(process.cwd(), 'public/fonts/华康宋体W3-P.woff2')).size
    // 原始 华康宋体W3-P.ttf ≈ 2.75MB；子集 + woff2 后应低于 1.6MB
    expect(subset).toBeLessThan(1.6 * 1024 * 1024)
  })
})
