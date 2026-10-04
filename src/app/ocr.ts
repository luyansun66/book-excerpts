// ─── 拍照识字的客户端入口 ────────────────────────────────────────────────────
// 请求发到本站的 /api/ocr（Cloudflare Pages Function），由服务端去换百度 access_token
// 并调用 OCR —— 浏览器这边不持有任何密钥或 token，所以换票、30 天到期这些事都不需要
// 前端参与，也不必重新发版（见 functions/api/ocr.ts）。
//
// 代价是识别多一次服务端跳转：图片先上传到自己的 Function，再由它转发给百度。压完图
// 一般几百 KB，这点往返可以接受。

/**
 * 兜底超时，必须宽于服务端的最坏情况，否则会出现「服务端还在等百度，客户端先放弃」——
 * 用户看到的是超时，而服务端其实可能马上就成功了。
 *
 * 服务端预算（见 functions/api/ocr.ts）：换票 10s；识别单次 25s。识别一旦超时会直接返回
 * 不再试第二条接口，所以现实中最坏是「冷启动换票 10s + 识别 25s」≈ 35s，只有票失效重试
 * 那条罕见路径才接近 45s。这里给 60s，留足余量，让服务端始终先给出中文提示。
 */
const CLIENT_TIMEOUT_MS = 60000;

/**
 * 识别图片中的文字。imageData 可以是 data URL，也可以是一段纯 base64。
 * 成功时按行返回识别结果；失败抛出的 Error.message 已经是能直接给用户看的中文。
 */
export async function recognizeText(imageData: string): Promise<string> {
  const image = imageData.replace(/^data:image\/\w+;base64,/, '');

  let resp: Response;
  try {
    resp = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      // 措辞和服务端的「识别服务响应超时」区分开，方便从用户截图判断卡在哪一段
      throw new Error('网络较慢，识别请求超时，请重试');
    }
    throw new Error('无法连接 OCR 服务，请检查网络后重试');
  }

  // 5xx 时 Function 也可能返回非 JSON（比如运行时崩溃），所以这里别直接 await resp.json()
  const data = (await resp.json().catch(() => null)) as { words?: string[]; error?: string } | null;

  if (!resp.ok) {
    throw new Error(data?.error || `OCR 识别失败（HTTP ${resp.status}）`);
  }

  const lines = data?.words ?? [];
  if (!lines.length) throw new Error('未能识别出任何文字');
  return lines.join('\n');
}

/** 缩放图片到最长边 maxW，输出 JPEG data URL。
 *  使用 createImageBitmap 正确处理 EXIF 方向（手机拍照方向标记）。 */
export async function compressImage(file: File, maxW: number): Promise<string> {
  // createImageBitmap 能正确解析 EXIF 方向
  let img: HTMLImageElement | ImageBitmap;
  try {
    img = await createImageBitmap(file);
  } catch {
    // 降级：部分浏览器不支持 createImageBitmap
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('图片加载失败'));
      i.src = URL.createObjectURL(file);
    });
  }

  let w = img.width;
  let h = img.height;

  if (w > maxW) {
    h = Math.round((h * maxW) / w);
    w = maxW;
  }
  if (h > maxW) {
    w = Math.round((w * maxW) / h);
    h = maxW;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(img, 0, 0, w, h);

  if ('close' in img) img.close(); // 释放 ImageBitmap 内存
  return canvas.toDataURL('image/jpeg', 0.92);
}
