import { useState } from 'react';
import type { Book } from '../types';
import BookCoverSurface from '../components/BookCoverSurface';
import { COVER_FACE_HEIGHT, COVER_FACE_WIDTH, COVER_TOTAL_WIDTH } from './sizes';

export interface ShelfCoverProps {
  book: Book;
  onClick: () => void;
}

/** `BookCoverSurface` 的占位文字是按 94px 封面宽标定的。 */
const COVER_ART_BASE_WIDTH = 94;

/**
 * 竖放·封面朝外。
 *
 * 只展示正面（严格 94 × 145，与经典书架一致），不额外接一条侧面书脊，
 * 也不做 3D 倾斜——倾斜会把正面的实际投影压到 94 以下。
 */
export default function ShelfCover({ book, onClick }: ShelfCoverProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        position: 'relative',
        width: COVER_TOTAL_WIDTH,
        height: COVER_FACE_HEIGHT,
      }}
    >
      {/* 接触阴影留在搁板上，不跟着 hover 一起抬起 */}
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: -2,
          height: 12,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,.38), transparent 70%)',
          filter: 'blur(8px)',
          pointerEvents: 'none',
        }}
      />

      <div
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'absolute',
          inset: 0,
          cursor: 'pointer',
          display: 'flex',
          transform: hovered ? 'translateY(-8px)' : 'translateY(0)',
          transition: 'transform 180ms ease-out',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* 正面书封 */}
        <div
          style={{
            position: 'relative',
            width: COVER_FACE_WIDTH,
            height: COVER_FACE_HEIGHT,
          }}
        >
          <BookCoverSurface
            book={book}
            style={{ width: '100%', height: '100%' }}
            artScale={COVER_FACE_WIDTH / COVER_ART_BASE_WIDTH}
          />

          {/* 书槽：封面紧挨书脊一侧的凹槽，比书脊本体的转折更轻 */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 4,
              background:
                'linear-gradient(90deg, rgba(0,0,0,.30), rgba(255,255,255,.12) 42%, transparent)',
              pointerEvents: 'none',
            }}
          />

          {/*
            2D 立体感：不做透视、不倾斜，只用平面叠光。
            左上柔光 → 四周环境暗角 → 斜向微光 → 顶部/底部受光与落影。
            所有过渡都留出足够长的渐变区，边缘再用轻微模糊收一下，
            避免出现像描边一样生硬的亮线或暗线。
          */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              filter: 'blur(.45px)',
              background: [
                'radial-gradient(125% 100% at 34% 18%, rgba(255,255,255,.22) 0%, rgba(255,255,255,.09) 26%, rgba(255,255,255,.02) 48%, transparent 62%)',
                'linear-gradient(180deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,.05) 10%, transparent 26%)',
                'linear-gradient(90deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.025) 7%, transparent 18%)',
                'radial-gradient(132% 102% at 50% 36%, transparent 46%, rgba(0,0,0,.08) 68%, rgba(0,0,0,.18) 86%, rgba(0,0,0,.30) 100%)',
                'linear-gradient(90deg, rgba(0,0,0,.16) 0%, transparent 12%, transparent 88%, rgba(0,0,0,.14) 100%)',
                'linear-gradient(0deg, rgba(0,0,0,.13) 0%, transparent 16%)',
                'linear-gradient(118deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 20%, transparent 48%, rgba(0,0,0,.06) 100%)',
              ].join(', '),
              boxShadow:
                'inset 0 0 10px rgba(0,0,0,.15), inset 0 0 3px rgba(255,255,255,.12)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
