/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import CalendarShareCard, { CALENDAR_CARD_WIDTH, calendarDateParts } from '../sheets/CalendarShareCard';
import type { Quote } from '../../types';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const quote: Quote = {
  id: 'calendar-1',
  bookId: 'book-1',
  text: '这是一段需要完整导出的摘录，不能被旧版卡片的高度限制截断。'.repeat(12),
  thought: '这是只读的我的想法。',
  chapter: '第五章 拾光',
  page: null,
  date: '2026-10-29',
  createdAt: '2026-10-29T08:00:00.000Z',
  updatedAt: '2026-10-29T08:00:00.000Z',
};

const theme = {
  bgColor: '#E8D7CD',
  textColor: '#262626',
  accentColor: '#6B5A58',
};

describe('日历书摘分享模板', () => {
  it('把摘录日期拆成大字日期、英文月年和中文星期', () => {
    expect(calendarDateParts('2026-10-29')).toEqual({
      day: '29',
      monthYear: 'OCTOBER 2026',
      weekday: '星期四',
    });
  });

  it('按设备本地日期拆出当月大字日期和星期', () => {
    expect(calendarDateParts(new Date(2026, 10, 21, 23, 30))).toEqual({
      day: '21',
      monthYear: 'NOVEMBER 2026',
      weekday: '星期六',
    });
  });

  it('显示导出当天日期，不沿用摘录的记录日期', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 21, 15, 0));
    const { container } = render(
      <CalendarShareCard
        quote={quote}
        bookTitle="东京八平米"
        bookAuthor="吉井忍"
        theme={theme}
        cardFamily="serif"
        showThoughts
      />,
    );

    const role = (name: string) => container.querySelector(`[data-share-font-role="${name}"]`) as HTMLElement;
    expect(role('day').textContent).toBe('21');
    expect(role('month').textContent).toBe('NOVEMBER 2026');
    expect(role('weekday').textContent).toBe('星期六');
    expect(container.textContent).not.toContain('OCTOBER 2026');
  });

  it('导出宽度为 1080px 模板对应的 360px 逻辑宽度', () => {
    expect(CALENDAR_CARD_WIDTH).toBe(360);
  });

  it('完整显示正文、想法、书名和作者，不显示章节或操作控件', () => {
    const { container } = render(
      <CalendarShareCard
        quote={quote}
        bookTitle="东京八平米"
        bookAuthor="吉井忍"
        theme={theme}
        cardFamily="serif"
        showThoughts
      />,
    );

    expect(container.textContent).toContain(quote.text);
    expect(container.textContent).toContain('我的想法');
    expect(container.textContent).toContain(quote.thought);
    expect(container.textContent).toContain('《东京八平米》');
    expect(container.textContent).toContain('吉井忍');
    expect(container.textContent).not.toContain('第五章 拾光');
    expect(container.querySelector('[data-share-font-role="chapter"]')).toBeNull();
    expect(container.querySelector('button, [role="button"]')).toBeNull();
    expect(container.querySelector('[data-share-sticker]')).toBeNull();
  });

  it('按参考稿保留日期层级、分隔线和正文间距，避免行框重叠与底部裁切', () => {
    const { container } = render(
      <CalendarShareCard
        quote={{ ...quote, text: '夏天让我们想起自己散发着什么样的气味。地上有呼吸的物种和没有生命的物种。' }}
        bookTitle="小银和我"
        bookAuthor="[西]胡安·拉蒙·希梅内斯"
        theme={theme}
        cardFamily="serif"
        showThoughts
        calendarDate={{ day: '21', monthYear: 'NOVEMBER 2026', weekday: '星期六' }}
      />,
    );

    const card = container.firstElementChild as HTMLElement;
    const header = container.querySelector('[data-share-header="calendar"]') as HTMLElement;
    const role = (name: string) => container.querySelector(`[data-share-font-role="${name}"]`) as HTMLElement;
    const divider = container.querySelector('[data-share-divider="calendar"]') as HTMLElement;
    const footer = container.querySelector('footer') as HTMLElement;

    expect(card.style.minHeight).toBe('500px');
    expect(header.style.height).toBe('250px');
    expect(header.style.position).toBe('relative');
    expect(role('day').style.position).toBe('absolute');
    expect(role('day').style.top).toBe('-12px');
    expect(role('day').style.height).toBe('120px');
    expect(role('day').style.fontSize).toBe('96px');
    expect(role('day').style.lineHeight).toBe('1');
    expect(role('month').style.position).toBe('absolute');
    expect(role('month').style.top).toBe('139px');
    expect(role('month').style.fontSize).toBe('22px');
    expect(role('weekday').style.position).toBe('absolute');
    expect(role('weekday').style.top).toBe('179px');
    expect(divider).not.toBeNull();
    expect(divider.style.position).toBe('absolute');
    expect(divider.style.top).toBe('224px');
    expect(divider.style.width).toBe('45px');
    expect(role('quote').style.fontSize).toBe('17.5px');
    expect(role('quote').style.lineHeight).toBe('30.75px');
    expect(footer.style.marginTop).toBe('15px');
    expect(role('watermark').textContent).toBe('折角 · Dogear');
    expect(role('title').style.lineHeight).toBe('22px');
    expect(role('author').style.lineHeight).toBe('22px');
    expect(role('watermark').style.marginTop).toBe('25px');

    const dayTop = Number.parseFloat(role('day').style.top);
    const dayHeight = Number.parseFloat(role('day').style.height);
    const monthTop = Number.parseFloat(role('month').style.top);
    expect(monthTop - (dayTop + dayHeight)).toBeGreaterThanOrEqual(30);
    const digits = role('day').querySelectorAll('span');
    expect(digits).toHaveLength(2);
    expect((digits[1] as HTMLElement).style.marginLeft).toBe('-0.04em');
  });

  it('书名和作者可以换行完整展示，不用单行溢出裁切', () => {
    const longTitle = '《这是一本书名非常长而且必须完整显示才能避免导出时只出现一半的测试书目》';
    const longAuthor = '[测试国家]一位名字很长很长但同样必须完整显示的作者';
    const { container } = render(
      <CalendarShareCard
        quote={{ ...quote, text: '短摘录' }}
        bookTitle={longTitle}
        bookAuthor={longAuthor}
        theme={theme}
        cardFamily="serif"
        showThoughts={false}
        calendarDate={{ day: '21', monthYear: 'NOVEMBER 2026', weekday: '星期六' }}
      />,
    );

    const role = (name: string) => container.querySelector(`[data-share-font-role="${name}"]`) as HTMLElement;
    for (const element of [role('title'), role('author')]) {
      expect(element.style.whiteSpace).not.toBe('nowrap');
      expect(element.style.overflow).not.toBe('hidden');
      expect(element.style.textOverflow).toBe('');
      expect(element.style.overflowWrap).toBe('anywhere');
    }
  });

  it('按模板角色使用独立字体和字号', () => {
    const { container } = render(
      <CalendarShareCard
        quote={quote}
        bookTitle="东京八平米"
        bookAuthor="吉井忍"
        theme={theme}
        cardFamily="serif"
        showThoughts
      />,
    );

    const role = (name: string) => container.querySelector(`[data-share-font-role="${name}"]`) as HTMLElement;
    expect(role('day').style.fontSize).toBe('96px');
    expect(role('month').style.fontSize).toBe('22px');
    expect(role('weekday').style.fontSize).toBe('11.5px');
    expect(role('quote').style.fontSize).toBe('17.5px');
    expect(role('title').style.fontWeight).toBe('500');
    expect(role('author').style.fontWeight).toBe('500');
    expect(role('watermark').style.fontWeight).toBe('300');
    expect(role('day').style.fontFamily).toContain('SourceHanSansCN');
    expect(role('month').style.fontFamily).toContain('SourceHanSansCN');
    expect(role('weekday').style.fontFamily).toContain('SourceHanSansCN');
    expect(role('title').style.fontFamily).toContain('NotoSerifSC');
    expect(role('author').style.fontFamily).toContain('NotoSerifSC');
    expect(role('watermark').style.fontFamily).toContain('NotoSerifSC');
    expect(role('quote').style.fontFamily).toBe('serif');
    expect(role('quote').style.textAlign).toBe('justify');
    expect(role('quote').style.textAlignLast).toBe('left');
    expect(role('quote').style.letterSpacing).toBe('0.03em');
  });
});
