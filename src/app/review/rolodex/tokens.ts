// 名片架的尺寸、配色、字体。
//
// 舞台是一块固定尺寸的「实物」，由外面整体缩放去适配屏幕。卡片本身不变大变小，
// 字号分档才成立（见 cardFit.ts）—— 否则同一个档位在小屏和大屏上能装下的字差一倍。

export const STAGE_W = 400;
export const STAGE_H = 749.8;

/** 上槽顶边。 */
export const TOP = 41.7;
export const CARD_X = 51.6;
export const CARD_W = 296.8;
export const CARD_H = 330;

/** 中线：铰链、翻页轴、两侧滚轮都落在这一条线上。 */
export const HINGE_Y = TOP + CARD_H;

/** 下槽底边。 */
export const BASE_Y = TOP + CARD_H * 2;

/** 整块舞台的缩放上限：小屏铺满，大屏别撑成一面墙。 */
export const MAX_STAGE_SCALE = 1.15;

export const COLORS = {
  /** 架子与滚轮的近黑色 */
  rack: '#15171c',
  rackEdge: '#0a0b0e',
  /** 纸张 */
  paper: '#fdfcf9',
  /** 正文墨色 */
  ink: '#20232a',
  inkSoft: '#7d838d',
  /** 背后那几张卡的纸边 */
  stack: '#e9e7e1',
  /** 下槽底部的蓝色垫块 */
  pad: '#6f9dd0',
} as const;

/** 正文衬线：优先项目里已有的明朝体，再退系统宋体。 */
export const SERIF_STACK = '"HuiWenMingChao", "Songti SC", "Noto Serif SC", serif';

/** 手写体：中文走楷书，西文退到花体。用于轮次结束卡、提示语这类「手写」语气的文字。 */
export const HAND_STACK = '"FZBeiWeiKaiShu", "SnellRoundhand", "Segoe Script", cursive';

/**
 * 信息栏用的黑体：方正兰亭细黑。
 *
 * 用项目里自己带的那份 woff2，而不是系统的 Lantinghei SC —— 系统那款只有 macOS 有，
 * 且细黑是 Extralight 字重、得靠 font-weight 才挑得出来；自带这份到哪都是同一个字形，
 * 也和分享卡片里那个「兰亭细黑」选项同源（见 src/styles/fonts.css）。
 */
export const HEI_STACK = '"FZLanTingXiHei", "PingFang SC", sans-serif';
