// ─── 日历书摘分享模板 ─────────────────────────────────────────────────────────
//
// 同一份卡片用于舞台预览、全屏预览和离屏导出。逻辑宽度 360px、基准高度 500px，
// 导出时按 3 倍采样得到 1080px 宽，与用户提供的参考模板保持同一比例。
//
// 字体在模板里按职责拆开：日期/英文月年、星期、系统宋体正文和出处分别有独立的
// data 标记，导出克隆与测试都以此为准。

import type { CSSProperties } from 'react';
import type { Quote } from '../../types';
import { stripRichText } from '../../richText';
import type { ShareCardTheme } from './shareTemplates';

/** 日历模板排版宽度。导出时 scale=3，基准出图 1080 × 1500px。 */
export const CALENDAR_CARD_WIDTH = 360;

export const SHARE_DATE_FONT =
  '"SourceHanSansCN", "PingFang SC", "Noto Sans CJK SC", sans-serif';
export const SHARE_WEEKDAY_FONT =
  '"SourceHanSansCN", "PingFang SC", "Noto Sans CJK SC", sans-serif';
export const SHARE_SERIF_FONT =
  '"NotoSerifSC", "Songti SC", "Noto Serif SC", serif';

export interface ShareCardProps {
  quote: Quote;
  bookTitle: string;
  bookAuthor: string;
  theme: ShareCardTheme;
  /** 正文所选字体；默认使用随 PWA 发布的思源宋体。 */
  cardFamily: string;
  showThoughts: boolean;
  /** 日历模板显示日期；默认取设备本地当天，而不是摘录日期。 */
  calendarDate?: CalendarDateParts;
  /** 预览上给重一点的投影；导出用默认值。 */
  shadow?: string;
}

const ENGLISH_MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const;

const CHINESE_WEEKDAYS = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
] as const;

export interface CalendarDateParts {
  day: string;
  monthYear: string;
  weekday: string;
}

const UNDATED: CalendarDateParts = { day: '—', monthYear: 'UNDATED', weekday: '' };

function localDateParts(date: Date): CalendarDateParts {
  if (Number.isNaN(date.getTime())) return UNDATED;
  return {
    day: String(date.getDate()).padStart(2, '0'),
    monthYear: `${ENGLISH_MONTHS[date.getMonth()]} ${date.getFullYear()}`,
    weekday: CHINESE_WEEKDAYS[date.getDay()],
  };
}

/**
 * 默认返回设备本地当前日期；传入 ISO 日期时用 UTC 拆分，避免字符串在夜间偏到前一天。
 * 日历书摘使用导出当天日期，不读取摘录自身的记录日期。
 */
export function calendarDateParts(value: string | Date = new Date()): CalendarDateParts {
  if (value instanceof Date) return localDateParts(value);

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return UNDATED;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const dayNumber = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, dayNumber));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== monthIndex
    || date.getUTCDate() !== dayNumber
  ) {
    return UNDATED;
  }

  return {
    day: String(dayNumber).padStart(2, '0'),
    monthYear: `${ENGLISH_MONTHS[monthIndex]} ${year}`,
    weekday: CHINESE_WEEKDAYS[date.getUTCDay()],
  };
}

