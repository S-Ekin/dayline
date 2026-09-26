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

const PAD_LEFT = 22;
const PAD_RIGHT = 22;
const AXIS_GAP = 16;
const POINT_STEP = 34;
const BAR_W = 30;
const INTERVAL_STEP = 38;

/** 24 小时时间轴：轴线居中；左侧时间点、右侧时间区间；刻度画在轴线上；图标常显，名称+时间两行悬停展示 */
export function DayChart({ events, custom, isToday, emptyText, onEventClick }: DayChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<string | null>(null);

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
  const pointR = custom.pointRadius;

  const points = events.filter((e) => !e.isInterval);
  const intervals = events.filter((e) => e.isInterval);
  const maxPointLane = points.reduce((m, e) => Math.max(m, e.lane), -1);
  const maxIntervalLane = intervals.reduce((m, e) => Math.max(m, e.lane), -1);

  // 轴线固定在容器正中
  const W = width;
  const axisX = W / 2;
  const leftUsable = axisX - AXIS_GAP - PAD_LEFT - 2 * pointR - 8;
  const rightUsable = W - axisX - AXIS_GAP - BAR_W - 8;
  const pointStep = maxPointLane > 0 ? Math.min(POINT_STEP, Math.max(8, leftUsable / maxPointLane)) : POINT_STEP;
  const intervalStep = maxIntervalLane > 0 ? Math.min(INTERVAL_STEP, Math.max(8, rightUsable / maxIntervalLane)) : INTERVAL_STEP;

  // 时间轴显示范围：至少覆盖 06:00–23:00；任务超出该范围（含跨天）时向两侧延长，取整点边界
  const MIN_AXIS_START_MIN = 6 * 60;   // 06:00
  const MIN_AXIS_END_MIN = 23 * 60;    // 23:00
  const mins = events.flatMap((e) => (e.isInterval ? [e.startMin, e.endMin as number] : [e.startMin]));
  const minMin = Math.min(...mins);
  const maxMin = Math.max(...mins);
  const rangeStartMin = Math.min(Math.floor(minMin / 60) * 60, MIN_AXIS_START_MIN);
  let rangeEndMin = Math.max(Math.ceil(maxMin / 60) * 60, MIN_AXIS_END_MIN);
  if (rangeEndMin <= rangeStartMin) rangeEndMin = rangeStartMin + 60;
  const startHour = rangeStartMin / 60;
  const endHour = rangeEndMin / 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const padTop = 34;
  const padBottom = 24;
  const chartH = padTop + ((rangeEndMin - rangeStartMin) / 60) * hourH + padBottom;
  const yOf = (min: number) => padTop + ((min - rangeStartMin) / 60) * hourH;
  const pointX = (lane: number) => axisX - AXIS_GAP - pointR - 8 - lane * pointStep;
  const barX = (lane: number) => axisX + AXIS_GAP + lane * intervalStep;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= rangeStartMin && nowMin <= rangeEndMin;

  return (
    <div ref={containerRef} className="dl-chart">
      <svg width={W} height={chartH} style={{ display: 'block', minWidth: '100%' }}>
        {/* 中间轴线（容器正中，仅任务范围） */}
        <line x1={axisX} y1={padTop} x2={axisX} y2={chartH - padBottom}
          stroke="var(--dl-axis,#10b981)" strokeWidth={2} strokeLinecap="round" />

        {/* 刻度（画在轴线上，仅任务范围，支持 24/25/26…） */}
        {hours.map((h) => {
          const y = yOf(h * 60);
          return (
            <g key={h}>
              <line x1={axisX - 5} y1={y} x2={axisX + 5} y2={y}
                stroke="var(--dl-axis,#10b981)" strokeWidth={h === startHour ? 1.4 : 1} />
              <text x={axisX} y={y} textAnchor="middle" dominantBaseline="central"
                fontSize={10} fill="var(--dl-hour,#888)"
                paintOrder="stroke" stroke="var(--dl-halo,#fff)" strokeWidth={3}>
                {String(h).padStart(2, '0')}:00
              </text>
            </g>
          );
        })}

        {/* 现在时间线（仅显示线；超出任务范围则不显示） */}
        {showNow && (
          <line x1={PAD_LEFT} y1={yOf(nowMin)} x2={W - PAD_RIGHT} y2={yOf(nowMin)}
            stroke="var(--dl-axis,#10b981)" strokeWidth={1.4} strokeDasharray="5,4" />
        )}

        {/* 左侧：时间点 + 曲线连接到轴线，图标常显 */}
        {points.map((ev) => {
          const px = pointX(ev.lane);
          const py = yOf(ev.startMin);
          const dx = axisX - px;
          const d = `M ${px},${py} C ${px + dx * 0.35},${py - 12}, ${axisX - dx * 0.15},${py + 8}, ${axisX},${py}`;
          return (
            <g key={ev.key} className="dl-ev"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHover(ev.key)}
              onMouseLeave={() => setHover(null)}>
              <path d={d} fill="none" stroke={ev.color} strokeWidth={1.5} strokeDasharray="3,3" />
              <circle cx={px} cy={py} r={pointR} fill={ev.color} />
              <text x={px - pointR - 6} y={py} textAnchor="end" dominantBaseline="central" fontSize={14}>
                {ev.icon}
              </text>
            </g>
          );
        })}

        {/* 右侧：时间区间，图标常显 */}
        {intervals.map((ev) => {
          const x = barX(ev.lane);
          const y1 = yOf(ev.startMin);
          const y2 = yOf(ev.endMin as number);
          const yTop = Math.min(y1, y2);
          const h = Math.max(1, Math.abs(y2 - y1));
          const iconInside = h >= 20;
          return (
            <g key={ev.key} className="dl-ev"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHover(ev.key)}
              onMouseLeave={() => setHover(null)}>
              <rect x={x} y={yTop} width={BAR_W} height={h} rx={5} fill={ev.color} fillOpacity={0.9} />
              {iconInside ? (
                <text x={x + BAR_W / 2} y={yTop + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={14}>
                  {ev.icon}
                </text>
              ) : (
                <text x={x + BAR_W + 4} y={yTop + h / 2} textAnchor="start" dominantBaseline="central" fontSize={14}>
                  {ev.icon}
                </text>
              )}
            </g>
          );
        })}

        {/* 悬停提示：两行标签（名称 / 加粗时间），最后绘制保证置顶（z 顺序最高，不被其他节点图标遮挡） */}
        {hover && (() => {
          const ev = events.find((e) => e.key === hover);
          if (!ev) return null;
          const time = ev.isInterval
            ? `${formatTime(ev.startMin)}–${formatTime(ev.endMin as number)}`
            : formatTime(ev.startMin);
          const name = truncate(ev.taskValue, 10);
          const iconW = 20;
          const nameW = name.length * 13;
          const timeW = time.length * 7.5;
          const contentW = Math.max(iconW + 4 + nameW, timeW);
          const tagW = Math.min(contentW + 26, 190);
          const tagH = 46;
          const pad = 10;

          // 几何：时间点标签靠右（在图标左侧）；区间标签靠左（在条右侧）
          let tx: number; let anchor: 'start' | 'end'; let cy: number;
          if (ev.isInterval) {
            const x = barX(ev.lane);
            const yTop = Math.min(yOf(ev.startMin), yOf(ev.endMin as number));
            const hh = Math.max(1, Math.abs(yOf(ev.endMin as number) - yOf(ev.startMin)));
            tx = x + BAR_W + 10;
            anchor = 'start';
            cy = yTop + hh / 2;
          } else {
            tx = pointX(ev.lane) - pointR - 32;
            anchor = 'end';
            cy = yOf(ev.startMin);
          }
          const rectX = anchor === 'end' ? tx - tagW : tx;
          const textX = anchor === 'end' ? tx - pad : tx + pad;

          return (
            <g className="dl-tag" pointerEvents="none">
              <rect x={rectX} y={cy - tagH / 2} width={tagW} height={tagH} rx={9}
                fill="var(--dl-tag-bg,#fff)" stroke={ev.color} strokeWidth={1.2}
                filter="drop-shadow(0 3px 8px rgba(0,0,0,0.14))" />
              <text x={textX} y={cy - 6} textAnchor={anchor} dominantBaseline="central"
                fontSize={13} fontWeight={600} fill="var(--dl-text,#1f2329)">
                <tspan>{ev.icon} </tspan>{name}
              </text>
              <text x={textX} y={cy + 11} textAnchor={anchor} dominantBaseline="central"
                fontSize={13} fontWeight={800} fill={ev.color}>
                {time}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
