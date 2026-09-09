// ─── DeepSeek 翻译代理 ─────────────────────────────────────────────────────────
// 密钥只存在于 Cloudflare Pages 环境变量 DEEPSEEK_API_KEY，前端不接触。
// 硬性约束：只允许调用模型 deepseek-v4-flash（不允许客户端指定模型）。

interface TranslateEnv {
  DEEPSEEK_API_KEY?: string;
}

interface TranslateContext {
  request: Request;
  env: TranslateEnv;
}

const MODEL = 'deepseek-v4-flash';
const ENDPOINT = 'https://api.deepseek.com/chat/completions';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet(context: TranslateContext): Promise<Response> {
  const url = new URL(context.request.url);
  const text = (url.searchParams.get('text') ?? '').trim();

  if (!text) {
    return json({ error: 'missing text' }, 400);
  }
  if (text.length > 500) {
    return json({ error: 'text too long' }, 400);
  }

  const apiKey = context.env?.DEEPSEEK_API_KEY ?? '';
  if (!apiKey) {
    return json({ error: 'DeepSeek key not configured' }, 500);
  }

  let upstream: Response;
  try {
    upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a literary translator. Translate the given Chinese text into natural, elegant English. Output only the translation: no quotes, no explanation, no notes.',
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        stream: false,
      }),
    });
  } catch {
    return json({ error: 'DeepSeek unreachable' }, 502);
  }

  if (!upstream.ok) {
    const detail = (await upstream.text().catch(() => '')).slice(0, 200);
    return json({ error: `DeepSeek error ${upstream.status}: ${detail}` }, 502);
  }

  const data = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const translation = (data.choices?.[0]?.message?.content ?? '').trim();

  if (!translation) {
    return json({ error: 'empty translation' }, 502);
  }

  return json({ translation });
}
