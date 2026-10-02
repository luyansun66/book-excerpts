// 架子。刻意拆成前后两层：
//   back  —— 背后的卡堆、两侧滚轮（都在卡片后面）
//   front —— 两条腿 + 外弯的脚 + 底部横杆、中线上的两个卡夹（都压在卡片上面）
// 合成一层的话卡片就只是"浮在架子前面"，永远做不出"插在架子里"的感觉。

import { BASE_Y, CARD_W, CARD_X, COLORS, HINGE_Y, STAGE_H, STAGE_W, TOP } from './tokens';

const CX = STAGE_W / 2;
const ROTOR_W = 31.7;
const ROTOR_H = 58.5;
/** 滚轮中心离卡片边缘多远。比半个滚轮窄，于是滚轮有 4.5px 压在卡片上，看起来是夹住卡的。 */
const ROTOR_INSET = 11.3;
const ROTOR_LEFT = CARD_X - ROTOR_INSET;
const ROTOR_RIGHT = CARD_X + CARD_W + ROTOR_INSET;

function Rotor({ cx }: { cx: number }) {
  const x = cx - ROTOR_W / 2;
  const y = HINGE_Y - ROTOR_H / 2;
  return (
    <g>
      <rect x={x} y={y} width={ROTOR_W} height={ROTOR_H} rx={9} fill={COLORS.rack} />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={x + 6}
          y={y + 12.8 + i * 9.75}
          width={ROTOR_W - 12}
          height={3}
          rx={1.5}
          fill={COLORS.rackEdge}
          opacity={0.7}
        />
      ))}
      <rect x={x + 7} y={y + 5.3} width={ROTOR_W - 14} height={3.8} rx={1.9} fill="#ffffff" opacity={0.1} />
    </g>
  );
}

const svgStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};

/**
 * stack：上槽里有没有卡。那几片纸边表示的是「上面还压着翻过的卡」，第一次进页面、
 * 一张都没翻的时候上槽是空的，纸边就会孤零零地浮在半空里，所以那时候不画。
 */
export function RackBack({ stack = true }: { stack?: boolean }) {
  return (
    <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} style={{ ...svgStyle, zIndex: 0 }} aria-hidden="true">
      {/* 探出上槽的纸边，暗示后面还压着一沓 */}
      <g style={{ opacity: stack ? 1 : 0, transition: 'opacity 260ms ease' }}>
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={CARD_X + 11.5 + i * 4.4}
            y={TOP - 14 - i * 9}
            width={CARD_W - 23 - i * 8.7}
            height={46}
            rx={7}
            fill={COLORS.stack}
            opacity={0.92 - i * 0.24}
          />
        ))}
      </g>
      <Rotor cx={ROTOR_LEFT} />
      <Rotor cx={ROTOR_RIGHT} />
      {/* 下槽底边露出来的蓝色垫块 */}
      <rect x={CX - 80.1} y={BASE_Y - 3} width={160.2} height={17} rx={8} fill={COLORS.pad} opacity={0.45} />
    </svg>
  );
}

export function RackFront() {
  const legTop = HINGE_Y + 24;
  const legBottom = BASE_Y - 30;
  const footY = BASE_Y + 29;
  /** 脚往外弯出去多少、拐弯前先横向挪多少。 */
  const footOut = 26;
  const bendX = 9;
  const bendY = BASE_Y + 19;
  const footLeft = ROTOR_LEFT - footOut;
  const footRight = ROTOR_RIGHT + footOut;
  return (
    <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} style={{ ...svgStyle, zIndex: 4 }} aria-hidden="true">
      <g fill="none" stroke={COLORS.rack} strokeWidth={12} strokeLinecap="round">
        <path
          d={`M ${ROTOR_LEFT} ${legTop} L ${ROTOR_LEFT} ${legBottom} C ${ROTOR_LEFT} ${BASE_Y} ${ROTOR_LEFT - bendX} ${bendY} ${footLeft} ${footY}`}
        />
        <path
          d={`M ${ROTOR_RIGHT} ${legTop} L ${ROTOR_RIGHT} ${legBottom} C ${ROTOR_RIGHT} ${BASE_Y} ${ROTOR_RIGHT + bendX} ${bendY} ${footRight} ${footY}`}
        />
        <path d={`M ${footLeft} ${footY} L ${footRight} ${footY}`} />
      </g>
      {/* 中线上的两个卡夹 */}
      {[-37, 23].map((dx) => (
        <g key={dx}>
          <rect x={CX + dx} y={HINGE_Y - 16.7} width={14} height={33.4} rx={5} fill={COLORS.rack} />
          <rect x={CX + dx + 3} y={HINGE_Y - 12} width={8.4} height={4.2} rx={2} fill="#ffffff" opacity={0.12} />
        </g>
      ))}
    </svg>
  );
}
