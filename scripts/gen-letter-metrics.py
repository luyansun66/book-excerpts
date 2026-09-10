#!/usr/bin/env python3
"""时光信箱 / 引言卡：从源字体提取真实字形度量 → src/app/mailbox/letterMetrics.ts

为什么要生成：
  出处行要「作者末字的最右侧」与「摘录最右一列文字的最右侧」对齐，大编号要按
  字形真实中心对齐小房子。两者都必须用 **字形轮廓边界**（≈Illustrator 的
  visibleBounds），不能用 Em 文本框（geometricBounds）——Em 框左右带边距、
  上下带行距留白，视觉不准。

编码：
  每个码位 1 字节 = round(metric / step) + 1，0 表示该字体缺少此字形，
  1 表示字形存在但没有墨迹（如空格）。step 为量化精度，按峰值自动选取
  （华康 5/1024 em、Georgia 9/2048 em，均 ≈0.002 em，45px 字号下 ≤0.11px），
  并保证满宽字形（advance 1024 / 2048）不会被截断。

用法：python3 scripts/gen-letter-metrics.py
依赖：pip install fonttools
"""
from __future__ import annotations

import base64
import textwrap
from pathlib import Path

from fontTools.ttLib import TTFont

SRC_DIR = Path("书签字体")
OUT = Path("src/app/mailbox/letterMetrics.ts")

# 拉丁/标点的密集覆盖区间（两套字体共用同一份区间表）
LATIN_RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x2000, 0x206F)]
# CJK 区间：华康宋体在这些区间内 advance 恒为 1em，故只存墨迹右边界
CJK_RANGES = [
    (0x2E80, 0x2EFF),
    (0x3000, 0x303F),
    (0x4E00, 0x9FFF),
    (0xF900, 0xFAFF),
    (0xFF00, 0xFFEF),
]

HAN_TTF = "华康宋体W3-P.ttf"
GEO_TTF = "Georgia Italic.ttf"


class Font:
    def __init__(self, filename: str) -> None:
        font = TTFont(SRC_DIR / filename, lazy=True)
        self.cmap = font.getBestCmap()
        self.hmtx = font["hmtx"]
        self.glyf = font["glyf"]
        self.upem = font["head"].unitsPerEm

    def advance(self, cp: int) -> int | None:
        name = self.cmap.get(cp)
        return None if name is None else self.hmtx[name][0]

    def ink_right(self, cp: int) -> int | None:
        """字形轮廓最右侧 xMax；字形不存在返回 None，空格等无墨迹字形返回 0。"""
        name = self.cmap.get(cp)
        if name is None:
            return None
        glyph = self.glyf[name]
        if glyph.numberOfContours == 0:
            return 0
        return glyph.xMax


