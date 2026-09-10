// @vitest-environment node
// 信件资源清单与模板必须对得上。底图从 bg01.jpg 换成 bg01.webp 那次就是因为
// 路径写错不会报错（`fetch` 失败被吞掉 / 图片悄悄不显示），只能在浏览器里肉眼发现。
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import template from '../letterTemplate.svg?raw';
import { LETTER_ASSET_URLS, collectAssetUrls } from '../letterImage';

/** 站内资源 URL（/assets/x.webp）→ public 目录下的真实路径。 */
function publicPath(url: string) {
  return path.join(process.cwd(), 'public', url.replace(/^\//, ''));
}

describe('信件资源清单', () => {
  it('预热清单里的每个文件都真实存在', () => {
    for (const url of LETTER_ASSET_URLS) {
      expect(existsSync(publicPath(url)), `${url} 不存在`).toBe(true);
    }
  });

  it('模板引用的字体和底图都真实存在，且都在预热清单里', () => {
    const referenced = collectAssetUrls(template);
    expect(referenced.length).toBeGreaterThan(0);

    for (const url of referenced) {
      expect(existsSync(publicPath(url)), `${url} 不存在`).toBe(true);
      expect(LETTER_ASSET_URLS, `${url} 没进预热清单`).toContain(url);
    }
  });

  it('底图用 WebP（纸纹压 JPEG 压不动）', () => {
    expect(template).toContain('/assets/bg01.webp');
    expect(template).not.toContain('.jpg');
  });
});
