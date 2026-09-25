import React, { useEffect, useRef, useState } from 'react';
import { DayEvent, formatTime } from './utils';
import { ICustomConfig } from './config';

interface DayChartProps {
  events: DayEvent[];
  custom: ICustomConfig;
  isToday: boolean;
  emptyText: string;
  onEventClick: (ev: DayEvent) => void;
}

const HOUR_LABEL_W = 64;

/** 24 小时纵向时间轴：左侧小时刻度 + 右侧按车道排布的事件（区间条 / 时间点） */
export function DayChart({ events, custom, isToday, emptyText, onEventClick }: DayChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.max(360, entries[0].contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (events.length === 0) {
    return (
      <div ref={containerRef} className="dl-chart empty">
        {emptyText || ''}
      </div>
    );
  }

  const hourH = custom.hourHeight;
  const barH = custom.barHeight;
  const pointR = custom.pointRadius;

  const maxLane = events.reduce((m, e) => Math.max(m, e.lane), 0);
  const laneCount = maxLane + 1;
  const laneW = Math.max(150, (width - HOUR_LABEL_W - 36) / Math.max(laneCount, 1));
  const labelW = 200;

  const axisX = HOUR_LABEL_W;
  const padTop = 22;
  const padBottom = 22;
  const chartH = padTop + 24 * hourH + padBottom;
  const svgW = axisX + laneCount * laneW + labelW + 20;

  const yOf = (min: number) => padTop + (min / 60) * hourH;

  // 现在时间指示线（今天）
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div ref={containerRef} className="dl-chart">
      <svg width={svgW} height={chartH} style={{ display: 'block', minWidth: '100%' }}>
        {/* 小时刻度 */}
        {Array.from({ length: 24 }, (_, h) => {
          const y = yOf(h * 60);
          return (
            <g key={h}>
              <line x1={axisX} y1={y} x2={axisX + laneCount * laneW} y2={y}
                stroke="var(--dl-tick, rgba(31,35,41,0.12))" strokeWidth={h === 0 ? 1.2 : 0.7}
                strokeDasharray={h === 0 ? undefined : '2,3'} />
              <text x={axisX - 8} y={y} textAnchor="end" dominantBaseline="central"
                fontSize={11} fill="var(--dl-hour,#888)">
                {String(h).padStart(2, '0')}:00
              </text>
            </g>
          );
        })}

        {/* 轴线 */}
        <line x1={axisX} y1={padTop} x2={axisX} y2={chartH - padBottom}
          stroke="var(--dl-axis,#10b981)" strokeWidth={2} strokeLinecap="round" />

        {/* 现在时间线 */}
        {isToday && nowMin >= 0 && nowMin <= 1440 && (
          <g>
            <line x1={axisX} y1={yOf(nowMin)} x2={axisX + laneCount * laneW} y2={yOf(nowMin)}
              stroke="var(--dl-axis,#10b981)" strokeWidth={1.2} strokeDasharray="4,4" />
            <rect x={axisX - 20} y={yOf(nowMin) - 9} width={40} height={18} rx={9} fill="#10b981" />
            <text x={axisX} y={yOf(nowMin)} textAnchor="middle" dominantBaseline="central"
              fontSize={10} fill="#fff" fontWeight={600}>现在</text>
          </g>
        )}

        {/* 事件 */}
        {events.map((ev) => {
          const laneX = axisX + ev.lane * laneW;
          const cx = laneX + laneW / 2;
          const y1 = yOf(ev.startMin);
          const y2 = ev.isInterval ? yOf(ev.endMin as number) : y1;
          const pillH = ev.isInterval ? Math.max(barH, y2 - y1) : barH;
          const pillY = ev.isInterval ? Math.min(y1, y2) : y1 - pillH / 2;
          const showInside = pillH >= 30;
          const iconSize = 15;
          const fontSize = 12;

          return (
            <g key={ev.key} className="dl-ev" onClick={() => onEventClick(ev)}>
              {/* 区间 / 时间点块 */}
              {ev.isInterval ? (
                <rect x={laneX + 2} y={pillY} width={laneW - 4} height={pillH} rx={6}
                  fill={ev.color} fillOpacity={0.9} />
              ) : (
                <circle cx={cx} cy={y1} r={pointR} fill={ev.color} />
              )}

              {/* 图标 + 文字标签 */}
              {ev.isInterval && showInside ? (
                <>
                  <text x={laneX + 8 + iconSize / 2} y={pillY + pillH / 2} textAnchor="middle"
                    dominantBaseline="central" fontSize={iconSize}>{ev.icon}</text>
                  <text x={laneX + 8 + iconSize + 5} y={pillY + pillH / 2} textAnchor="start"
                    dominantBaseline="central" fontSize={fontSize} fontWeight={600} fill="#fff">
                    {truncate(ev.taskValue, Math.max(6, (laneW - 20 - iconSize - 6) / fontSize))}
                  </text>
                </>
              ) : (
                <>
                  <line x1={ev.isInterval ? laneX + laneW - 4 : cx + pointR} y1={pillY + pillH / 2}
                    x2={ev.isInterval ? laneX + laneW - 4 : cx + pointR + 8} y2={pillY + pillH / 2}
                    stroke={ev.color} strokeWidth={1.5} />
                  <text x={ev.isInterval ? laneX + laneW - 4 + 6 : cx + pointR + 8} y={pillY + pillH / 2}
                    textAnchor="start" dominantBaseline="central" fontSize={iconSize}>{ev.icon}</text>
                  <text x={ev.isInterval ? laneX + laneW - 4 + 6 + iconSize + 3 : cx + pointR + 8 + iconSize + 3}
                    y={pillY + pillH / 2} textAnchor="start" dominantBaseline="central"
                    fontSize={fontSize} fontWeight={600} fill="var(--dl-text,#1f2329)">
                    {truncate(ev.taskValue, 16)}
                  </text>
                </>
              )}

              {/* 时间标注 */}
              <text x={cx} y={ev.isInterval ? y1 - 6 : y1 - pointR - 6}
                textAnchor="middle" dominantBaseline="central" fontSize={10}
                fill="var(--dl-sub,#999)">
                {ev.isInterval
                  ? `${formatTime(ev.startMin)} – ${formatTime(ev.endMin as number)}`
                  : formatTime(ev.startMin)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
