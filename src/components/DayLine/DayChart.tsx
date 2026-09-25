import React, { useState } from 'react';
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
const LABEL_SPACE = 190;

/** 24 小时时间轴：轴线居中，刻度画在轴线上；左侧时间点、右侧时间区间；图标常显，名称+时间悬停显示 */
export function DayChart({ events, custom, isToday, emptyText, onEventClick }: DayChartProps) {
  const [hover, setHover] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div className="dl-chart empty">
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

  const pointSpan = Math.max(64, (maxPointLane + 1) * POINT_STEP + pointR * 2 + 10);
  const intervalSpan = Math.max(54, (maxIntervalLane + 1) * INTERVAL_STEP);
  const axisX = PAD_LEFT + pointSpan + AXIS_GAP;
  const padTop = 34;
  const padBottom = 24;
  const chartH = padTop + 24 * hourH + padBottom;
  const svgW = axisX + AXIS_GAP + intervalSpan + LABEL_SPACE;

  const yOf = (min: number) => padTop + (min / 60) * hourH;
  const pointX = (lane: number) => axisX - AXIS_GAP - pointR - 8 - lane * POINT_STEP;
  const barX = (lane: number) => axisX + AXIS_GAP + lane * INTERVAL_STEP;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="dl-chart">
      <svg width={svgW} height={chartH} style={{ display: 'block', minWidth: '100%' }}>
        {/* 中间轴线 */}
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

        {/* 现在时间线 */}
        {isToday && nowMin >= 0 && nowMin <= 1440 && (
          <g>
            <line x1={PAD_LEFT} y1={yOf(nowMin)} x2={axisX + AXIS_GAP + intervalSpan} y2={yOf(nowMin)}
              stroke="var(--dl-axis,#10b981)" strokeWidth={1.2} strokeDasharray="4,4" />
            <rect x={axisX - 26} y={yOf(nowMin) - 9} width={48} height={18} rx={9} fill="#10b981" />
            <text x={axisX - 2} y={yOf(nowMin)} textAnchor="middle" dominantBaseline="central"
              fontSize={10} fill="#fff" fontWeight={600}>现在</text>
          </g>
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
