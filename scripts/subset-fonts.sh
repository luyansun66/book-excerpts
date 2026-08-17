#!/bin/bash
# 字体子集化 — TTC/TTF → woff2，只保留项目用到的字符
# 依赖：pip install fonttools brotli

set -e
FONT_DIR="public/fonts"
TEXT_SRC="src"
OUTPUT_TXT="scripts/charset.txt"

echo "📝 收集汉字…"
rg -o '[\x{4e00}-\x{9fff}]' "$TEXT_SRC" --no-filename | sort -u > "$OUTPUT_TXT"
echo "   共 $(wc -c < "$OUTPUT_TXT" | tr -d ' ') 个不重复汉字"

echo "🔤 子集化 方正北魏楷书简体…"
pyftsubset "$FONT_DIR/方正北魏楷书简体.ttf" \
  --text-file="$OUTPUT_TXT" \
  --output-file="$FONT_DIR/方正北魏楷书简体.woff2" \
  --flavor=woff2 --layout-features='*' --no-hinting

echo "🔤 子集化 SnellRoundhand…"
pyftsubset "$FONT_DIR/SnellRoundhand.ttc" \
  --unicodes="U+0020-007E,U+2018-2019,U+201C-201D" \
  --output-file="$FONT_DIR/SnellRoundhand.woff2" \
  --flavor=woff2 --layout-features='*' --no-hinting

echo "✅ 完成！请更新 fonts.css 引用为 .woff2 文件"
