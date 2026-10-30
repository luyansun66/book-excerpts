// @vitest-environment jsdom
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
