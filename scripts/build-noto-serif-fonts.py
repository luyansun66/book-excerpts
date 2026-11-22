#!/usr/bin/env python3
# 把三档思源宋体 TTF 转成随 PWA 发布的 WOFF2。
# 源字体不入库；产物 public/fonts/NotoSerifSC-{Light,Medium,Bold}.woff2 入库。
#
# 依赖：pip install fonttools brotli
# 默认源目录：书签字体/思源宋体；也可显式传入：
#   python3 scripts/build-noto-serif-fonts.py --source-dir "$HOME/Downloads/思源宋体"

import argparse
import os
import sys

SOURCE_DIR_DEFAULT = os.path.join('书签字体', '思源宋体')
OUT_DIR = os.path.join('public', 'fonts')
FONTS = [
    ('NotoSerifSC-Light.ttf', 'NotoSerifSC-Light.woff2', 300),
    ('NotoSerifSC-Medium.ttf', 'NotoSerifSC-Medium.woff2', 500),
    ('NotoSerifSC-Bold.ttf', 'NotoSerifSC-Bold.woff2', 700),
]


def main() -> int:
    ap = argparse.ArgumentParser(description='把三档思源宋体 TTF 转成 WOFF2')
    ap.add_argument(
        '--source-dir',
        default=os.environ.get('NOTO_SERIF_SC_SOURCE_DIR', SOURCE_DIR_DEFAULT),
        help='包含三份 NotoSerifSC-*.ttf 的目录',
    )
    ap.add_argument('--force', action='store_true', help='忽略时间戳，全部重转')
    args = ap.parse_args()

    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print('缺少 fontTools：pip install fonttools brotli', file=sys.stderr)
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    rows = []
    for src_name, out_name, expected_weight in FONTS:
        src = os.path.join(args.source_dir, src_name)
        if not os.path.exists(src):
            print('缺源字体 %s' % src, file=sys.stderr)
            return 1

        font = TTFont(src, lazy=False)
        actual_weight = font['OS/2'].usWeightClass
        family_name = next(
            (record.toUnicode() for record in font['name'].names
             if record.nameID == 1 and record.platformID == 3 and record.langID == 0x409),
            '',
        )
        if actual_weight != expected_weight:
            font.close()
            print('%s 的字重是 %s，预期 %s' % (src_name, actual_weight, expected_weight), file=sys.stderr)
            return 1
        if 'Noto Serif SC' not in family_name:
            font.close()
            print('%s 的字体族不是思源宋体/Noto Serif SC：%s' % (src_name, family_name), file=sys.stderr)
            return 1

        out = os.path.join(OUT_DIR, out_name)
        fresh = (
            not args.force
            and os.path.exists(out)
            and os.path.getmtime(out) >= os.path.getmtime(src)
        )
        if fresh:
            font.close()
            rows.append((src_name, out_name, os.path.getsize(src), os.path.getsize(out), True))
            continue

        print('转换 %s → %s …' % (src_name, out_name))
        font.flavor = 'woff2'
        tmp = out + '.tmp'
        font.save(tmp)
        font.close()
        os.replace(tmp, out)

        # 回读一次，避免产出扩展名正确但浏览器无法解析的假 WOFF2。
        check = TTFont(out, lazy=False)
        check_weight = check['OS/2'].usWeightClass
        check.close()
        if check_weight != expected_weight:
            print('%s 回读字重异常：%s' % (out_name, check_weight), file=sys.stderr)
            return 1
        rows.append((src_name, out_name, os.path.getsize(src), os.path.getsize(out), False))

    print()
    print('%-28s %-32s %10s %10s  %s' % ('source', 'woff2', 'source', 'woff2', '状态'))
    for src_name, out_name, src_size, out_size, skipped in rows:
        print('%-28s %-32s %9.2fM %9.2fM  %s' % (
            src_name, out_name, src_size / 1048576, out_size / 1048576,
            '跳过' if skipped else '已转换',
        ))
    return 0


if __name__ == '__main__':
    sys.exit(main())
