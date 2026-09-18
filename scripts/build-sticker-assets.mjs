#!/usr/bin/env node
// 由 src/app/components/sheets/stickers/*.svg 生成：
//   1) src/app/components/sheets/stickers/index.ts —— 贴纸清单 + 按需加载器
//   2) src/app/components/sheets/stickers/thumb/*.png —— 选择器用的 2x 缩略图蒙版
//
// 为什么要把贴纸拆开：20 个贴纸的 SVG 合计 768KB，而一次分享只用得到其中一个。
// 全塞进 ShareSheet chunk 等于让每个点「分享」的人先下完 768KB（首访慢的主因之一）。
// 选择器里 20 个 24px 的缩略图不需要矢量精度，用 PNG 蒙版（配合 background-color
// 上色，照样跟随主题的 currentColor），几十字节一张，跟清单一起内联进 chunk。
//
// SVG 文件按 `NN-<id>.svg` 命名，NN 就是选择器里的顺序（01 是默认贴纸，静态引入）。
// 新增贴纸：丢一个 `21-<id>.svg` 进来重跑本脚本。
//
// 缩略图靠本机 Chrome 无头截图（仓库没有 canvas/sharp/rsvg 之类的光栅化依赖）：
//   node scripts/build-sticker-assets.mjs             # 清单 + 缩略图
//   node scripts/build-sticker-assets.mjs --skip-thumbs
// 产物入库，SVG 不变就不用重跑。Chrome 路径可用 CHROME_BIN 覆盖。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'src/app/components/sheets/stickers');
const THUMB_DIR = path.join(DIR, 'thumb');

/** 缩略图的像素边长：选择器里显示 24px，出 2x 供视网膜屏。 */
const THUMB_PX = 48;

/**
 * 蒙版的 alpha 量化档数。蒙版只看 alpha，灰度通道恒为 0，所以把 RGBA 压成
 * 灰度+alpha、alpha 从 256 档降到 8 档，20 张缩略图从 32KB 降到 14KB
 * （这些字节是 base64 内联进 chunk 的，省下来都是首访的下载量）。
 * 8 档 = 3bit alpha：24px 的剪影边缘只差一档，肉眼分不出来，但比二值化
 * （没有抗锯齿、边缘发锯齿）安全得多。
 */
const THUMB_ALPHA_LEVELS = 8;

/** 第一个贴纸是默认贴纸（卡片首帧就要有它），静态引入避免闪一下；其余走独立 chunk。 */
const EAGER_COUNT = 1;

// ─── 找 Chrome ───────────────────────────────────────────────────────────────
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const patterns = [
    ['chromium_headless_shell-*', 'chrome-headless-shell-*/chrome-headless-shell'],
    ['chromium-*', 'chrome-mac-*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'],
  ];
  const hits = [];
  for (const [dirPat, filePat] of patterns) {
    if (!fs.existsSync(cache)) break;
    for (const dir of fs.readdirSync(cache)) {
      if (!globMatch(dirPat, dir)) continue;
      for (const inner of fs.readdirSync(path.join(cache, dir))) {
        if (!globMatch(filePat.split('/')[0], inner)) continue;
        const rest = filePat.split('/').slice(1).join('/');
        const bin = path.join(cache, dir, inner, rest);
        if (fs.existsSync(bin)) hits.push(bin);
      }
    }
  }
  // 先 headless shell（启动快），再找系统 Chrome。
  const system = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter((p) => fs.existsSync(p));
  const found = [...hits, ...system][0];
  if (!found) {
    throw new Error('找不到 Chrome。装一个 Chrome，或用 CHROME_BIN=<路径> 指定。');
  }
  return found;
}

function globMatch(pattern, name) {
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return re.test(name);
}

// ─── 读 SVG 清单 ─────────────────────────────────────────────────────────────
function readStickers() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.svg'))
    .sort()
    .map((file) => {
      const m = /^(\d+)-([a-z0-9-]+)\.svg$/.exec(file);
      if (!m) throw new Error(`文件名不符合 NN-<id>.svg：${file}`);
      const id = m[2];
      return {
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        order: Number(m[1]),
        svg: fs.readFileSync(path.join(DIR, file), 'utf8'),
        source: file,
      };
    });
}

// ─── 出缩略图 ────────────────────────────────────────────────────────────────
// 蒙版只用到 alpha 通道：把图形画成不透明黑、背景透明，再用 background-color 上色。
// 盒子尺寸和 <svg width="100%" height="100%"> + preserveAspectRatio="xMidYMid meet"
// 的组合跟 ShareSheet 里的缩略图容器完全一致，所以裁切/留白跟原来一模一样。
function thumbWrapper(svg) {
  return `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;width:${THUMB_PX}px;height:${THUMB_PX}px;background:transparent;overflow:hidden}
  #w{width:${THUMB_PX}px;height:${THUMB_PX}px;color:#000;display:block;line-height:0}
  #w svg{width:${THUMB_PX}px;height:${THUMB_PX}px;display:block}
</style>
<div id="w">${svg}</div>
`;
}

