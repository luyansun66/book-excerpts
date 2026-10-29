import { describe, expect, it } from 'vitest';
import {
  parseRichText,
  stripHighlightMarkers,
  stripRichText,
  toggleInlineMarker,
} from '../richText';

describe('parseRichText / 行内标记', () => {
  it('把成对 == 解析成高亮', () => {
    const [line] = parseRichText('他说==要活下去==。', 'quote');
    expect(line).toEqual([
      { kind: 'text', text: '他说' },
      { kind: 'mark', text: '要活下去' },
      { kind: 'text', text: '。' },
    ]);
  });

  it('未闭合的标记按字面显示，不吞字', () => {
    const [line] = parseRichText('他说==要活下去', 'quote');
    expect(line).toEqual([{ kind: 'text', text: '他说==要活下去' }]);
  });

  it('空标记 ==== 按字面显示', () => {
    const [line] = parseRichText('====', 'quote');
    expect(line).toEqual([{ kind: 'text', text: '====' }]);
  });

  it('高亮不跨行', () => {
    const lines = parseRichText('==第一行\n第二行==', 'quote');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual([{ kind: 'text', text: '==第一行' }]);
    expect(lines[1]).toEqual([{ kind: 'text', text: '第二行==' }]);
  });

  it('非贪婪：==a==b== 只把 a 判为高亮', () => {
    const [line] = parseRichText('==a==b==', 'quote');
    expect(line).toEqual([
      { kind: 'mark', text: 'a' },
      { kind: 'text', text: 'b==' },
    ]);
  });

  it('不嵌套：==**x**== 里面的 ** 按字面留在高亮里', () => {
    const [line] = parseRichText('==**x**==', 'thought');
    expect(line).toEqual([{ kind: 'mark', text: '**x**' }]);
  });

  it('摘录原文不解析加粗', () => {
    const [line] = parseRichText('**粗** 和 - 列表', 'quote');
    expect(line).toEqual([{ kind: 'text', text: '**粗** 和 - 列表' }]);
  });

  it('感悟的行首 - / 1. 只是普通文字，不再当列表', () => {
    expect(parseRichText('- 读完了', 'thought')[0]).toEqual([{ kind: 'text', text: '- 读完了' }]);
    expect(parseRichText('1. 第一点', 'thought')[0]).toEqual([{ kind: 'text', text: '1. 第一点' }]);
  });
});

describe('stripRichText', () => {
  it('摘掉成对标记，其余原样保留', () => {
    expect(stripRichText('- **读**完 ==重点==', 'thought')).toBe('- 读完 重点');
  });

  it('行首符号按普通文字原样保留', () => {
    expect(stripRichText('1. 第一点', 'thought')).toBe('1. 第一点');
  });

  it('纯文本原样返回', () => {
    expect(stripRichText('没有标记的一段话', 'quote')).toBe('没有标记的一段话');
  });

  it('未闭合标记不动', () => {
    expect(stripRichText('半截 ==标记', 'quote')).toBe('半截 ==标记');
  });
});

describe('stripHighlightMarkers', () => {
  it('一次去掉所有成对高亮，文字保留', () => {
    expect(stripHighlightMarkers('==一== 和 ==二==')).toBe('一 和 二');
  });

  it('只清高亮，不碰加粗标记', () => {
    expect(stripHighlightMarkers('**粗** ==重点==')).toBe('**粗** 重点');
  });

  it('未闭合 / 空高亮按原样保留，不吞文字', () => {
    expect(stripHighlightMarkers('半截 ==标记')).toBe('半截 ==标记');
    expect(stripHighlightMarkers('====')).toBe('====');
  });

  it('高亮不跨行，逐行清除', () => {
    expect(stripHighlightMarkers('==第一行\n第二行==')).toBe('==第一行\n第二行==');
  });
});

describe('toggleInlineMarker', () => {
  it('有选区时把标记包在外面', () => {
    expect(toggleInlineMarker('abc', 1, 2, '**')).toEqual({
      next: 'a**b**c',
      selStart: 3,
      selEnd: 4,
    });
  });

  it('再点一次去掉标记', () => {
    expect(toggleInlineMarker('a**b**c', 3, 4, '**')).toEqual({
      next: 'abc',
      selStart: 1,
      selEnd: 2,
    });
  });

  it('用户连标记一起选中也能去掉', () => {
    expect(toggleInlineMarker('a==b==c', 1, 6, '==')).toEqual({
      next: 'abc',
      selStart: 1,
      selEnd: 2,
    });
  });

  it('没有选区时插一对标记，光标落在中间', () => {
    expect(toggleInlineMarker('ab', 1, 1, '==')).toEqual({
      next: 'a====b',
      selStart: 3,
      selEnd: 3,
    });
  });
});