def pick_step(values: list[int | None]) -> int:
    """选一个不让字节溢出的最小步长（字节 = round(v/step)+1 ≤ 255）。"""
    peak = max((v for v in values if v is not None), default=0)
    return max(1, -(-peak // 254))  # ceil(peak / 254)


def pack(values: list[int | None], step: int) -> str:
    encoded = []
    for v in values:
        if v is None:
            encoded.append(0)
            continue
        q = round(v / step) + 1
        if q > 255:
            raise SystemExit(f"❌ 量化溢出：{v} / step {step} → {q} > 255")
        encoded.append(q)
    return base64.b64encode(bytes(encoded)).decode()


def dense(font: Font, ranges, attr: str) -> list[int | None]:
    values: list[int | None] = []
    for lo, hi in ranges:
        for cp in range(lo, hi + 1):
            values.append(font.advance(cp) if attr == "adv" else font.ink_right(cp))
    return values


def verify_cjk_advance(font: Font) -> int:
    """CJK 区间 advance 必须恒为同一值，否则「只存墨迹」的编码不成立。"""
    seen = {}
    for lo, hi in CJK_RANGES:
        for cp in range(lo, hi + 1):
            adv = font.advance(cp)
            if adv is not None:
                seen[adv] = seen.get(adv, 0) + 1
    if len(seen) != 1:
        counts = ", ".join(f"{a}×{n}" for a, n in sorted(seen.items()))
        raise SystemExit(f"❌ {HAN_TTF} CJK 区间 advance 不唯一（{counts}），需改为逐字存储")
    return next(iter(seen))


def ts_ranges(ranges) -> str:
    return ", ".join(f"[0x{lo:X}, 0x{hi:X}]" for lo, hi in ranges)


def ts_literal(s: str) -> str:
    """base64 字符串 → 多行 TS 字面量"""
    chunks = textwrap.wrap(s, width=96) or [""]
    if len(chunks) == 1:
        return f"'{chunks[0]}'"
    body = "\n".join(f"  '{c}' +" for c in chunks[:-1])
    return f"\n{body}\n  '{chunks[-1]}'"


def main() -> None:
    han = Font(HAN_TTF)
    geo = Font(GEO_TTF)
    cjk_adv = verify_cjk_advance(han)

    han_latin_adv_raw = dense(han, LATIN_RANGES, "adv")
    han_latin_ink_raw = dense(han, LATIN_RANGES, "ink")
    han_cjk_ink_raw = dense(han, CJK_RANGES, "ink")
    geo_latin_adv_raw = dense(geo, LATIN_RANGES, "adv")
    geo_latin_ink_raw = dense(geo, LATIN_RANGES, "ink")

    # 步长按峰值自动选取：华康 upem 1024 → 5，Georgia upem 2048 → 9，
    # 保证 1024 / 2048 这类满宽值不会被截断（精度 ≈0.002 em，45px 下 0.1px）
    han_step = pick_step(han_latin_adv_raw + han_latin_ink_raw + han_cjk_ink_raw)
    geo_step = pick_step(geo_latin_adv_raw + geo_latin_ink_raw)

    han_latin_adv = pack(han_latin_adv_raw, han_step)
    han_latin_ink = pack(han_latin_ink_raw, han_step)
    han_cjk_ink = pack(han_cjk_ink_raw, han_step)
    geo_latin_adv = pack(geo_latin_adv_raw, geo_step)
    geo_latin_ink = pack(geo_latin_ink_raw, geo_step)

    ts = TEMPLATE
    for key, value in {
        "__HAN_UPEM__": han.upem,
        "__GEO_UPEM__": geo.upem,
        "__CJK_ADV__": cjk_adv,
        "__LATIN_RANGES__": ts_ranges(LATIN_RANGES),
        "__CJK_RANGES__": ts_ranges(CJK_RANGES),
        "__HAN_STEP__": han_step,
        "__GEO_STEP__": geo_step,
        "__HAN_LATIN_ADV__": ts_literal(han_latin_adv),
        "__HAN_LATIN_INK__": ts_literal(han_latin_ink),
        "__HAN_CJK_INK__": ts_literal(han_cjk_ink),
        "__GEO_LATIN_ADV__": ts_literal(geo_latin_adv),
        "__GEO_LATIN_INK__": ts_literal(geo_latin_ink),
    }.items():
        ts = ts.replace(key, str(value))

    OUT.write_text(ts, encoding="utf-8")
    print(f"✅ {OUT}（{len(ts.encode('utf-8')) / 1024:.1f} KB）")


TEMPLATE = '''// ⚠️ 本文件由 scripts/gen-letter-metrics.py 自动生成，请勿手改。
// 重新生成：python3 scripts/gen-letter-metrics.py
//
// 字形真实度量（= Illustrator 的 visibleBounds 数据源）：
//   adv   advance width：字形原点到下一个字形原点的距离
//   xMax  字形墨迹（轮廓）最右侧，相对字形原点
// 出处行「作者末字右缘」对齐「摘录最右一列文字右缘」、大编号按字形真实中心对齐
// 小房子，都依赖这里的轮廓数据。Em 文本框（geometricBounds）左右带边距、上下带
// 行距留白，拿来做对齐视觉不准，禁止使用。

/** 度量单位为字体设计单位，除以此值换算为 em。 */
export const HAN_UPEM = __HAN_UPEM__;
export const GEO_ITALIC_UPEM = __GEO_UPEM__;

/** 华康宋体 CJK 区间内 advance 恒为该值（生成时逐个核验）。 */
export const HAN_CJK_ADV = __CJK_ADV__;

/** 密集覆盖区间；索引 = 区间累计偏移 + (码位 - 区间起点)。 */
export const LATIN_RANGES: ReadonlyArray<readonly [number, number]> = [__LATIN_RANGES__];
export const HAN_CJK_RANGES: ReadonlyArray<readonly [number, number]> = [__CJK_RANGES__];

/** 量化步长：数值 = (字节 - 1) × step；0 = 缺字形，1 = 有字形但无墨迹。 */
const HAN_STEP = __HAN_STEP__;
const GEO_STEP = __GEO_STEP__;

const HAN_LATIN_ADV = __HAN_LATIN_ADV__;
const HAN_LATIN_INK = __HAN_LATIN_INK__;
const HAN_CJK_INK = __HAN_CJK_INK__;
const GEO_LATIN_ADV = __GEO_LATIN_ADV__;
const GEO_LATIN_INK = __GEO_LATIN_INK__;

export interface GlyphBox {
  /** advance width，字体设计单位 */
  adv: number;
  /** 墨迹最右侧（轮廓 xMax），字体设计单位；无墨迹字形为 0 */
  xMax: number;
}

interface Table {
  ranges: ReadonlyArray<readonly [number, number]>;
  offsets: number[];
  /** null 表示该表所有字形共用 defaultAdv */
  adv: Uint8Array | null;
  ink: Uint8Array;
  step: number;
  defaultAdv: number;
}

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function build(
  ranges: ReadonlyArray<readonly [number, number]>,
  advEncoded: string | null,
  inkEncoded: string,
  step: number,
  defaultAdv: number,
): Table {
  const offsets: number[] = [];
  let total = 0;
  for (const [lo, hi] of ranges) {
    offsets.push(total);
    total += hi - lo + 1;
  }
  const adv = advEncoded === null ? null : decode(advEncoded);
  const ink = decode(inkEncoded);
  if (ink.length !== total || (adv !== null && adv.length !== total)) {
    throw new Error('letterMetrics：编码长度与区间不一致，请重新运行 scripts/gen-letter-metrics.py');
  }
  return { ranges, offsets, adv, ink, step, defaultAdv };
}

function lookup(table: Table, cp: number): GlyphBox | null {
  for (let i = 0; i < table.ranges.length; i++) {
    const [lo, hi] = table.ranges[i];
    if (cp < lo || cp > hi) continue;
    const idx = table.offsets[i] + (cp - lo);
    const advByte = table.adv === null ? 1 : table.adv[idx];
    const inkByte = table.ink[idx];
    // 字形是否存在看 advance；墨迹字节 0 说明该字形无轮廓（如空格）
    if (advByte === 0) return null;
    const adv = table.adv === null ? table.defaultAdv : (advByte - 1) * table.step;
    return { adv, xMax: inkByte === 0 ? 0 : (inkByte - 1) * table.step };
  }
  return null;
}

const HAN_LATIN = build(LATIN_RANGES, HAN_LATIN_ADV, HAN_LATIN_INK, HAN_STEP, 0);
const HAN_CJK = build(HAN_CJK_RANGES, null, HAN_CJK_INK, HAN_STEP, HAN_CJK_ADV);
const GEO_LATIN = build(LATIN_RANGES, GEO_LATIN_ADV, GEO_LATIN_INK, GEO_STEP, 0);

/** 华康宋体（摘录正文 / 中文书名 / 中文作者）字形度量。 */
export function hanGlyph(cp: number): GlyphBox | null {
  return lookup(HAN_LATIN, cp) ?? lookup(HAN_CJK, cp);
}

/** Georgia Italic（英文作者）字形度量。 */
export function georgiaItalicGlyph(cp: number): GlyphBox | null {
  return lookup(GEO_LATIN, cp);
}
'''

if __name__ == "__main__":
    main()
