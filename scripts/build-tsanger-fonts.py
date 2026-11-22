#!/usr/bin/env python3
# 把三款仓耳 W03 TTF 转成随 PWA 发布的 WOFF2。
# 源字体不入库；产物 public/fonts/Tsanger*.woff2 入库。
#
# 依赖：pip install fonttools brotli
# 默认源目录：字体安装包/04_仓耳字库；也可显式传入：
#   python3 scripts/build-tsanger-fonts.py --source-dir "$HOME/Downloads/字体安装包/04_仓耳字库"

import argparse
import os
import sys

SOURCE_DIR_DEFAULT = os.path.join('字体安装包', '04_仓耳字库')
OUT_DIR = os.path.join('public', 'fonts')
FONTS = [
    ('仓耳今楷02-W03.ttf', 'TsangerJinKai02.woff2', 'TsangerJinKai02', 400),
    ('仓耳玄三02-W03.ttf', 'TsangerXuanSan02.woff2', 'TsangerXuanSan02', 400),
    ('仓耳云黑-W03.ttf', 'TsangerYunHei.woff2', 'TsangerYunHei', 400),
]


def family_names(font) -> list[str]:
    return [
        record.toUnicode()
        for record in font['name'].names
        if record.nameID == 1
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description='把三款仓耳 TTF 转成 WOFF2')
    ap.add_argument(
        '--source-dir',
        default=os.environ.get('TSANGER_FONT_SOURCE_DIR', SOURCE_DIR_DEFAULT),
        help='包含三份仓耳 TTF 的目录',
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
    for src_name, out_name, expected_family, expected_weight in FONTS:
        src = os.path.join(args.source_dir, src_name)
        if not os.path.exists(src):
            print('缺源字体 %s' % src, file=sys.stderr)
            return 1

        font = TTFont(src, lazy=False)
        actual_weight = font['OS/2'].usWeightClass
        families = family_names(font)
        if actual_weight != expected_weight:
            font.close()
            print('%s 的字重是 %s，预期 %s' % (src_name, actual_weight, expected_weight), file=sys.stderr)
            return 1
        if not any(expected_family in family for family in families):
            font.close()
            print('%s 的字体族不匹配 %s：%s' % (src_name, expected_family, families), file=sys.stderr)
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
        check_families = family_names(check)
        check.close()
        if check_weight != expected_weight or not any(expected_family in family for family in check_families):
            print('%s 回读异常：字重 %s，字族 %s' % (out_name, check_weight, check_families), file=sys.stderr)
            return 1
        rows.append((src_name, out_name, os.path.getsize(src), os.path.getsize(out), False))

    print()
    print('%-28s %-28s %10s %10s  %s' % ('source', 'woff2', 'source', 'woff2', '状态'))
    for src_name, out_name, src_size, out_size, skipped in rows:
        print('%-28s %-28s %9.2fM %9.2fM  %s' % (
            src_name, out_name, src_size / 1048576, out_size / 1048576,
            '跳过' if skipped else '已转换',
        ))
    return 0


if __name__ == '__main__':
    sys.exit(main())
