// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SPINE_TEMPLATES, type SpineRenderContext } from '../shelf/spineTemplates';

const TITLE = '潮汐之间';
const AUTHOR = '林川';
/** 顺序 = 书脊样式卡片的排布顺序（布面由深到浅） */
const FORMAL_IDS = [
  'matte',
  'contour',
  'indigo',
  'bauhaus',
  'navy',
  'leather',
  'goldgreen',
  'pine',
  'deep',
  'aura',
  'ash',
  'slate',
  'dusk',
  'clay',
  'amber',
  'sage',
  'stone',
] as const;
const SIZES = [
  { label: '19×132 极窄', width: 19, height: 132, vertical: true },
  { label: '32×145 常规', width: 32, height: 145, vertical: true },
  { label: '145×19 横放', width: 145, height: 19, vertical: false },
] as const;
const THEMES = ['light', 'dark'] as const;

function context(width: number, height: number, vertical: boolean): SpineRenderContext {
  return {
    book: { title: TITLE, author: AUTHOR } as unknown as SpineRenderContext['book'],
    width,
    height,
    vertical,
    thickness: Math.min(width, height),
  };
}

afterEach(cleanup);

describe('spine templates theme and size matrix', () => {
  describe.each(FORMAL_IDS)('%s', (id) => {
    it.each(SIZES.flatMap((size) => THEMES.map((theme) => ({ ...size, theme }))))(
      '$label in $theme theme',
      ({ width, height, vertical, theme }) => {
        const template = SPINE_TEMPLATES.find((entry) => entry.id === id);
        expect(template).toBeDefined();
        const view = render(
          <div data-theme={theme}>{template!.render(context(width, height, vertical))}</div>,
        );
        expect(screen.getByText(TITLE)).toBeTruthy();
        expect(view.container.innerHTML).not.toContain('NaN');
        expect(view.container.innerHTML).not.toContain('undefined');
      },
    );
  });
});

describe('书脊预览的层叠边界', () => {
  it('书脊内部使用高层级文字与光影时，根节点必须自成层叠上下文', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'src/app/shelf/spine/shared.tsx'),
      'utf8',
    );

    expect(source).toMatch(/zIndex: 30,/);
    expect(source).toContain("isolation: 'isolate'");
  });
});