function renderThumbs(stickers) {
  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sticker-thumbs-'));
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  let total = 0;
  for (const s of stickers) {
    const html = path.join(tmp, `${s.id}.html`);
    const png = path.join(THUMB_DIR, `${s.id}.png`);
    fs.writeFileSync(html, thumbWrapper(s.svg), 'utf8');
    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--default-background-color=00000000',
        `--window-size=${THUMB_PX},${THUMB_PX}`,
        `--screenshot=${png}`,
        `file://${html}`,
      ],
      { stdio: 'pipe' }
    );
    squeezeThumb(png);
    const size = fs.statSync(png).size;
    total += size;
    console.log(`  ${s.id.padEnd(10)} ${String(size).padStart(6)} B`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`缩略图合计 ${(total / 1024).toFixed(1)} KB（${stickers.length} 张，内联进 chunk）`);
  return total;
}

// ─── 压缩略图 ────────────────────────────────────────────────────────────────
// Chrome 只会吐 RGBA8。蒙版用不到 RGB，压成「灰度 0 + alpha」能省掉四分之三的
// 通道数据，再把 alpha 量化到 8 档还能再省一截。PIL 缺席就保留原图，只是大一点。
const SQUEEZE = `
import sys
from PIL import Image

src, dst, levels = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert("RGBA")
alpha = im.getchannel("A")
if levels < 256:
    step = 255.0 / (levels - 1)
    alpha = alpha.point(lambda v: int(round(round(v / step) * step)))
Image.merge("LA", (Image.new("L", im.size, 0), alpha)).save(dst, optimize=True)
`;

function squeezeThumb(png) {
  try {
    execFileSync('python3', ['-c', SQUEEZE, png, png, String(THUMB_ALPHA_LEVELS)], { stdio: 'pipe' });
  } catch (e) {
    console.warn(`  （压缩跳过，未安装 Pillow：pip install pillow）`);
  }
}

// ─── 写 index.ts ─────────────────────────────────────────────────────────────
function writeIndex(stickers) {
  const eager = stickers.slice(0, EAGER_COUNT);
  const lazy = stickers.slice(EAGER_COUNT);

  const imports = [
    ...stickers.map((s) => `import ${s.id}Thumb from './thumb/${s.id}.png';`),
    ...eager.map((s) => `import ${s.id}Svg from './${s.source}?raw';`),
  ].join('\n');

  const rows = stickers.map((s, i) => {
    const eagerRow = i < EAGER_COUNT;
    const load = eagerRow
      ? `() => Promise.resolve(${s.id}Svg)`
      : `() => import('./${s.source}?raw').then((m) => m.default)`;
    return `  { id: '${s.id}', name: '${s.name}', thumb: ${s.id}Thumb, load: ${load} },`;
  });

  const eagerMap = eager.map((s) => `${s.id}: ${s.id}Svg`).join(', ');

  const body = `// Auto-generated by scripts/build-sticker-assets.mjs — do not edit manually
//
// 贴纸一贴一个模块。之前 20 个贴纸的 SVG 字符串合计 768KB，全被打进 ShareSheet
// chunk —— 每个点「分享」的人都要先下完它们，哪怕只用得到卡片上那一个。
// 现在：
//   选择器  → thumb/*.png（几十字节的蒙版，配合 background-color 上色，跟随主题）
//   卡片    → 只 load() 当前选中的那一个；除默认贴纸外都是独立 chunk
// ${eager.map((s) => s.id).join(' / ')} 静态引入（默认贴纸，卡片首帧就要用）。

${imports}

export interface StickerOption {
  id: string;
  name: string;
}

export interface Sticker extends StickerOption {
  /** 选择器里的缩略图。是 PNG 蒙版：上色靠容器的 background-color，不是 fill。 */
  thumb: string;
  /** 取这张贴纸的 SVG 几何。除默认贴纸外都是单独一个 chunk。 */
  load: () => Promise<string>;
}

export const STICKERS: Sticker[] = [
${rows.join('\n')}
];

/** 已经静态打进来的贴纸（默认那几张）。拿不到就是 null，调用方去 await load()。 */
export function eagerStickerSvg(id: string): string | null {
  return EAGER[id] ?? null;
}

const EAGER: Record<string, string> = { ${eagerMap} };

export function findSticker(id: string): Sticker | undefined {
  return STICKERS.find((s) => s.id === id);
}

/** 按 id 取 SVG。id 不认识就抛错 —— 这是代码写错了，不是运行时的正常分支。 */
export function loadStickerSvg(id: string): Promise<string> {
  const sticker = findSticker(id);
  if (!sticker) return Promise.reject(new Error(\`未知贴纸：\${id}\`));
  return sticker.load();
}
`;
  fs.writeFileSync(path.join(DIR, 'index.ts'), body, 'utf8');
  console.log(`写出 index.ts：${stickers.length} 张贴纸（${eager.length} 张静态，${lazy.length} 张按需）`);
}

// ─── main ───────────────────────────────────────────────────────────────────
const stickers = readStickers();
if (!stickers.length) throw new Error(`${DIR} 下没有 SVG`);
console.log(`共 ${stickers.length} 张贴纸，SVG 合计 ${(stickers.reduce((n, s) => n + Buffer.byteLength(s.svg), 0) / 1024).toFixed(0)} KB`);
writeIndex(stickers);
if (!process.argv.includes('--skip-thumbs')) renderThumbs(stickers);
