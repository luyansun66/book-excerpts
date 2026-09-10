// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  buildSvgDataUrl,
  collectAssetUrls,
  inlineLetterAssets,
  letterImageFilename,
} from '../letterImage';

const SVG = [
  '<svg viewBox="0 0 1021.9 1527.7">',
  '<style>@font-face { font-family: "DFPSongW3-GB";',
  'src: url("/fonts/华康宋体W3-P.woff2") format("woff2"); }</style>',
  '<image xlink:href="/assets/bg01.jpg" width="1021.9" height="1527.7"/>',
  '<image xlink:href="/assets/bg01.jpg" width="1" height="1"/>',
  '</svg>',
].join('');

/** 假的资源解析器：返回可预测的 data URI，且保留原地址便于断言。 */
const fakeResolve = async (url: string) => `data:stub;base64,<${url}>`;

describe('collectAssetUrls', () => {
  it('finds /fonts and /assets references and de-duplicates them', () => {
    expect(collectAssetUrls(SVG)).toEqual([
      '/fonts/华康宋体W3-P.woff2',
      '/assets/bg01.jpg',
    ]);
  });

  it('ignores external URLs and inline data URIs', () => {
    const svg = '<image href="https://cdn.example.com/a.jpg"/><image href="data:image/png;base64,AAA"/>';
    expect(collectAssetUrls(svg)).toEqual([]);
  });

  it('returns nothing when the SVG has no external assets', () => {
    expect(collectAssetUrls('<svg><rect/></svg>')).toEqual([]);
  });
});

describe('inlineLetterAssets', () => {
  it('rewrites every reference to a data URI', async () => {
    const out = await inlineLetterAssets(SVG, fakeResolve);

    expect(out).toContain('url("data:stub;base64,</fonts/华康宋体W3-P.woff2>")');
    // 已无外链引用，只剩被内联成 data URI 的两处底图
    expect(out).not.toContain('href="/assets/bg01.jpg"');
    expect(out.match(/href="data:stub;base64,<\/assets\/bg01\.jpg>"/g)).toHaveLength(2);
  });

  it('resolves each distinct asset exactly once', async () => {
    const resolve = vi.fn(fakeResolve);
    await inlineLetterAssets(SVG, resolve);

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenCalledWith('/fonts/华康宋体W3-P.woff2');
    expect(resolve).toHaveBeenCalledWith('/assets/bg01.jpg');
  });

  it('does not re-scan substituted data URIs', async () => {
    const out = await inlineLetterAssets(SVG, fakeResolve);
    // 单次替换：注入的内容里即使含 /assets/… 也不会被二次替换
    expect(out).toContain('data:stub;base64,</assets/bg01.jpg>');
    expect(out).not.toContain('data:stub;base64,<data:stub');
  });

  it('keeps the SVG untouched and skips the resolver when there is nothing to inline', async () => {
    const resolve = vi.fn(fakeResolve);
    const svg = '<svg><rect/></svg>';
    await expect(inlineLetterAssets(svg, resolve)).resolves.toBe(svg);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe('buildSvgDataUrl', () => {
  it('produces a URL-encoded svg+xml data URL', () => {
    const url = buildSvgDataUrl('<svg><text>你好</text></svg>');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(url).not.toContain('<svg>');
    expect(url).toContain(encodeURIComponent('你好'));
  });
});

describe('letterImageFilename', () => {
  it('builds a dated filename for the daily card', () => {
    expect(letterImageFilename(47, '2026-09-09')).toBe('折角书摘-47-2026-09-09.png');
  });
});
