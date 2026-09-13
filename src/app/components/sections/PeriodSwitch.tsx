import { motion, useReducedMotion } from 'motion/react';
import type { Period } from '../../db/readingTime';
import { PERIOD_LABELS } from '../../db/readingTimeUtils';

const PERIODS: Period[] = ['week', 'month', 'all'];

interface PeriodSwitchProps {
  value: Period;
  onChange: (period: Period) => void;
}

/** iOS 风格分段控件：选中段是一枚会平移的白色胶囊。 */
export default function PeriodSwitch({ value, onChange }: PeriodSwitchProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label="统计周期"
      style={{
        display: 'inline-flex',
        padding: 2,
        borderRadius: 999,
        background: 'var(--color-bg-skeleton)',
        position: 'relative',
      }}
    >
      {PERIODS.map((period) => {
        const active = period === value;
        return (
          <button
            key={period}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(period)}
            style={{
              position: 'relative',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '6px 16px',
              borderRadius: 999,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {active && (
              <motion.span
                layoutId="period-switch-pill"
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.35 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 999,
                  background: 'var(--color-bg-card)',
                  boxShadow: '0 1px 3px rgba(120, 100, 70, 0.18)',
                }}
              />
            )}
            <span
              style={{
                position: 'relative',
                display: 'block',
                fontSize: 12,
                lineHeight: 1,
                fontFamily: 'var(--font-sans)',
                fontWeight: active ? 600 : 500,
                letterSpacing: 0.8,
                color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                transition: 'color var(--transition-normal)',
              }}
            >
              {PERIOD_LABELS[period].tab}
            </span>
          </button>
        );
      })}
    </div>
  );
}
