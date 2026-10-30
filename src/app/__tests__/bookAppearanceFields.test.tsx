// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import BookAppearanceFields from '../components/BookAppearanceFields';
import { SPINE_TEMPLATES } from '../shelf/spineTemplates';

const noop = () => {};

function renderFields() {
  return render(
    <BookAppearanceFields
      layout="auto"
      spineTemplate="default"
      onLayoutChange={noop}
      onSpineTemplateChange={noop}
    />,
  );
}

afterEach(cleanup);

describe('BookAppearanceFields', () => {
  it('摆放形式只留名字，不再带说明小字', () => {
    renderFields();
    for (const name of ['自动', '竖放·书脊', '竖放·书封', '横放·堆叠']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.queryByText(/由书架自己安排|只露出书脊|封面朝外|平躺/)).toBeNull();
  });

  it('书脊样式按布面深浅排布，预览按缩略图尺寸画', () => {
    const { container } = renderFields();
    const group = screen.getByRole('group', { name: '书脊样式' });
    const buttons = within(group).getAllByRole('button');

    // 第一张是最深的哑光黑，最后一张是最浅的素石（经典压印在最前面，比哑光黑还深）
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      '经典压印',
      ...SPINE_TEMPLATES.slice(1).map((t) => t.name),
    ]);
    expect(buttons[0].getAttribute('aria-label')).toBe('经典压印');
    expect(buttons[1].getAttribute('aria-label')).toBe('哑光黑');
    expect(buttons[buttons.length - 1].getAttribute('aria-label')).toBe('素石');

    // 预览是缩略图：比书架上最常见的 27 × 145 小一档，一屏多放几张
    const spine = buttons[0].firstElementChild as HTMLElement;
    expect(spine.style.width).toBe('24px');
    expect(spine.style.height).toBe('129px');
    expect(container).toBeTruthy();
  });

  it('书脊样式只画预览，模版名字留给 aria-label', () => {
    const { container } = renderFields();
    const group = screen.getByRole('group', { name: '书脊样式' });
    expect(within(group).getAllByRole('button')).toHaveLength(SPINE_TEMPLATES.length);
    for (const template of SPINE_TEMPLATES) {
      expect(screen.getByRole('button', { name: template.name })).toBeTruthy();
      expect(container.textContent).not.toContain(template.name);
    }
  });
});
