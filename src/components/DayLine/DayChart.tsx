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

const PAD_LEFT = 18;
const AXIS_GAP = 16;
const POINT_STEP = 34;
const BAR_W = 30;
const INTERVAL_STEP = 38;

/** 24 小时时间轴：轴线位于容器正中；左侧时间点、右侧时间区间；刻度画在轴线上；图标常显，名称+时间悬停显示 */
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
  const padTop = 34;
  const padBottom = 24;
  const chartH = padTop + 24 * hourH + padBottom;

  // 车道间距按可用宽度自适应收缩，保证内容不越界
  const leftUsable = axisX - AXIS_GAP - PAD_LEFT - 2 * pointR - 8;
  const rightUsable = W - axisX - AXIS_GAP - BAR_W - 8;
  const pointStep = maxPointLane > 0 ? Math.min(POINT_STEP, Math.max(8, leftUsable / maxPointLane)) : POINT_STEP;
  const intervalStep = maxIntervalLane > 0 ? Math.min(INTERVAL_STEP, Math.max(8, rightUsable / maxIntervalLane)) : INTERVAL_STEP;

  const yOf = (min: number) => padTop + (min / 60) * hourH;
  const pointX = (lane: number) => axisX - AXIS_GAP - pointR - 8 - lane * pointStep;
  const barX = (lane: number) => axisX + AXIS_GAP + lane * intervalStep;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div ref={containerRef} className="dl-chart">
      <svg width={W} height={chartH} style={{ display: 'block', minWidth: '100%' }}>
        {/* 中间轴线（容器正中） */}
        <line x1={axisX} y1={padTop} x2={axisX} y2={chartH - padBottom}
          stroke="var(--dl-axis,#10b981)" strokeWidth={2} strokeLinecap="round" />

        {/* 刻度（画在轴线上） */}
        {Array.from({ length: 24 }, (_, h) => {
          const y = yOf(h * 60);
          return (
            <g key={h}>
              <line x1={axisX - 5} y1={y} x2={axisX + 5} y2={y}
                stroke="var(--dl-axis,#10b981)" strokeWidth={h === 0 ? 1.4 : 1} />
              <text x={axisX} y={y} textAnchor="middle" dominantBaseline="central"
                fontSize={10} fill="var(--dl-hour,#888)"
                paintOrder="stroke" stroke="var(--dl-halo,#fff)" strokeWidth={3}>
                {String(h).padStart(2, '0')}:00
              </text>
            </g>
          );
        })}

        {/* 现在时间线（仅显示线，无文字） */}
        {isToday && nowMin >= 0 && nowMin <= 1440 && (
          <line x1={PAD_LEFT} y1={yOf(nowMin)} x2={W - PAD_LEFT} y2={yOf(nowMin)}
            stroke="var(--dl-axis,#10b981)" strokeWidth={1.4} strokeDasharray="5,4" />
        )}

        {/* 左侧：时间点 + 曲线连接到轴线，图标常显 */}
        {points.map((ev) => {
          const px = pointX(ev.lane);
          const py = yOf(ev.startMin);
          const dx = axisX - px;
          const d = `M ${px},${py} C ${px + dx * 0.35},${py - 12}, ${axisX - dx * 0.15},${py + 8}, ${axisX},${py}`;
          const show = hover === ev.key;
          return (
            <g key={ev.key} className="dl-ev"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHover(ev.key)}
              onMouseLeave={() => setHover(null)}>
              {/* 曲线连接到轴线 */}
              <path d={d} fill="none" stroke={ev.color} strokeWidth={1.5} strokeDasharray="3,3" />
              {/* 时间点 */}
              <circle cx={px} cy={py} r={pointR} fill={ev.color} />
              {/* 图标常显（点在右侧，图标在点左侧） */}
              <text x={px - pointR - 6} y={py} textAnchor="end" dominantBaseline="central" fontSize={14}>
                {ev.icon}
              </text>
              {/* 悬停：名称 + 时间 */}
              {show && (
                <text x={px - pointR - 8} y={py} textAnchor="end" dominantBaseline="central"
                  fontSize={13} paintOrder="stroke" stroke="var(--dl-halo,#fff)" strokeWidth={3} strokeLinejoin="round">
                  <tspan fontWeight={600}>{ev.taskValue}</tspan>
                  <tspan fontWeight={800} fill={ev.color}> {formatTime(ev.startMin)}</tspan>
                </text>
              )}
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
          const show = hover === ev.key;
          return (
            <g key={ev.key} className="dl-ev"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHover(ev.key)}
              onMouseLeave={() => setHover(null)}>
              {/* 区间条：高度 = 时间区间映射到刻度 */}
              <rect x={x} y={yTop} width={BAR_W} height={h} rx={5} fill={ev.color} fillOpacity={0.9} />
              {/* 图标常显（条够高放条内，条太矮放条右侧） */}
              {iconInside ? (
                <text x={x + BAR_W / 2} y={yTop + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={14}>
                  {ev.icon}
                </text>
              ) : (
                <text x={x + BAR_W + 4} y={yTop + h / 2} textAnchor="start" dominantBaseline="central" fontSize={14}>
                  {ev.icon}
                </text>
              )}
              {/* 悬停：名称 + 加粗时间 */}
              {show && (
                <text x={x + BAR_W + (iconInside ? 8 : 24)} y={yTop + h / 2} textAnchor="start" dominantBaseline="central"
                  fontSize={13} paintOrder="stroke" stroke="var(--dl-halo,#fff)" strokeWidth={3} strokeLinejoin="round">
                  <tspan fontWeight={600}>{ev.taskValue}</tspan>
                  <tspan fontWeight={800} fill={ev.color}> {formatTime(ev.startMin)}–{formatTime(ev.endMin as number)}</tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
