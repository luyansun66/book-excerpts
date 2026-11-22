#!/bin/bash
# 日历书摘的大字日期与英文月年子集。
#
# 日期层必须使用随应用发布的字形，而不是 local() / 系统字体：
# 不同手机的 sans-serif 行框差异会把月年压到数字底下，html2canvas 也会忠实导出这个错误。
#
# 依赖：fonttools、brotli。可用 SOURCE_HAN_SANS_BOLD 指定源文件。
set -e

SOURCE_FONT="${SOURCE_HAN_SANS_BOLD:-$HOME/Library/Fonts/SourceHanSansCN-Bold.otf}"
OUT_FILE="public/fonts/SourceHanSansCN-Calendar-Bold.woff2"

if [[ ! -f "$SOURCE_FONT" ]]; then
  echo "找不到思源黑体粗体源文件：$SOURCE_FONT" >&2
  echo "请通过 SOURCE_HAN_SANS_BOLD=/path/to/font.otf 指定。" >&2
  exit 1
fi

mkdir -p public/fonts
python3 -m fontTools.subset "$SOURCE_FONT" \
  --unicodes='U+0020-007E' \
  --output-file="$OUT_FILE" \
  --flavor=woff2 \
  --layout-features='*' \
  --no-hinting \
  --name-IDs='*' \
  --name-languages='*'

echo "已生成 $OUT_FILE"
