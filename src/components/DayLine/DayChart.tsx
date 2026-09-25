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

const HOUR_LABEL_W = 56;
const AXIS_GAP = 10;
const POINT_STEP = 34;
const BAR_W = 26;
const INTERVAL_STEP = 36;
const LABEL_SPACE = 180;

/** 24 小时时间轴：轴线居中，左侧刻度+时间点（曲线连到轴线），右侧时间区间；标签仅悬停显示 */
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

  const pointSpan = Math.max(56, (maxPointLane + 1) * POINT_STEP);
  const intervalSpan = Math.max(50, (maxIntervalLane + 1) * INTERVAL_STEP);
  const axisX = HOUR_LABEL_W + AXIS_GAP + pointSpan + AXIS_GAP;
  const padTop = 34;
  const padBottom = 24;
  const chartH = padTop + 24 * hourH + padBottom;
  const svgW = axisX + AXIS_GAP + intervalSpan + LABEL_SPACE;

  const yOf = (min: number) => padTop + (min / 60) * hourH;
  const pointX = (lane: number) => axisX - AXIS_GAP - pointR - 4 - lane * POINT_STEP;
  const barX = (lane: number) => axisX + AXIS_GAP + lane * INTERVAL_STEP;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="dl-chart">
      <svg width={svgW} height={chartH} style={{ display: 'block', minWidth: '100%' }}>
        {/* 小时刻度（左侧） */}
        {Array.from({ length: 24 }, (_, h) => {
          const y = yOf(h * 60);
          return (
            <g key={h}>
              <line x1={HOUR_LABEL_W + 6} y1={y} x2={axisX - 4} y2={y}
                stroke="var(--dl-tick, rgba(31,35,41,0.12))" strokeWidth={h === 0 ? 1.2 : 0.7}
                strokeDasharray={h === 0 ? undefined : '2,3'} />
              <text x={HOUR_LABEL_W - 2} y={y} textAnchor="end" dominantBaseline="central"
                fontSize={11} fill="var(--dl-hour,#888)">
                {String(h).padStart(2, '0')}:00
              </text>
            </g>
          );
        })}

        {/* 中间轴线 */}
        <line x1={axisX} y1={padTop} x2={axisX} y2={chartH - padBottom}
          stroke="var(--dl-axis,#10b981)" strokeWidth={2} strokeLinecap="round" />

        {/* 现在时间线 */}
        {isToday && nowMin >= 0 && nowMin <= 1440 && (
          <g>
            <line x1={HOUR_LABEL_W} y1={yOf(nowMin)} x2={axisX + AXIS_GAP + intervalSpan} y2={yOf(nowMin)}
              stroke="var(--dl-axis,#10b981)" strokeWidth={1.2} strokeDasharray="4,4" />
            <rect x={axisX - 26} y={yOf(nowMin) - 9} width={48} height={18} rx={9} fill="#10b981" />
            <text x={axisX - 2} y={yOf(nowMin)} textAnchor="middle" dominantBaseline="central"
              fontSize={10} fill="#fff" fontWeight={600}>现在</text>
          </g>
        )}

        {/* 左侧：时间点 + 曲线连接到轴线 */}
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
              {/* 悬停标签 */}
              {show && (
                <text x={px - pointR - 8} y={py} textAnchor="end" dominantBaseline="central"
                  fontSize={13} paintOrder="stroke" stroke="var(--dl-halo,#fff)" strokeWidth={3} strokeLinejoin="round">
                  <tspan>{ev.icon} </tspan>
                  <tspan fontWeight={600}>{ev.taskValue}</tspan>
                  <tspan fontWeight={800} fill={ev.color}> {formatTime(ev.startMin)}</tspan>
                </text>
              )}
            </g>
          );
        })}

        {/* 右侧：时间区间 */}
        {intervals.map((ev) => {
          const x = barX(ev.lane);
          const y1 = yOf(ev.startMin);
          const y2 = yOf(ev.endMin as number);
          const yTop = Math.min(y1, y2);
          const h = Math.max(1, Math.abs(y2 - y1));
          const show = hover === ev.key;
          return (
            <g key={ev.key} className="dl-ev"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHover(ev.key)}
              onMouseLeave={() => setHover(null)}>
              {/* 区间条：高度 = 时间区间映射到刻度 */}
              <rect x={x} y={yTop} width={BAR_W} height={h} rx={5} fill={ev.color} fillOpacity={0.9} />
              {/* 悬停标签（时间加粗醒目） */}
              {show && (
                <text x={x + BAR_W + 8} y={yTop + h / 2} textAnchor="start" dominantBaseline="central"
                  fontSize={13} paintOrder="stroke" stroke="var(--dl-halo,#fff)" strokeWidth={3} strokeLinejoin="round">
                  <tspan>{ev.icon} </tspan>
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
