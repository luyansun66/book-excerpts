// ─── 名片架的翻页状态机 ───────────────────────────────────────────────────────
//
// 三层卡片：上槽（已翻过的那张，静态）、下槽（下一张，静态）、翻页片（当前这张）。
// 翻页片挂在中线上、以顶边为轴做 rotateX：往前翻到上槽（0° → 180°），往回翻回下槽
// （180° → 0°）。上下两张静态卡始终在底下备着，所以 90° 前后看到的东西是连着的 ——
// 正面转到 90° 看不见的瞬间，背面（预转 180°、背对隐藏）正好转出来，不用手动切 opacity。
//
// 几个坑，分散在下面各处：
//   · 透视写成翻页片自己的 transform 函数，舞台不带 perspective 属性。带的话舞台就
//     成了 3D 渲染上下文，浏览器按景深排序，翻起来的那半张（z 为负）会被同平面的
//     下一张切掉一截。写成 transform 函数后绘制次序回到 z-index，才是实物的层序。
//   · 圆角 + overflow:hidden 放在 ExcerptCard 这个叶子节点上，绝不放在 preserve-3d
//     的容器上 —— iOS Safari 上两者一叠加就把 3D 压平，翻页会退化成整块位移。
//   · 提交（index 前进）和复位（角度归零）必须落在同一帧：复位放在 useLayoutEffect
//     里、在绘制之前完成，中间不会闪出"上槽还是上一张"的画面。
//   · 方向没有"已经锁定"这一说。停下时上槽显示的是 deck[index-1]、下槽是 deck[index]，
//     这套内容无论 dir 是正是负都一样（只是谁在画而已），所以锁定时可以无损地
//     把 dir 归一化 —— 这正是往回翻能瞬间把翻页片搬到上槽的原因。

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'motion/react';
import type { Book, Quote } from '../../types';
import { flipHaptic, primeHaptics } from '../haptics';
import type { DeckEntry } from '../deck';
import ExcerptCard from './ExcerptCard';
import RoundEndCard from './RoundEndCard';
import { RackBack, RackFront } from './RolodexRack';
import { CARD_H, CARD_W, CARD_X, HINGE_Y, STAGE_H, STAGE_W, TOP } from './tokens';

/** 手指位移换算成"翻满一整程"需要多少舞台像素。比卡片高一点，一程内不用甩得太快。 */
const DRAG_RANGE = CARD_H * 1.2;
/** 认方向之前允许的抖动：小于它先不动，免得把点击和小抖动读成拖拽。 */
const LOCK_SLOP = 6;
/** 松手时已经翻过这个比例 → 继续翻完，否则弹回。 */
const COMMIT_PROGRESS = 0.35;
/** 甩动速度阈值（舞台像素/秒）：够快就直接翻过去，不看进度。 */
const FLING_PX_PER_S = 700;
/** 到底了还往外拖的最大形变量（progress 单位）。 */
const RUBBER_MAX = 0.07;

/** 翻一整程（0→1）的时长。 */
const FLIP_FULL_S = 0.5;
/** 时长的下限：再短就是"啪"地一下贴上，没有落下的过程。 */
const FLIP_MIN_S = 0.22;
/** 透视距离。舞台整体会被缩放，透视写在舞台内部才不随屏幕尺寸改变观感。 */
const PERSPECTIVE = 1400;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

interface Gesture {
  pointerId: number;
  startY: number;
  lastY: number;
  lastT: number;
  /** 平滑后的速度（屏幕像素/秒，正 = 向下）。 */
  v: number;
  dir: 1 | -1 | null;
  /** 起点对应的 progress：按下时若动画正播到一半，从这里接着拖。 */
  base: number;
  /** 该方向已经没有下一张：只做阻尼形变，松手必回弹。 */
  blocked: boolean;
}

export interface RolodexHandle {
  /** 供翻页按钮 / 键盘调用，走和甩动一样的动画与提交路径。 */
  go: (dir: 1 | -1) => void;
}