export default function CalendarShareCard({
  quote,
  bookTitle,
  bookAuthor,
  theme,
  cardFamily,
  showThoughts,
  calendarDate,
  shadow = '0 8px 40px rgba(0,0,0,0.12)',
}: ShareCardProps) {
  const quoteText = stripRichText(quote.text, 'quote');
  const thought = showThoughts ? stripRichText(quote.thought || '', 'thought').trim() : '';
  const date = calendarDate ?? calendarDateParts();
  const title = bookTitle.trim();
  const author = bookAuthor.trim();
  const hasAuthor = Boolean(author && author !== '作者未知');

  const rootStyle: CSSProperties = {
    width: CALENDAR_CARD_WIDTH,
    minHeight: 500,
    padding: 0,
    background: theme.bgColor,
    color: theme.textColor,
    borderRadius: 0,
    boxShadow: shadow,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    WebkitFontSmoothing: 'antialiased',
    textRendering: 'geometricPrecision',
  };

  // 日期层级使用绝对定位。字体回退后的墨迹高度会因系统而异，flow 内的
  // 行框余量不足时，html2canvas 仍会让月年压到数字底部；固定分区能把两层真正分开。
  const calendarHeaderStyle: CSSProperties = {
    position: 'relative',
    flex: '0 0 auto',
    height: 250,
    padding: 0,
    boxSizing: 'border-box',
    textAlign: 'center',
  };

  const dayStyle: CSSProperties = {
    position: 'absolute',
    top: -12,
    left: 0,
    right: 0,
    height: 120,
    margin: 0,
    color: theme.textColor,
    fontFamily: SHARE_DATE_FONT,
    fontSize: 96,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: 'normal',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums lining-nums',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const monthStyle: CSSProperties = {
    position: 'absolute',
    top: 139,
    left: 0,
    right: 0,
    margin: 0,
    color: theme.textColor,
    fontFamily: SHARE_DATE_FONT,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: 'normal',
    whiteSpace: 'nowrap',
  };

  const weekdayStyle: CSSProperties = {
    position: 'absolute',
    top: 179,
    left: 0,
    right: 0,
    margin: 0,
    color: theme.textColor,
    fontFamily: SHARE_WEEKDAY_FONT,
    fontSize: 11.5,
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: 'normal',
    whiteSpace: 'nowrap',
  };

  const dividerStyle: CSSProperties = {
    position: 'absolute',
    top: 224,
    left: '50%',
    width: 45,
    height: 1,
    margin: 0,
    background: theme.textColor,
    opacity: 0.34,
    transform: 'translateX(-50%)',
  };

  const contentStyle: CSSProperties = {
    flex: '1 1 auto',
    minHeight: 0,
    padding: '0 31px 28px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  };

  const quoteStyle: CSSProperties = {
    flex: '0 0 auto',
    margin: 0,
    color: theme.textColor,
    fontFamily: cardFamily,
    fontSize: 17.5,
    fontWeight: 400,
    lineHeight: '30.75px',
    letterSpacing: '0.03em',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    textAlign: 'justify',
    textAlignLast: 'left',
    textJustify: 'inter-character',
    lineBreak: 'strict' as never,
  };

  const thoughtStyle: CSSProperties = {
    marginTop: 24,
    paddingTop: 18,
    borderTop: `1px solid ${theme.accentColor}33`,
  };

  const thoughtHeadingStyle: CSSProperties = {
    margin: '0 0 10px',
    color: theme.accentColor,
    fontFamily: SHARE_SERIF_FONT,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '0.12em',
  };

  const thoughtBodyStyle: CSSProperties = {
    margin: 0,
    color: theme.textColor,
    fontFamily: cardFamily,
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.6667,
    letterSpacing: '0.015em',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  };

  const footerStyle: CSSProperties = {
    flex: '0 0 auto',
    marginTop: 15,
    paddingTop: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  };

  const titleStyle: CSSProperties = {
    maxWidth: '100%',
    margin: 0,
    color: theme.textColor,
    fontFamily: SHARE_SERIF_FONT,
    fontSize: 13.333,
    fontWeight: 500,
    lineHeight: '22px',
    letterSpacing: 'normal',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  };

  const authorStyle: CSSProperties = {
    maxWidth: '100%',
    margin: '8px 0 0',
    color: theme.textColor,
    fontFamily: SHARE_SERIF_FONT,
    fontSize: 13.333,
    fontWeight: 500,
    lineHeight: '22px',
    letterSpacing: 'normal',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  };

  const watermarkStyle: CSSProperties = {
    marginTop: 25,
    color: theme.textColor,
    fontFamily: SHARE_SERIF_FONT,
    fontSize: 13.333,
    fontWeight: 300,
    lineHeight: '22px',
    letterSpacing: '0.16em',
    opacity: 0.32,
    whiteSpace: 'nowrap',
  };

  return (
    <div data-share-card-template="calendar-book-excerpt" style={rootStyle}>
      <header data-share-header="calendar" style={calendarHeaderStyle}>
        <div data-share-font-role="day" style={dayStyle}>
          {Array.from(date.day).map((digit, index) => (
            <span
              key={`${digit}-${index}`}
              // html2canvas 绘制时不会补上 CSS letter-spacing。数字间距用真实 margin
              // 表达，预览和导出才会保持同一字距。
              style={{ marginLeft: index > 0 ? '-0.04em' : 0 }}
            >
              {digit}
            </span>
          ))}
        </div>
        <div data-share-font-role="month" style={monthStyle}>{date.monthYear}</div>
        {date.weekday && <div data-share-font-role="weekday" style={weekdayStyle}>{date.weekday}</div>}
        <div data-share-divider="calendar" style={dividerStyle} aria-hidden="true" />
      </header>

      <main style={contentStyle}>
        <p data-share-card-font="" data-share-font-role="quote" style={quoteStyle}>{quoteText}</p>

        {thought && (
          <section style={thoughtStyle} aria-label="我的想法">
            <h2 data-share-font-role="thought-label" style={thoughtHeadingStyle}>我的想法</h2>
            <p data-share-card-font="" data-share-font-role="thought" style={thoughtBodyStyle}>{thought}</p>
          </section>
        )}

        <footer style={footerStyle}>
          <div data-share-font-role="title" style={titleStyle}>《{title || '未知书目'}》</div>
          {hasAuthor && <div data-share-font-role="author" style={authorStyle}>{author}</div>}
          <div data-share-font-role="watermark" style={watermarkStyle}>折角 · Dogear</div>
        </footer>
      </main>
    </div>
  );
}
