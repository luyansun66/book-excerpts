#!/usr/bin/env python3
# 分享卡片「按摘录文字子集化」的服务端字体 —— public/fonts/*.woff2 → public/fonts/sfnt/*
#
# 依赖：pip install fonttools brotli
# 运行：python3 scripts/build-sfnt-fonts.py [--force]
#
# 背景：运行期做子集化的 harfbuzz-subset.wasm 读不了 woff2 —— 实测 hb_subset_or_fail
# 对 woff2 直接返回 0（Homebrew 的 hb-subset 14.2.0 也一样，报 Failed loading font face）。
# 所以 /api/fonts/subset 需要原始 sfnt，这份脚本就是那次转换。
# 产物入库，字体不变就不用重跑（同 subset-label-fonts.sh / public/fonts/labels 的模式）。
#
# 刻意不做任何子集化或表裁剪：实测删 hinting / 竖排 / GSUB / GPOS 只省 0-5%，
# 不值得为这点体积去改变渲染细节。输出扩展名按有没有 'CFF ' 表决定（.otf / .ttf）。
#
# 注意：FONTS 的 face 必须与 src/app/components/sheets/shareCardExport.ts 对齐，
# tests/font-sfnt-assets.test.ts 会断言两者一致。

import argparse
import json
import os
import sys

FONT_DIR = os.path.join('public', 'fonts')
OUT_DIR = os.path.join('public', 'fonts', 'sfnt')

# face id → 源 woff2（相对 FONT_DIR）
FONTS = {
    'SourceHanSerifCN': 'SourceHanSerifCN-SemiBold.woff2',
    'FZLanTingXiHei': 'FZLanTingXiHei.woff2',
    'FZBeiWeiKaiShu': '方正北魏楷书简体.woff2',
    'FZSongHei': 'FZSongHei.woff2',
    'FZXiaoZhuan': 'FZXiaoZhuan.woff2',
    'FZZhengXianHei': 'FZZhengXianHei.woff2',
    'HuiWenMingChao': 'HuiWenMingChao.woff2',
}


def main() -> int:
    ap = argparse.ArgumentParser(description='把整套 woff2 转成运行期子集化用的原始 sfnt')
    ap.add_argument('--force', action='store_true', help='忽略时间戳，全部重转')
    args = ap.parse_args()

    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print('缺少 fontTools：pip install fonttools brotli', file=sys.stderr)
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    index = {}
    rows = []

    for face, src_name in FONTS.items():
        src = os.path.join(FONT_DIR, src_name)
        if not os.path.exists(src):
            print('缺源字体 %s' % src, file=sys.stderr)
            return 1

        font = TTFont(src, lazy=False)
        ext = 'otf' if 'CFF ' in font else 'ttf'
        out_name = '%s.%s' % (face, ext)
        out = os.path.join(OUT_DIR, out_name)
        index[face] = out_name

        fresh = (not args.force
                 and os.path.exists(out)
                 and os.path.getmtime(out) >= os.path.getmtime(src))
        if fresh:
            rows.append((face, out_name, os.path.getsize(src), os.path.getsize(out), True))
            font.close()
            continue

        print('转换 %s → sfnt/%s …' % (src_name, out_name))
        font.flavor = None
        tmp = out + '.tmp'
        font.save(tmp)
        font.close()
        os.replace(tmp, out)
        rows.append((face, out_name, os.path.getsize(src), os.path.getsize(out), False))

    with open(os.path.join(OUT_DIR, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(index, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write('\n')

    print()
    print('%-20s %-24s %10s %10s  %s' % ('face', '文件', 'woff2', 'sfnt', '状态'))
    total = 0
    for face, out_name, src_size, out_size, skipped in rows:
        total += out_size
        print('%-20s %-24s %9.2fM %9.2fM  %s'
              % (face, out_name, src_size / 1048576, out_size / 1048576,
                 '跳过' if skipped else '已转换'))
    print('%-20s %-24s %10s %9.2fM' % ('合计', '', '', total / 1048576))
    print()
    print('index.json: %d 项' % len(index))
    return 0


if __name__ == '__main__':
    sys.exit(main())