interface Props {
  deck: DeckEntry[];
  index: number;
  /** 舞台当前的缩放倍数：手势位移要除掉它才能还原成舞台像素。 */
  scale: number;
  bookOf: (bookId: string) => Book | null | undefined;
  /** 只有"翻过去"的摘录才算回顾过。 */
  onReviewed: (quote: Quote) => void;
  onIndexChange: (next: number) => void;
  onOpenFull?: (quote: Quote) => void;
}

const cardLayer = (top: number): CSSProperties => ({
  position: 'absolute',
  left: CARD_X,
  top,
  width: CARD_W,
  height: CARD_H,
  pointerEvents: 'none',
});

/** 翻页片上的压暗：背面也得有，否则翻到上半程会突然变亮。 */
function Shade({ value }: { value: MotionValue<number> }) {
  return (
    <motion.span
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 12,
        background: '#0b0d12',
        opacity: value,
        pointerEvents: 'none',
      }}
    />
  );
}

function SlotCard({
  entry,
  bookOf,
  onOpenFull,
  dim = false,
}: {
  entry: DeckEntry | undefined;
  bookOf: (bookId: string) => Book | null | undefined;
  onOpenFull?: (quote: Quote) => void;
  /** 上槽常态压暗一点：翻页片落上去时（自身也带 0.05 暗度）才接得上，不会突然变亮。 */
  dim?: boolean;
}) {
  if (!entry) return null;
  return (
    <>
      {entry.kind === 'roundEnd' ? (
        <RoundEndCard count={entry.count} />
      ) : (
        <ExcerptCard quote={entry.quote} book={bookOf(entry.quote.bookId)} onOpenFull={onOpenFull} />
      )}
      {dim && (
        <span
          aria-hidden
          style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(12,14,20,0.05)' }}
        />
      )}
    </>
  );
}

