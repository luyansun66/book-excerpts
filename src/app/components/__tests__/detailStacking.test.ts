/**
 * 详情页组件的层叠上下文契约。
 *
 * 背景：卡片内部靠 z-index 分层（0 = 颜色蒙层，1 = 正文），可卡片根节点是
 * `position: relative; z-index: auto` —— 它不成立层叠上下文，于是那个 1 直接被
 * 提升到页面级，盖住了底部的「Add Quotes」浮层按钮。症状很挑：按钮只在正好压在
 * 某条摘录正文上时才点不动，压到日期行、卡片空白处都正常。
 *
 * jsdom 不做布局和绘制，跑不出这个差异，所以只能按源码守着：凡是内部用了
 * z-index 分层的卡片/封面，根节点必须写 isolation: isolate。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  path.resolve(process.cwd(), 'src/app/components/BookDetailPage.tsx'),
  'utf8',
);

/** 取顶层组件函数体：从 `function <name>(` 到下一个顶层 `function ` 或文件结束 */
const componentBody = (name: string) => {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `找不到 ${name}`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const nextFn = rest.indexOf('\nfunction ');
  const nextSection = rest.indexOf('\n// ───');
  const end = [nextFn, nextSection].filter((i) => i !== -1).sort((a, b) => a - b)[0];
  return end === undefined ? src.slice(start) : src.slice(start, start + 1 + end);
};

describe('详情页卡片的层叠上下文', () => {
  it('卡片内部确实在用 z-index 分层，所以必须和页面级隔开', () => {
    expect(componentBody('QuoteCard')).toMatch(/zIndex: 0,/);
    expect(componentBody('QuoteCard')).toMatch(/zIndex: 1 /);
  });

  it('QuoteCard 根节点自成层叠上下文，正文那个 z-index: 1 不会跑到页面级', () => {
    const body = componentBody('QuoteCard');
    const rootStyle = body.slice(body.indexOf('style={{'), body.indexOf('onMouseEnter'));
    expect(rootStyle).toMatch(/isolation: 'isolate'/);
  });

  it('SmallBookCover 同理（书名/作者块也用 z-index: 1 压金线边框）', () => {
    const body = componentBody('SmallBookCover');
    expect(body).toMatch(/zIndex: 1/);
    expect(body).toMatch(/isolation: 'isolate'/);
  });
});
