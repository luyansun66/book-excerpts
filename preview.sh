#!/bin/bash
cd "$(dirname "$0")"

echo "== 正在构建最新版本 =="
npm run build || { echo "构建失败，请检查上方错误"; exit 1; }

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -z "$IP" ]; then
  IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | grep -v 198.18 | awk '{print $2}' | head -1)
fi

echo ""
echo "== 预览服务已启动 =="
echo "本机访问: http://localhost:4173/book-excerpts/"
if [ -n "$IP" ]; then
  echo "手机访问: http://${IP}:4173/book-excerpts/"
fi
echo ""
echo "请保持此终端窗口打开，关闭窗口服务即停止。"
echo "按 Ctrl+C 停止服务。"
echo ""

npx vite preview --port 4173 --strictPort --host
