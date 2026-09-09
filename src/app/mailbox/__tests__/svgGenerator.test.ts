import { describe, expect, it } from 'vitest';
import { generateLetterSvg } from '../svgGenerator';

const base = {
  number: 47,
  dateCN: '2026/09/09',
  dateEN: 'September 9, 2026',
  bookTitle: '小王子',
  bookAuthor: 'Antoine de Saint-Exupéry',
};

describe('generateLetterSvg', () => {
  it('replaces all placeholders and fills dynamic fields', () => {
    const svg = generateLetterSvg({
      ...base,
      quote: '所有的大人都曾经是小孩，虽然，只有少数的人记得。',
      translation: 'All grown-ups were once children, although few of them remember it.',
    });

    expect(svg).not.toContain('{{');
    expect(svg).toContain('>47</tspan>');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('transform="translate(283.5 250)"');
    expect(svg).toContain('第47封信');
    expect(svg).toContain('Letter No. 47');
    expect(svg).toContain('折角书摘·2026/09/09');
    expect(svg).toContain('Dogear · September 9, 2026');
    expect(svg).toContain('/assets/bg01.jpg');
    expect(svg).toContain('——《小王子》');
    expect(svg).toContain('Saint-Exupéry');
    expect(svg).toContain('所有的大人都曾经是小孩');
    expect(svg).toContain('All grown-ups were once children');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('escapes XML special characters in the quote', () => {
    const svg = generateLetterSvg({
      ...base,
      quote: '他说：“你好” & <世界>',
      translation: 'He said: "hi" & <world>',
    });
    expect(svg).not.toContain('<世界>');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;世界&gt;');
  });

  it('keeps long quotes within bounds and appends ellipsis when needed', () => {
    const svg = generateLetterSvg({
      ...base,
      quote: '这句话特别长，'.repeat(200),
      translation: 'This translation is long enough to wrap. '.repeat(60),
    });
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('…');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('handles missing translation', () => {
    const svg = generateLetterSvg({ ...base, quote: '一句摘录。', translation: '' });
    expect(svg).toContain('一句摘录。');
    expect(svg).toContain('——《小王子》');
    expect(svg).toContain('Saint-Exupéry');
  });
});
