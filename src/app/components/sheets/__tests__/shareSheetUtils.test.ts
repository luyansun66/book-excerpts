/**
 * TDD: 测试 oklch 颜色替换逻辑
 * html2canvas 在 iOS Safari 中遇到 oklch() 颜色会抛出 "Attempting to parse an unsupported color function oklch" 异常
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// 被测试的纯函数：在克隆 DOM 中替换 oklch 颜色
function replaceOklchColors(
  clonedDoc: Document,
  rootElement: HTMLElement,
  textColor: string
): void {
  const walk = (el: Element): void => {
    try {
      const cs = clonedDoc.defaultView?.getComputedStyle(el);
      if (!cs) return;
      for (let i = 0; i < cs.length; i++) {
        const prop = cs[i];
        const val = cs.getPropertyValue(prop);
        if (typeof val === 'string' && val.includes('oklch')) {
          const isBg = /background|bg/i.test(prop);
          (el as HTMLElement).style.setProperty(
            prop,
            isBg ? 'transparent' : textColor,
            'important'
          );
        }
      }
      Array.from(el.children).forEach((c) => walk(c));
    } catch {
      // skip elements that can't be processed (e.g. SVG in html2canvas clone)
    }
  };
  walk(rootElement);
}

describe('replaceOklchColors', () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><head>
      <style>
        :root { color: oklch(0.5 0.1 240); background: oklch(0.9 0.02 90); }
        .card { color: oklch(0.3 0.05 180); }
        .badge { background: oklch(0.7 0.1 30); }
      </style></head><body>
      <div class="card">
        <span class="text">Hello</span>
        <div class="badge">OK</div>
      </div>
    </body></html>`);
    doc = dom.window.document;
  });

  afterEach(() => {
    dom.window.close();
  });

  it('替换根元素继承的 oklch color 为指定 textColor', () => {
    const card = doc.querySelector('.card') as HTMLElement;
    replaceOklchColors(doc, card, '#2D1F16');

    // JSDOM 会将 #2D1F16 规范化为 rgb(45, 31, 22)
    expect(card.style.color).toContain('rgb(45, 31, 22)');
  });

  it('替换 oklch background 为 transparent', () => {
    const badge = doc.querySelector('.badge') as HTMLElement;
    replaceOklchColors(doc, badge, '#2D1F16');

    expect(badge.style.background).toContain('transparent');
  });

  it('不修改非 oklch 的样式属性', () => {
    const span = doc.querySelector('.text') as HTMLElement;
    span.style.fontSize = '14px';
    replaceOklchColors(doc, span, '#2D1F16');

    expect(span.style.fontSize).toBe('14px');
  });

  it('处理无 oklch 的元素时不报错', () => {
    const div = doc.createElement('div');
    div.style.color = '#000';
    div.textContent = 'no oklch';

    expect(() => replaceOklchColors(doc, div, '#2D1F16')).not.toThrow();
  });
});
