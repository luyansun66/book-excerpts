import { describe, expect, it } from 'vitest';
import { deriveCoverPalette, paletteFromColors } from '../shelf/coverPalette';

function solidPixels(
  background: [number, number, number, number],
  accent?: [number, number, number, number],
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(8 * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels.set(background, index);
  }
  if (accent) pixels.set(accent, 4);
  return pixels;
}

describe('cover-derived spine palette', () => {
  it('深色封面的书脊使用浅色文字', () => {
    const palette = deriveCoverPalette(solidPixels([21, 64, 82, 255], [198, 112, 44, 255]));
    expect(palette).not.toBeNull();
    expect(palette?.ink).toBe('#F4E9D4');
    expect(palette?.base).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('浅色封面的书脊自动切换成深色文字', () => {
    const palette = deriveCoverPalette(solidPixels([238, 228, 197, 255], [82, 121, 159, 255]));
    expect(palette?.ink).toBe('#241E18');
  });

  it('全透明封面不制造虚假配色', () => {
    expect(deriveCoverPalette(new Uint8ClampedArray(64))).toBeNull();
  });

  it('同一底色每次得到完全相同的材质色', () => {
    expect(paletteFromColors('#31566A')).toEqual(paletteFromColors('#31566A'));
  });
});
