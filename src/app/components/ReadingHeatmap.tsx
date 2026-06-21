// ─── Reading Heatmap (GitHub-style contribution calendar) ─────────────────────
import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ReadingHeatmapProps {
  dailyCounts: Record<string, number>;
  year: number;
  onYearChange: (year: number) => void;
  minYear: number;
  maxYear: number;
}

// Color scale (warm vintage palette matching app aesthetic)
const COLORS = [
  '#F0EBE0',  // 0
  '#E8DCC8',  // 1-2
  '#D4C4A0',  // 3-5
  '#C4A84A',  // 6-10
  '#A08530',  // 11-20
  '#2a1e0e',  // 21+
];

function getColor(count: number): string {
  if (count === 0) return COLORS[0];
  if (count <= 2) return COLORS[1];
  if (count <= 5) return COLORS[2];
  if (count <= 10) return COLORS[3];
  if (count <= 20) return COLORS[4];
  return COLORS[5];
}

export default function ReadingHeatmap({ dailyCounts, year, onYearChange, minYear, maxYear }: ReadingHeatmapProps) {
  // Generate the grid data: array of weeks, each week is 7 days (0=Sun)
  const grid = useMemo(() => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);

    // Find the Sunday on or before Jan 1
    const firstDay = new Date(start);
    firstDay.setDate(firstDay.getDate() - firstDay.getDay());

    // Find the Saturday on or after Dec 31
    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

    const weeks: Array<Array<{ date: Date; count: number }>> = [];
    const current = new Date(firstDay);

    while (current <= lastDay) {
      const week: Array<{ date: Date; count: number }> = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(current);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const count = dailyCounts[key] || 0;
        week.push({ date: dt, count });
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
    }

    return weeks;
  }, [dailyCounts, year]);

  // Month labels: find the first week index where each month starts
  const monthLabels = useMemo(() => {
    const labels: Array<{ index: number; name: string }> = [];
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    for (let m = 0; m < 12; m++) {
      // Find the week that contains the 1st of this month
      const firstOfMonth = new Date(year, m, 1);
      // Calculate days since grid start
      const gridStart = new Date(grid[0]?.[0]?.date || firstOfMonth);
      const diff = Math.round((firstOfMonth.getTime() - gridStart.getTime()) / 86400000);
      const weekIndex = Math.floor(diff / 7);
      if (weekIndex >= 0 && weekIndex < grid.length) {
        labels.push({ index: weekIndex, name: months[m] });
      }
    }
    return labels;
  }, [grid, year]);

  const CELL = 14;
  const GAP = 2;
  const COL_W = CELL + GAP;
  const ROW_H = CELL + GAP;

  const hasData = Object.keys(dailyCounts).some(k => k.startsWith(String(year)));

  return (
    <div>
      {/* Year navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
        <button
          onClick={() => onYearChange(year - 1)}
          disabled={year <= minYear}
          style={{ background: 'none', border: 'none', cursor: year > minYear ? 'pointer' : 'default', padding: 4, lineHeight: 1, opacity: year > minYear ? 0.5 : 0.2 }}
        >
          <ChevronLeft size={14} color="#2c2416" strokeWidth={2} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#2c2416', minWidth: 50, textAlign: 'center' }}>
          {year}
        </span>
        <button
          onClick={() => onYearChange(year + 1)}
          disabled={year >= maxYear}
          style={{ background: 'none', border: 'none', cursor: year < maxYear ? 'pointer' : 'default', padding: 4, lineHeight: 1, opacity: year < maxYear ? 0.5 : 0.2 }}
        >
          <ChevronRight size={14} color="#2c2416" strokeWidth={2} />
        </button>
      </div>

      {!hasData ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#b8ae9a', fontSize: 11, fontFamily: '-apple-system, sans-serif' }}>
          该年份无阅读记录
        </div>
      ) : (
        <div style={{ overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
          <style>{`.hm-scroll-${year}::-webkit-scrollbar { display: none; }`}</style>

          <div className={`hm-scroll-${year}`} style={{ display: 'flex', gap: 0, position: 'relative' }}>
            {/* Day-of-week labels column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, paddingRight: 4, paddingTop: 14 }}>
              {['一', '三', '五'].map((label) => (
                <div key={label} style={{ height: CELL, display: 'flex', alignItems: 'center', fontSize: 9, color: '#b8ae9a', fontFamily: '-apple-system, sans-serif', lineHeight: 1 }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Grid + month labels */}
            <div style={{ position: 'relative' }}>
              {/* Month labels */}
              <div style={{ display: 'flex', height: 14, alignItems: 'flex-end', marginBottom: 2 }}>
                {monthLabels.map((ml) => (
                  <div
                    key={ml.name}
                    style={{
                      position: 'absolute',
                      left: ml.index * COL_W,
                      fontSize: 9,
                      color: '#b8ae9a',
                      fontFamily: '-apple-system, sans-serif',
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ml.name}
                  </div>
                ))}
              </div>

              {/* Cells */}
              <div style={{ display: 'flex', gap: GAP }}>
                {grid.map((week, wi) => (
                  <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                    {week.map((day, di) => {
                      const isCurrentYear = day.date.getFullYear() === year;
                      const isOutside = !isCurrentYear;
                      return (
                        <div
                          key={di}
                          title={`${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}: ${day.count}条`}
                          style={{
                            width: CELL,
                            height: CELL,
                            borderRadius: 1.5,
                            background: isOutside ? 'transparent' : getColor(day.count),
                            flexShrink: 0,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {hasData && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 8, paddingRight: 4 }}>
          <span style={{ fontSize: 7, color: '#b8ae9a', fontFamily: '-apple-system, sans-serif', marginRight: 2 }}>少</span>
          {COLORS.map((c, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: 1.5, background: c, flexShrink: 0 }} />
          ))}
          <span style={{ fontSize: 7, color: '#b8ae9a', fontFamily: '-apple-system, sans-serif', marginLeft: 2 }}>多</span>
        </div>
      )}
    </div>
  );
}
