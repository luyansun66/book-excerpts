// ─── 百度 OCR 本地代理服务器 ──────────────────────────────────────────────────
// 安全持有 API 凭据（不暴露到前端），自动管理 token 刷新。
// 前端通过 Vite proxy 转发请求到此服务器。

import express from 'express';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') });

const API_KEY = process.env.BAIDU_API_KEY;
const SECRET_KEY = process.env.BAIDU_SECRET_KEY;

if (!API_KEY || !SECRET_KEY) {
  console.error('❌ 请在 server/.env 中设置 BAIDU_API_KEY 和 BAIDU_SECRET_KEY');
  process.exit(1);
}

// ─── Token 管理 ─────────────────────────────────────────────────────────────

let cachedToken = null;
let tokenExpiresAt = 0;
const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // 过期前 5 分钟刷新

async function getAccessToken() {
  // 如果缓存有效，直接返回
  if (cachedToken && Date.now() < tokenExpiresAt - TOKEN_REFRESH_MARGIN) {
    return cachedToken;
  }

  console.log('[OCR-Proxy] 获取新的 access_token…');
  const resp = await fetch(
    'https://aip.baidubce.com/oauth/2.0/token' +
      `?grant_type=client_credentials&client_id=${API_KEY}&client_secret=${SECRET_KEY}`,
    { method: 'POST' },
  );

  if (!resp.ok) {
    throw new Error(`获取 token 失败: HTTP ${resp.status}`);
  }

  const data = await resp.json();

  if (data.error) {
    throw new Error(`获取 token 失败: [${data.error}] ${data.error_description || ''}`);
  }

  cachedToken = data.access_token;
  // expires_in 通常是 2592000（30 天），留一点余量
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  console.log(`[OCR-Proxy] token 获取成功，有效期至 ${new Date(tokenExpiresAt).toISOString()}`);
  return cachedToken;
}

// ─── 百度 OCR 调用 ─────────────────────────────────────────────────────────

async function callBaiduOcr(base64Image) {
  const token = await getAccessToken();

  // 尝试 Accurate Basic，失败时降级到 General Basic
  const endpoints = [
    'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic',
    'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic',
  ];

  let lastError = '';
  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(`${endpoint}?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `image=${encodeURIComponent(base64Image)}&detect_direction=true`,
      });

      const data = await resp.json();

      if (data.error_code) {
        lastError = `[${data.error_code}] ${data.error_msg || ''}`;
        continue;
      }

      const lines = (data.words_result || []).map((r) => r.words);
      return lines.join('\n');
    } catch (e) {
      lastError = `网络错误: ${e?.message || e}`;
      continue;
    }
  }

  throw new Error(`百度 OCR 识别失败: ${lastError}`);
}

// ─── Express 服务器 ────────────────────────────────────────────────────────

const app = express();

// 只接受 JSON，限制 body 大小（base64 图片最大 ~10MB）
app.use(express.json({ limit: '10mb' }));

// POST /api/ocr — OCR 识别
app.post('/api/ocr', async (req, res) => {
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ error: '缺少 image 字段' });
  }

  try {
    const text = await callBaiduOcr(image);
    res.json({ text });
  } catch (e) {
    console.error('[OCR-Proxy] 识别失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /health — 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', tokenCached: !!cachedToken });
});

// ─── 启动 ──────────────────────────────────────────────────────────────────

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ OCR 代理服务器已启动: http://localhost:${PORT}`);
  console.log(`   API 端点: POST /api/ocr`);
});
