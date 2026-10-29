import { describe, expect, it } from 'vitest';
import { quoteHaystack } from '../searchText';

describe('quoteHaystack', () => {
  it('标记内的字仍然搜得到', () => {
    const hay = quoteHaystack({ text: '他说==要活下去==。', thought: '' }, '书', '作者');
    expect(hay).toContain('要活下去');
  });

  it('标记符号本身不进 haystack，搜 == 不会误命中', () => {
    const hay = quoteHaystack({ text: '他说==要活下去==。', thought: '- **重点**' }, '书', '作者');
    expect(hay).not.toContain('==');
    expect(hay).not.toContain('**');
  });

  it('感悟的行首符号按普通文字保留', () => {
    const hay = quoteHaystack({ text: '', thought: '- 第一点' }, '书', '作者');
    expect(hay).toContain('- 第一点');
  });

  it('书名与作者照旧参与匹配', () => {
    const hay = quoteHaystack({ text: '正文', thought: '' }, '昨日的世界', '茨威格');
    expect(hay).toContain('昨日的世界');
    expect(hay).toContain('茨威格');
  });
});
