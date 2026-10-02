// 一轮翻完时插进来的过渡卡。没有它的话"新一轮"和"同一批卡绕回来"在体感上分不开。

import { memo } from 'react';
import { COLORS, HAND_STACK, SERIF_STACK } from './tokens';

function RoundEndCardImpl({ count }: { count: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 12,
        background: `linear-gradient(180deg, ${COLORS.paper} 0%, #f6f3ec 100%)`,
        overflow: 'hidden',
        boxShadow: '0 10px 22px rgba(18,20,26,0.16), inset 0 1px 0 rgba(255,255,255,0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      <div style={{ fontFamily: HAND_STACK, fontSize: 30, color: COLORS.ink, lineHeight: 1.1 }}>
        本轮回顾完成
      </div>
      <div style={{ fontFamily: SERIF_STACK, fontSize: 13, letterSpacing: 2, color: COLORS.inkSoft }}>
        已重读 {count} 条摘录
      </div>
      <div style={{ fontFamily: SERIF_STACK, fontSize: 12, letterSpacing: 1, color: 'rgba(125,131,141,0.75)' }}>
        马上开始下一轮
      </div>
    </div>
  );
}

export default memo(RoundEndCardImpl);
