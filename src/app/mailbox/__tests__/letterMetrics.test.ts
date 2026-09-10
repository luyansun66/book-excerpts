// @vitest-environment node
// 字形度量表：数据由 scripts/gen-letter-metrics.py 从 书签字体/*.ttf 提取，
// 这里用 fontTools 读出的真值锚定「编码/解码」没有走样（允许量化误差 ≤ 半个步长）。
import { describe, expect, it } from 'vitest';
import {
  GEO_ITALIC_UPEM,
  HAN_CJK_ADV,
  HAN_UPEM,
  georgiaItalicGlyph,
  hanGlyph,
} from '../letterMetrics';

// 真值来源：fontTools 读 glyf.xMin/xMax + hmtx.advance，单位 = 字体设计单位
const GEO_CASES: Array<[string, number, number]> = [
  ['A', 1374, 1317],
  ['y', 1146, 1086],
  ['é', 966, 926],
  ['·', 572, 433],
  ['S', 1149, 1199], // 斜体悬挑：墨迹超出 advance
  ['…', 1653, 1497],
];

const HAN_CASES: Array<[string, number, number]> = [
  ['A', 682, 641],
  ['小', 1024, 964],
  ['只', 1024, 915],
  ['。', 1024, 364],
  ['…', 1024, 920],
  ['一', 1024, 907],
];

describe('letterMetrics（字形真实轮廓度量）', () => {
  it('upem 与源字体一致', () => {
    expect(HAN_UPEM).toBe(1024);
    expect(GEO_ITALIC_UPEM).toBe(2048);
    expect(HAN_CJK_ADV).toBe(1024);
  });

  it('Georgia Italic 的 advance 与墨迹右边界逐字对得上', () => {
    for (const [ch, adv, xMax] of GEO_CASES) {
      const g = georgiaItalicGlyph(ch.codePointAt(0)!);
      expect(g, `${ch} 应有字形`).not.toBeNull();
      expect(g!.adv, `${ch} advance`).toBeCloseTo(adv, -1);
      expect(g!.xMax, `${ch} 墨迹右边界`).toBeCloseTo(xMax, -1);
    }
  });

  it('华康宋体的 advance 与墨迹右边界逐字对得上', () => {
    for (const [ch, adv, xMax] of HAN_CASES) {
      const g = hanGlyph(ch.codePointAt(0)!);
      expect(g, `${ch} 应有字形`).not.toBeNull();
      expect(g!.adv, `${ch} advance`).toBeCloseTo(adv, -1);
      expect(g!.xMax, `${ch} 墨迹右边界`).toBeCloseTo(xMax, -1);
    }
  });

  it('空格有 advance 但没有墨迹（xMax = 0）', () => {
    expect(hanGlyph(0x20)).toEqual({ adv: 340, xMax: 0 });
    expect(georgiaItalicGlyph(0x20)!.xMax).toBe(0);
  });

  it('字体缺字时返回 null，交由调用方估算兜底', () => {
    expect(hanGlyph(0xfffe)).toBeNull();
    expect(georgiaItalicGlyph(0x4e00)).toBeNull();
  });

  it('墨迹右边界不等于 Em 框：标点/斜体的右缘明显内收或外悬', () => {
    // 「，」落在左侧 → 右侧留白 ≈ 0.69em，绝不能拿 advance 当可视右缘
    const comma = hanGlyph('，'.codePointAt(0)!)!;
    expect(comma.xMax).toBeLessThan(comma.adv * 0.35);
    // Georgia 斜体 'S' 的墨迹反而超出 advance
    expect(georgiaItalicGlyph('S'.codePointAt(0)!)!.xMax).toBeGreaterThan(
      georgiaItalicGlyph('S'.codePointAt(0)!)!.adv,
    );
  });
});
