#!/bin/bash
# 分享卡片「字体选择器」标签字体子集化 —— public/fonts/*.woff2 → public/fonts/labels/*.woff2
#
# 依赖：pip install fonttools brotli
# 运行：bash scripts/subset-label-fonts.sh
#
# 背景：选择器上每个按钮用该字体自己的字形写出字体名（「宋黑」两个字用宋黑渲染），
# 但整套中文字体是 MB 级的 —— 思源宋体 7.5MB、明朝体 7.7MB，七款合计约 22MB。
# 只要按钮用整套字体渲染，打开分享面板就会静默下载 22MB，慢网下就是几分钟的
# 「字体加载」。这里给每款字体单独切一份「只含它名字这几个字」的子集（每个约 1KB），
# 按钮指向子集，卡片正文/预览仍然用整套字体（用户选了哪款才下哪款）。
#
# 注意：子集只覆盖 --text 里给的这几个字。字体名改了要重跑这个脚本，
# 否则按钮会退回系统字体（不会去下整套字体，见 ShareSheet 的 labelFamily 字体栈）。

set -e

FONT_DIR="public/fonts"
OUT_DIR="public/fonts/labels"
SUBSET=(python3 -m fontTools.subset)

mkdir -p "$OUT_DIR"

subset() { # $1=源字体文件 $2=标签族名 $3=标签文字
  echo "🔤 子集化标签字体 $2（$3）…"
  "${SUBSET[@]}" "$FONT_DIR/$1" \
    --text="$3" \
    --output-file="$OUT_DIR/$2.woff2" \
    --flavor=woff2 --layout-features='*' --no-hinting
  printf '   %s → labels/%s.woff2 (%s)\n' "$1" "$2" "$(du -h "$OUT_DIR/$2.woff2" | cut -f1)"
}

subset "SourceHanSerifCN-SemiBold.woff2" "SourceHanSerifCNLabel" "思源宋体"
subset "FZLanTingXiHei.woff2"            "FZLanTingXiHeiLabel"   "兰亭细黑"
subset "方正北魏楷书简体.woff2"           "FZBeiWeiKaiShuLabel"   "北魏楷书"
subset "FZSongHei.woff2"                 "FZSongHeiLabel"        "宋黑"
subset "FZXiaoZhuan.woff2"               "FZXiaoZhuanLabel"      "小篆体"
subset "FZZhengXianHei.woff2"            "FZZhengXianHeiLabel"   "正纤黑"
subset "HuiWenMingChao.woff2"            "HuiWenMingChaoLabel"   "明朝体"

echo "✅ 完成：$(du -sh "$OUT_DIR" | cut -f1)（整套字体约 22MB）"
