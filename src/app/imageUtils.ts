/** 把用户相册里选的图压到长边 `max` 再转成 JPEG dataURL。
 *  封面在界面上最大也就 96×146，原图直存等于往 IndexedDB 里塞几 MB 的 base64，
 *  读回来渲染时还要再解一次大图。压到 300px 肉眼无差，体积差一个量级。 */
export function compressImage(file: File, max = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > max || h > max) {
        if (w > h) { h = Math.round(h * max / w); w = max; }
        else { w = Math.round(w * max / h); h = max; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    const reader = new FileReader();
    reader.onload = (ev) => { img.src = ev.target?.result as string; };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}
