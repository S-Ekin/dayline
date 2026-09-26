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
const AXIS_GAP = 16;
const POINT_STEP = 34;
const DEFAULT_BAR_W = 30;

/** 24 小时时间轴：轴线居中；左侧时间点、右侧时间区间；刻度画在轴线上；图标常显，名称+时间两行悬停展示 */
export function DayChart({ events, custom, isToday, emptyText, onEventClick }: DayChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.max(230, entries[0].contentRect.width));
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

  // 轴线固定在容器 55% 处（略偏右）
  const W = width;
  const axisX = W * 0.55;
  const leftUsable = axisX - AXIS_GAP - PAD_LEFT - 2 * pointR - 8;
  const rightUsable = W - axisX - AXIS_GAP - DEFAULT_BAR_W - 8;
  const pointStep = maxPointLane > 0 ? Math.min(POINT_STEP, Math.max(8, leftUsable / maxPointLane)) : POINT_STEP;

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

  // 右侧区间：按每个 lane 的最大条宽分配槽位，宽度不同形成高低起伏，且整体不越界
  const laneMaxW: number[] = [];
  for (const ev of intervals) {
    const w = Math.min(ev.width || DEFAULT_BAR_W, rightUsable);
    laneMaxW[ev.lane] = Math.max(laneMaxW[ev.lane] || 0, w);
  }
  const lanePad = 8;
  let totalNeed = 0;
  for (const w of laneMaxW) totalNeed += w + lanePad;
  const slotScale = totalNeed > rightUsable && totalNeed > 0 ? rightUsable / totalNeed : 1;
  const slotX: number[] = [];
  let _cx = axisX + AXIS_GAP;
  for (let l = 0; l < laneMaxW.length; l++) {
    slotX[l] = _cx;
    _cx += (laneMaxW[l] * slotScale) + lanePad;
  }
  const barX = (lane: number) => slotX[lane] ?? (axisX + AXIS_GAP);
  const barW = (w: number) => Math.max(2, Math.min(w || DEFAULT_BAR_W, rightUsable) * slotScale);

  // 区间连接点：取开始时间所在 y 再向下微移，避开条顶圆角，保证曲线与区块连上无空隙
  const intervalLink = new Map<string, number>();
  for (const ev of intervals) {
    const y1 = yOf(ev.startMin);
    const y2 = yOf(ev.endMin as number);
    const hh = Math.max(1, Math.abs(y2 - y1));
    const drop = Math.min(10, hh * 0.5);
    intervalLink.set(ev.key, y1 + drop);
  }

  // 连接线（左时间点 + 右区间）避让：若会撞到刻度线或其他任务的连接线，就调整弯曲度与方向
  const gapThreshold = 18;
  const maxBend = 12;
  const defaultArc = 3;
  const lineInfos = [
    ...points.map((ev) => ({ key: ev.key, py: yOf(ev.startMin) })),
    // 区间连接线落点锚定在轴线上开始时间的精确刻度处，以此 y 做避让
    ...intervals.map((ev) => ({ key: ev.key, py: yOf(ev.startMin) })),
  ];
  const obstacleYs = [
    ...lineInfos.map((l) => l.py),
    ...hours.map((h) => yOf(h * 60)), // 刻度线
  ];
  const offYByKey = new Map<string, number>();
  for (const li of lineInfos) {
    let minGap = Infinity;
    let dir = 0;
    for (const y of obstacleYs) {
      const g = Math.abs(y - li.py);
      if (g < 0.5) continue; // 自身或重叠位置，忽略
      if (g < minGap) { minGap = g; dir = y < li.py ? -1 : 1; } // 干扰在上→往下弧，干扰在下→往上弧
    }
    if (minGap === Infinity || minGap >= gapThreshold) {
      offYByKey.set(li.key, defaultArc);
    } else {
      const mag = Math.min(maxBend, Math.max(4, minGap * 0.9));
      offYByKey.set(li.key, dir * mag);
    }
  }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= rangeStartMin && nowMin <= rangeEndMin;

  return (
    <div ref={containerRef} className="dl-chart">
      <svg width={W} height={chartH} style={{ display: 'block', minWidth: '100%' }}>
        {/* 中间轴线（容器正中，仅任务范围） */}
        <line x1={axisX} y1={padTop} x2={axisX} y2={chartH - padBottom}
          stroke="var(--dl-axis,#10b981)" strokeWidth={2} strokeLinecap="round" />

        {/* 刻度：整点画一条显著的短刻度线 + 时刻文字（画在轴线上，仅任务范围，支持 24/25/26…） */}
        {hours.map((h) => {
          const y = yOf(h * 60);
          return (
            <g key={h}>
              <line x1={axisX - 10} y1={y} x2={axisX + 10} y2={y}
                stroke="var(--dl-tick,#059669)" strokeWidth={2} />
              <text x={axisX - 14} y={y} textAnchor="end" dominantBaseline="central"
                fontSize={10} fill="var(--dl-hour,#888)"
                paintOrder="stroke" stroke="var(--dl-halo,#fff)" strokeWidth={3}>
                {String(h).padStart(2, '0')}:00
              </text>
            </g>
          );
        })}

        {/* 现在时间线（以中轴为中心左右各 50px 的短线；超出任务范围则不显示） */}
        {showNow && (
          <line x1={axisX - 50} y1={yOf(nowMin)} x2={axisX + 50} y2={yOf(nowMin)}
            stroke="var(--dl-axis,#10b981)" strokeWidth={1.4} strokeDasharray="5,4" />
        )}

        {/* 左侧：时间点 + 曲线连接到轴线 */}
        {/* 曲线先全部绘制（置于底层），再绘制圆点与图标，保证连线不会盖住任何图标 */}
        {points.map((ev) => {
          const px = pointX(ev.lane);
          const py = yOf(ev.startMin);
          return (
            <path key={`ln-${ev.key}`} d={curvePath(px, py, axisX, py, offYByKey.get(ev.key) ?? defaultArc)}
              fill="none" stroke={ev.color} strokeWidth={1.5} strokeDasharray="3,3"
              strokeLinecap="round" />
          );
        })}
        {/* 区间条：起点连到条内（连上无空隙），落点精确落在轴线上开始时间的刻度 */}
        {intervals.map((ev) => {
          const ly = intervalLink.get(ev.key) ?? yOf(ev.startMin);
          const axisY = yOf(ev.startMin);
          return (
            <path key={`ib-${ev.key}`} d={curvePath(barX(ev.lane), ly, axisX, axisY, offYByKey.get(ev.key) ?? defaultArc)}
              fill="none" stroke={ev.color} strokeWidth={1.5} strokeDasharray="3,3"
              strokeLinecap="round" />
          );
        })}
        {points.map((ev) => {
          const px = pointX(ev.lane);
          const py = yOf(ev.startMin);
          return (
            <g key={ev.key} className="dl-ev"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHover(ev.key)}
              onMouseLeave={() => setHover(null)}>
              <circle cx={px} cy={py} r={pointR} fill={ev.color} />
              {/* 图标紧贴曲线起点的圆点上方 */}
              <text x={px} y={py - pointR - 9} textAnchor="middle" dominantBaseline="central" fontSize={14}>
                {ev.icon}
              </text>
            </g>
          );
        })}

        {/* 右侧：时间区间，图标常显（条宽按事件可配，形成高低起伏） */}
        {intervals.map((ev) => {
          const x = barX(ev.lane);
          const w = barW(ev.width);
          const y1 = yOf(ev.startMin);
          const y2 = yOf(ev.endMin as number);
          const yTop = Math.min(y1, y2);
          const h = Math.max(1, Math.abs(y2 - y1));
          const iconInside = w >= 22 && h >= 20;
          return (
            <g key={ev.key} className="dl-ev"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHover(ev.key)}
              onMouseLeave={() => setHover(null)}>
              <rect x={x} y={yTop} width={w} height={h} rx={5} fill={ev.color} />
              {iconInside ? (
                <text x={x + w / 2} y={yTop + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={14}>
                  {ev.icon}
                </text>
              ) : (
                <text x={x + w + 4} y={yTop + h / 2} textAnchor="start" dominantBaseline="central" fontSize={14}>
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

          // 几何：时间点（左）标签放右侧贴近圆点；区间（右）标签放左侧贴近条
          let tx: number; let anchor: 'start' | 'end'; let cy: number;
          if (ev.isInterval) {
            const x = barX(ev.lane);
            const yTop = Math.min(yOf(ev.startMin), yOf(ev.endMin as number));
            const hh = Math.max(1, Math.abs(yOf(ev.endMin as number) - yOf(ev.startMin)));
            tx = x - 10;
            anchor = 'end';
            cy = yTop + hh / 2;
          } else {
            tx = pointX(ev.lane) + pointR + 10;
            anchor = 'start';
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

/** 节点→轴线的曲线：起终点可不同 y，中点按 offY 上下弧。offY=0 为直线；近邻点用更大、反向的 offY 相互错开 */
function curvePath(px: number, pyStart: number, axisX: number, pyEnd: number, offY: number): string {
  const dx = axisX - px;
  const mid = (pyStart + pyEnd) / 2;
  const dy = offY * 0.7;
  const c1x = px + dx * 0.34;
  const c2x = px + dx * 0.66;
  return `M ${px},${pyStart} C ${c1x},${mid + dy}, ${c2x},${mid + dy}, ${axisX},${pyEnd}`;
}