const Rolodex = forwardRef<RolodexHandle, Props>(function Rolodex(
  { deck, index, scale, bookOf, onReviewed, onIndexChange, onOpenFull },
  ref,
) {
  const reduce = useReducedMotion() ?? false;

  // dir 既驱动渲染（决定三层各放哪张卡），也参与角度换算，所以状态和 MotionValue 双份。
  const [dir, setDir] = useState<1 | -1>(1);
  const dirMV = useMotionValue(1);
  /** 0 = 停在下槽，1 = 翻到上槽。往哪个方向翻由 dir 决定。 */
  const progress = useMotionValue(0);
  /** 只有"减弱动态效果"用得到：整块舞台的淡入淡出。 */
  const fade = useMotionValue(1);

  const controls = useRef<AnimationPlaybackControls | null>(null);
  const pendingReset = useRef(false);
  const suppressTap = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState(false);

  const angle = useTransform([progress, dirMV], ([p, d]: number[]) => (d >= 0 ? p : 1 - p) * 180);
  // 角度取正才是"朝外翻"：翻页片的顶边就是铰链、卡身向 +Y 伸出去，rotateX(+) 让
  // 顶边以下那半张先朝观察者鼓出来再挑上去，和实物的 Rolodex 一样。取负会把卡压进
  // 屏幕里（朝内折），透视缩下去，看着像卡片往架子里缩。
  const flapTransform = useTransform(angle, (a) => `perspective(${PERSPECTIVE}px) rotateX(${a}deg)`);
  /** 90° 附近最暗（纸的厚度），落进上槽后只留一点点，和静态上槽的压暗对齐。 */
  const shade = useTransform(angle, (a) => 0.25 * Math.sin((a * Math.PI) / 180) + 0.05 * (a / 180));
  /** 下一张从下面顶上来：起步慢、末段贴住，留一点"刚才被压着"的余量。 */
  const lowerY = useTransform([progress, dirMV], ([p, d]: number[]) => (d < 0 ? 0 : (1 - p) * (1 - p) * 9));

  const commit = useCallback(
    (d: 1 | -1) => {
      const from = deck[index];
      if (d === 1 && from?.kind === 'excerpt') onReviewed(from.quote);
      // 先立牌子再改 index：layout effect 会在这之后、绘制之前把角度归零。
      pendingReset.current = true;
      onIndexChange(index + d);
      flipHaptic();
    },
    [deck, index, onIndexChange, onReviewed],
  );

  // index 一变就把翻页片复位成"停在下槽"。必须是 layout effect —— 放到普通 effect 里
  // 会先绘一帧"翻页片刚离开上槽、上槽还是上一张"，那就是肉眼能看到的闪。
  useLayoutEffect(() => {
    if (!pendingReset.current) return;
    pendingReset.current = false;
    dirMV.set(1);
    progress.set(0);
    setDir(1);
    if (reduce) {
      fade.set(0);
      animate(fade, 1, { duration: 0.22 });
    }
  }, [index, reduce, dirMV, progress, fade]);

  const settle = useCallback(
    (complete: boolean, d: 1 | -1, velocityProgress: number, fromRest: boolean) => {
      if (reduce) {
        if (!complete) return;
        // 关了动效就不翻页，只做一次淡出 → 换卡 → 淡入。
        animate(fade, 0, { duration: 0.12 }).then(() => commit(d));
        return;
      }
      const remaining = Math.abs((complete ? 1 : 0) - progress.get());
      const speed = Math.abs(velocityProgress);
      controls.current = animate(progress, complete ? 1 : 0, {
        // 时长按"还剩多远"给，中途接手时不会走满一整程；甩得狠就按速度缩短，但不破下限。
        duration: Math.max(
          FLIP_MIN_S,
          Math.min(FLIP_FULL_S * remaining, speed > 0.5 ? remaining / speed : Infinity),
        ),
        // 静止起步（按钮、键盘）两头都缓；手指甩出去的接着速度走，只缓落下的那一头。
        ease: fromRest ? 'easeInOut' : 'easeOut',
        onComplete: () => {
          controls.current = null;
          if (complete) commit(d);
        },
      });
    },
    [reduce, fade, commit, progress],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element | null)?.closest?.('[data-no-pan]')) return;

    primeHaptics();
    // 动画播到一半也能按下去：停住，从当前姿态接着走，而不是等它播完。
    controls.current?.stop();
    controls.current = null;
    suppressTap.current = false;

    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p0 = progress.get();
    const interrupted = p0 > 0.001 && p0 < 0.999;
    gesture.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: performance.now(),
      v: 0,
      // 中途按下时方向已经定了，直接接着拖；静止时留空，等第一次位移再定。
      dir: interrupted ? (dirMV.get() as 1 | -1) : null,
      base: interrupted ? p0 : 0,
      blocked: false,
    };
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;

    const now = performance.now();
    const dt = now - g.lastT;
    if (dt > 0) {
      // 指数平滑：只看最后一段会把手指离开前的抖动放大成一次"甩"。
      g.v = g.v * 0.6 + ((e.clientY - g.lastY) / dt) * 1000 * 0.4;
      g.lastY = e.clientY;
      g.lastT = now;
    }

    const dy = e.clientY - g.startY;
    const dyStage = dy / (scale || 1);

    if (g.dir === null) {
      if (Math.abs(dy) < LOCK_SLOP) return;
      const want: 1 | -1 = dy < 0 ? 1 : -1;
      if (want === 1) {
        g.dir = 1;
        g.base = 0;
        g.blocked = index >= deck.length - 1;
      } else {
        // 已经在第一张，往回没东西可翻：不给形变，免得把空卡翻出来。
        if (index <= 0) {
          g.blocked = true;
          return;
        }
        g.dir = -1;
        g.base = 0;
      }
      // 归一化方向。停下时上槽内容在两个 dir 下是一样的，所以这一步看不出跳变。
      dirMV.set(g.dir);
      setDir(g.dir);
    }

    const travel = (g.dir === 1 ? -dyStage : dyStage) + g.base * DRAG_RANGE;
    const raw = travel / DRAG_RANGE;
    // 到底了还往外拖：位移换成递减的阻力，最多歪 RUBBER_MAX。
    progress.set(g.blocked ? RUBBER_MAX * (1 - 1 / (Math.max(raw, 0) / 0.35 + 1)) : clamp01(raw));
  };

  const endGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!g || g.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    // 没锁定方向 = 一次点击；到头回弹后停回原位 = 什么也没发生。两种情况都留给卡片上的按钮。
    if (g.dir === null) return;
    if (g.blocked && progress.get() === 0) return;

    suppressTap.current = true;
    const vStage = g.v / (scale || 1);
    // 换算成"朝翻页方向"的速度：向回翻时向下为正、正好就是朝完成的方向。
    const vSigned = g.dir === 1 ? -vStage : vStage;
    const complete = !g.blocked && (progress.get() > COMMIT_PROGRESS || vSigned > FLING_PX_PER_S);
    settle(complete, g.dir, vSigned / DRAG_RANGE, false);
  };

  const go = useCallback(
    (d: 1 | -1) => {
      if (controls.current) return;
      const canGo = d === 1 ? index < deck.length - 1 : index > 0;
      if (!canGo) return;
      if (!reduce && d === -1) {
        // 往回翻要先把翻页片瞬移到上槽：那个位置本来就显示着同一张卡。
        dirMV.set(-1);
        setDir(-1);
        progress.set(0);
      }
      settle(true, d, 0, true);
    },
    [deck.length, index, reduce, settle, dirMV, progress],
  );

  useImperativeHandle(ref, () => ({ go }), [go]);

  const upper = deck[index - 1];
  const lower = reduce ? deck[index] : deck[index + 1];
  const flap = reduce ? undefined : dir >= 0 ? deck[index] : deck[index - 1];

  const stageStyle: CSSProperties = {
    position: 'relative',
    width: STAGE_W,
    height: STAGE_H,
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    cursor: dragging ? 'grabbing' : 'grab',
  };

  const faceStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  };

  return (
    <motion.div
      style={{ ...stageStyle, opacity: fade }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      role="group"
      aria-label="摘录名片架"
    >
      <RackBack stack={upper !== undefined} />

      {/* 上槽：已经翻过去的那张 */}
      <div style={{ ...cardLayer(TOP), zIndex: 1 }}>
        <SlotCard entry={upper} bookOf={bookOf} dim />
      </div>

      {/* 下槽：还没轮到的那张，藏在翻页片底下，翻页片一走就顶上来 */}
      <motion.div style={{ ...cardLayer(HINGE_Y), zIndex: 1, y: reduce ? 0 : lowerY }}>
        <SlotCard entry={lower} bookOf={bookOf} />
      </motion.div>

      {!reduce && (
        <>
          <motion.div
            aria-hidden
            style={{
              ...cardLayer(HINGE_Y),
              zIndex: 2,
              borderRadius: 12,
              boxShadow: '0 20px 34px rgba(12,14,20,0.34)',
              opacity: shade,
            }}
          />

          {/* 翻页片：当前这张 */}
          <motion.div
            onClickCapture={(e) => {
              if (!suppressTap.current) return;
              suppressTap.current = false;
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              ...cardLayer(HINGE_Y),
              zIndex: 3,
              // cardLayer 默认吃掉指针事件；翻页片是唯一要收点击的一层（卡片上的「全文」）。
              pointerEvents: 'auto',
              transformOrigin: '50% 0%',
              transformStyle: 'preserve-3d',
              transform: flapTransform,
              willChange: 'transform',
            }}
          >
            <div style={faceStyle}>
              <SlotCard entry={flap} bookOf={bookOf} onOpenFull={onOpenFull} />
              <Shade value={shade} />
            </div>
            {/* 背面：绕自己的中心预转 180°，翻过半程后正好在上槽里正着读 */}
            <div style={{ ...faceStyle, transform: 'rotateX(180deg)' }}>
              <SlotCard entry={flap} bookOf={bookOf} />
              <Shade value={shade} />
            </div>
          </motion.div>
        </>
      )}

      <RackFront />
    </motion.div>
  );
});

export default Rolodex;
