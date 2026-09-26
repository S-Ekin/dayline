import React, { useEffect, useRef, useState } from 'react';
import { DayEvent, formatTime } from './utils';
import { ICustomConfig } from './config';

interface HorizontalDayChartProps {
  events: DayEvent[];
  custom: ICustomConfig;
  isToday: boolean;
  emptyText: string;
  onEventClick: (ev: DayEvent) => void;
}

const PAD_LEFT = 16;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;
/** lane0 时间点到轴线的间距（容纳图标） */
const POINT_GAP = 22;
/** 时间点 lane 的垂直步进 */
const POINT_STEP_V = 30;
/** 轴线到区间 lane0 的间距（容纳竖排刻度文字） */
const AXIS_BOTTOM_GAP = 40;
/** 区间条 lane 的间隙 */
const BAR_GAP = 10;

/**
 * 横向时间轴：轴线从左到右水平放置；上方为时间点（点+图标+曲线），下方为时间区间（水平条+曲线）；
 * 整点刻度为轴线上下的竖短线，时刻文字在轴线下侧；支持 24/25/26… 跨天刻度。
 */
export function HorizontalDayChart({ events, custom, isToday, emptyText, onEventClick }: HorizontalDayChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.max(260, entries[0].contentRect.width));
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

  const pointR = custom.pointRadius;

  const points = events.filter((e) => !e.isInterval);
  const intervals = events.filter((e) => e.isInterval);
  const maxPointLane = points.reduce((m, e) => Math.max(m, e.lane), -1);
  const maxIntLane = intervals.reduce((m, e) => Math.max(m, e.lane), -1);

  // 时间轴范围（至少 06:00–23:00，任务超出则向两侧延展，取整点边界）
  const MIN_AXIS_START_MIN = 6 * 60;
  const MIN_AXIS_END_MIN = 23 * 60;
  const mins = events.flatMap((e) => (e.isInterval ? [e.startMin, e.endMin as number] : [e.startMin]));
  const minMin = Math.min(...mins);
  const maxMin = Math.max(...mins);
  const rangeStartMin = Math.min(Math.floor(minMin / 60) * 60, MIN_AXIS_START_MIN);
  let rangeEndMin = Math.max(Math.ceil(maxMin / 60) * 60, MIN_AXIS_END_MIN);
  if (rangeEndMin <= rangeStartMin) rangeEndMin = rangeStartMin + 60;
  const rangeHours = (rangeEndMin - rangeStartMin) / 60;
  const startHour = rangeStartMin / 60;
  const endHour = rangeEndMin / 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  // 横向：时间轴填满容器宽度（一屏看全一天）
  const usableW = width - PAD_LEFT - PAD_RIGHT;
  const hPx = usableW / rangeHours;
  const xOf = (min: number) => PAD_LEFT + ((min - rangeStartMin) / 60) * hPx;

  // 区间条厚度（每 lane 取该 lane 内事件的最大值），形成高低起伏
  const barHOf = (w: number) => Math.min(40, Math.max(12, w));
  const laneBarH: number[] = [];
  for (const ev of intervals) {
    laneBarH[ev.lane] = Math.max(laneBarH[ev.lane] || 0, barHOf(ev.width));
  }
  const barHAt = (lane: number) => laneBarH[lane] || barHOf(custom.defaultBarWidth);

  // 纵向布局：时间点向上排，区间向下排
  const topUsed = maxPointLane >= 0 ? POINT_GAP + maxPointLane * POINT_STEP_V + pointR : 0;
  const axisY = PAD_TOP + topUsed + 10;
  let _y = axisY + AXIS_BOTTOM_GAP;
  const intervalTopAt: number[] = [];
  for (let l = 0; l <= maxIntLane; l++) {
    intervalTopAt[l] = _y;
    _y += barHAt(l) + BAR_GAP;
  }
  const bottomUsed = maxIntLane >= 0 ? _y - (axisY + AXIS_BOTTOM_GAP) : 0;
  const chartH = axisY + AXIS_BOTTOM_GAP + bottomUsed + PAD_BOTTOM;

  const pyOf = (lane: number) => axisY - POINT_GAP - lane * POINT_STEP_V;

  // 连接线避让（横向在 x 方向）：避免与其他连接线、整点刻度竖线过近
  const gapThreshold = 18;
  const maxBend = 12;
  const defaultArc = 3;
  const lineInfos = [
    ...points.map((ev) => ({ key: ev.key, x: xOf(ev.startMin) })),
    ...intervals.map((ev) => ({ key: ev.key, x: xOf(ev.startMin) })),
  ];
  const obstacleXs = [
    ...lineInfos.map((l) => l.x),
    ...hours.map((h) => xOf(h * 60)),
  ];
  const offXByKey = new Map<string, number>();
  for (const li of lineInfos) {
    let minGap = Infinity;
    let dir = 0;
    for (const x of obstacleXs) {
      const g = Math.abs(x - li.x);
      if (g < 0.5) continue;
      if (g < minGap) { minGap = g; dir = x < li.x ? -1 : 1; }
    }
    if (minGap === Infinity || minGap >= gapThreshold) {
      offXByKey.set(li.key, defaultArc);
    } else {
      const mag = Math.min(maxBend, Math.max(4, minGap * 0.9));
      offXByKey.set(li.key, dir * mag);
    }
  }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= rangeStartMin && nowMin <= rangeEndMin;
  const showTickText = hPx >= 28;

  return (
    <div ref={containerRef} className="dl-chart">
      <svg width={width} height={chartH} style={{ display: 'block', minWidth: '100%' }}>
        {/* 水平时间轴 */}
        <line x1={PAD_LEFT} y1={axisY} x2={width - PAD_RIGHT} y2={axisY}
          stroke="var(--dl-axis,#10b981)" strokeWidth={2} strokeLinecap="round" />

        {/* 刻度：整点竖短线 + 时刻文字竖排（一行一字、垂直向下，画在轴线下侧；仅任务范围，支持 24/25/26…） */}
        {hours.map((h) => {
          const x = xOf(h * 60);
          const label = String(h).padStart(2, '0').split('');
          return (
            <g key={h}>
              <line x1={x} y1={axisY - 6} x2={x} y2={axisY + 6}
                stroke="var(--dl-tick,#0f172a)" strokeWidth={2} />
              {showTickText && (
                <text x={x} y={axisY + 12} textAnchor="middle" dominantBaseline="hanging"
                  fontSize={10} fill="var(--dl-hour,#888)"
                  paintOrder="stroke" stroke="var(--dl-halo,#fff)" strokeWidth={3}>
                  {label.map((c, i) => (
                    <tspan key={i} x={x} dy={i === 0 ? 0 : 11}>{c}</tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}

        {/* 现在时间线（垂直虚线，超出任务范围则不显示） */}
        {showNow && (
          <line x1={xOf(nowMin)} y1={PAD_TOP} x2={xOf(nowMin)} y2={chartH - PAD_BOTTOM}
            stroke="var(--dl-axis,#10b981)" strokeWidth={1.4} strokeDasharray="5,4" />
        )}

        {/* 上方：时间点 + 曲线连接到轴线；曲线先画在底层 */}
        {points.map((ev) => {
          const px = xOf(ev.startMin);
          const py = pyOf(ev.lane);
          return (
            <path key={`ln-${ev.key}`} d={curvePathH(px, py, axisY, py, offXByKey.get(ev.key) ?? defaultArc)}
              fill="none" stroke={ev.color} strokeWidth={1.5} strokeDasharray="3,3"
              strokeLinecap="round" />
          );
        })}
        {/* 下方：区间条 → 轴线的连接曲线，落点锚定在开始时间刻度 */}
        {intervals.map((ev) => {
          const px = xOf(ev.startMin);
          const barT = intervalTopAt[ev.lane];
          const barH = barHAt(ev.lane);
          return (
            <path key={`ib-${ev.key}`} d={curvePathH(px, barT + barH / 2, axisY, barT + barH / 2, offXByKey.get(ev.key) ?? defaultArc)}
              fill="none" stroke={ev.color} strokeWidth={1.5} strokeDasharray="3,3"
              strokeLinecap="round" />
          );
        })}

        {/* 时间点节点（点 + 图标常显） */}
        {points.map((ev) => {
          const px = xOf(ev.startMin);
          const py = pyOf(ev.lane);
          return (
            <g key={ev.key} className="dl-ev"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHover(ev.key)}
              onMouseLeave={() => setHover(null)}>
              <circle cx={px} cy={py} r={pointR} fill={ev.color} />
              <text x={px} y={py - pointR - 8} textAnchor="middle" dominantBaseline="central" fontSize={14}>
                {ev.icon}
              </text>
            </g>
          );
        })}

        {/* 区间条（水平条，厚度按事件可配形成高低起伏，图标常显） */}
        {intervals.map((ev) => {
          const x1 = xOf(ev.startMin);
          const x2 = xOf(ev.endMin as number);
          const w = Math.max(2, x2 - x1);
          const yTop = intervalTopAt[ev.lane];
          const barH = barHAt(ev.lane);
          const iconInside = w >= 24 && barH >= 20;
          return (
            <g key={ev.key} className="dl-ev"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHover(ev.key)}
              onMouseLeave={() => setHover(null)}>
              <rect x={x1} y={yTop} width={w} height={barH} rx={4} fill={ev.color} />
              {iconInside ? (
                <text x={x1 + w / 2} y={yTop + barH / 2} textAnchor="middle" dominantBaseline="central" fontSize={14}>
                  {ev.icon}
                </text>
              ) : (
                <text x={x1} y={yTop - 8} textAnchor="middle" dominantBaseline="central" fontSize={14}>
                  {ev.icon}
                </text>
              )}
            </g>
          );
        })}

        {/* 悬停提示：两行标签（名称 / 加粗时间），最后绘制保证置顶 */}
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

          // 锚点：时间点在节点上方，区间在条上方；标签默认放右侧，空间不足则放左侧
          let cx: number;
          let cy: number;
          if (ev.isInterval) {
            cx = xOf(ev.startMin);
            cy = intervalTopAt[ev.lane] + barHAt(ev.lane) / 2;
          } else {
            cx = xOf(ev.startMin);
            cy = pyOf(ev.lane);
          }
          const toRight = cx + pointR + 10 + tagW < width - 8;
          const anchor: 'start' | 'end' = toRight ? 'start' : 'end';
          const tx = toRight ? cx + pointR + 10 : cx - pointR - 10;
          const rectX = toRight ? tx : tx - tagW;
          const textX = toRight ? tx + pad : tx - pad;

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

/** 节点→轴线（横向）的曲线：两端竖直切向，中点按 offX 左右弧。offX=0 为直线；近邻点用更大、反向的 offX 相互错开 */
function curvePathH(px: number, pyStart: number, axisY: number, pyEnd: number, offX: number): string {
  const dx = offX * 0.7;
  const c1y = pyStart + (pyEnd - pyStart) * 0.34;
  const c2y = pyStart + (pyEnd - pyStart) * 0.66;
  return `M ${px},${pyStart} C ${px + dx},${c1y}, ${px + dx},${c2y}, ${px},${pyEnd}`;
}
