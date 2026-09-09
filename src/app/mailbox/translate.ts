// ─── 客户端翻译调用（走 /api/translate 代理，密钥不出现在前端） ─────────────────

interface TranslateResponse {
  translation?: string;
  error?: string;
}

export async function translateToEnglish(text: string): Promise<string> {
  const resp = await fetch(`/api/translate?text=${encodeURIComponent(text)}`);
  if (!resp.ok) {
    throw new Error(`翻译请求失败（${resp.status}）`);
  }
  const data = (await resp.json()) as TranslateResponse;
  if (data.error) {
    throw new Error(data.error);
  }
  return (data.translation ?? '').trim();
}
