#!/bin/bash
# 时光信箱 / 每日书签字体子集化 — 源字体（书签字体/）→ woff2（public/fonts/）
#
# 依赖：pip install fonttools brotli
# 运行：bash scripts/subset-letter-fonts.sh
#
# 产物（public/fonts/，需提交入库；源字体 书签字体/ 不入库）：
#   华康宋体W3-P.woff2   摘录正文/日期/出处（中文）
#   Georgia-Bold.woff2   大编号
#   Georgia-Italic.woff2 Letter No. / 英文日期 / 英文作者
#   TrebuchetMS.woff2    READING MEMORY TIME LETTER
#
# 说明：摘录正文来自用户数据、字数不限，因此中文字体保留 CJK 全部字形
#       （仅剔除与本卡片无关的文种与符号），拉丁字体只保留西文 + 常用标点。

set -e

SRC_DIR="书签字体"
OUT_DIR="public/fonts"
SUBSET=(python3 -m fontTools.subset)

# 西文：Basic Latin + Latin-1 + 常用标点/引号/省略号/间隔号
LATIN="U+0020-007E,U+00A0-00FF,U+00B7,U+00AB,U+00BB,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2039-203A"

# 中文：CJK 统一表意文字 + CJK 标点 + 全角形式 + CJK 部首/兼容 + 西文兜底
CJK="U+0020-007E,U+00A0-00FF,U+00B7,U+2013-2014,U+2018-201D,U+2026,U+2E80-2EFF,U+3000-303F,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF"

subset() { # $1=源文件 $2=族名 $3=unicodes
  echo "🔤 子集化 $2 …"
  "${SUBSET[@]}" "$SRC_DIR/$1" \
    --unicodes="$3" \
    --output-file="$OUT_DIR/$2.woff2" \
    --flavor=woff2 --layout-features='*' --no-hinting
  printf '   %s → %s (%s)\n' "$1" "$2.woff2" "$(du -h "$OUT_DIR/$2.woff2" | cut -f1)"
}

subset "华康宋体W3-P.ttf" "华康宋体W3-P" "$CJK"
subset "Georgia Bold.ttf" "Georgia-Bold" "$LATIN"
subset "Georgia Italic.ttf" "Georgia-Italic" "$LATIN"
subset "Trebuchet MS.ttf" "TrebuchetMS" "$LATIN"

echo "✅ 完成。letterTemplate.svg 已引用上述 .woff2，无需再改。"
