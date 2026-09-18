// @vitest-environment node
// public/fonts/sfnt/ 是「按摘录子集化」的服务端原料：它必须和 UI 里的字体清单
// 一一对应，而且必须是 harfbuzz 读得进去的原始 sfnt（不是改名过的 woff2）。
// 这里守的就是这两件事 —— 缺一项，端点就会 404/500，用户看到的是导出慢回原点。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONTS } from '../src/app/components/sheets/shareCardExport';

const ROOT = process.cwd();
const SFNT_DIR = 'public/fonts/sfnt';
const INDEX = JSON.parse(readFileSync(resolve(ROOT, `${SFNT_DIR}/index.json`), 'utf8')) as Record<
  string,
  string
>;

/** UI 里除了「系统默认」之外，每款字体都要有对应的 sfnt。 */
const SFNT_FACES = FONTS.filter((font) => font.id !== 'system').map((font) => font.face);

function magicOf(file: string): string {
  const bytes = readFileSync(resolve(ROOT, `${SFNT_DIR}/${file}`));
  return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
}

describe('public/fonts/sfnt — 服务端子集化的原料', () => {
  it('index.json 的 face 与 UI 字体清单完全一致（多一个少一个都是 bug）', () => {
    expect(Object.keys(INDEX).sort()).toEqual([...SFNT_FACES].sort());
  });

  it('每个条目都指向真实存在的 sfnt，且扩展名与文件头一致', () => {
    for (const [face, file] of Object.entries(INDEX)) {
      const path = resolve(ROOT, `${SFNT_DIR}/${file}`);
      expect(existsSync(path), `${face} 缺文件 ${file}`).toBe(true);

      const magic = magicOf(file);
      // 'OTTO' = CFF/CID（.otf），\x00\x01\x00\x00 = glyf（.ttf）。
      expect(['\u0000\u0001\u0000\u0000', 'OTTO'], `${face} 不是合法的 sfnt（${magic}）`).toContain(magic);
      expect(file.endsWith(magic === 'OTTO' ? '.otf' : '.ttf')).toBe(true);
    }
  });

  it('体积落在合理区间：sfnt 是解压后的，比 woff2 大但不至于离谱', () => {
    for (const [face, file] of Object.entries(INDEX)) {
      const sfntSize = statSync(resolve(ROOT, `${SFNT_DIR}/${file}`)).size;
      expect(sfntSize, `${face} 太小，可能是改名过的 woff2`).toBeGreaterThan(100 * 1024);
      expect(sfntSize, `${face} 大得不像同一款字体`).toBeLessThan(64 * 1024 * 1024);
    }
  });

  it('生成脚本与实际产物同步：每个 face 都有源 woff2，重跑就能复现', () => {
    const script = readFileSync(resolve(ROOT, 'scripts/build-sfnt-fonts.py'), 'utf8');
    const block = script.slice(script.indexOf('FONTS = {'), script.indexOf('}', script.indexOf('FONTS = {')));
    const sources = [...block.matchAll(/'([A-Za-z]+)':\s*'([^']+)'/g)].map((match) => ({
      face: match[1],
      source: match[2],
    }));

    expect(sources.map((entry) => entry.face).sort()).toEqual([...SFNT_FACES].sort());
    for (const { source } of sources) {
      expect(existsSync(resolve(ROOT, `public/fonts/${source}`)), `缺源字体 ${source}`).toBe(true);
    }
  });

  it('整套字体的 @font-face 还在：那是子集不可用时的降级路径', () => {
    const fontsCss = readFileSync(resolve(ROOT, 'src/styles/fonts.css'), 'utf8');
    for (const face of SFNT_FACES) {
      expect(fontsCss).toContain(`font-family: '${face}'`);
    }
  });
});
