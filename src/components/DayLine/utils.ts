import dayjs from 'dayjs';
import { DatePreset } from './config';

export const DAY_MS = 86400000;
export const MIN_MS = 60000;

/** 时间轴上的一个事件（一条记录） */
export interface DayEvent {
  key: string;
  tableId: string;
  tableName: string;
  recordId: string;
  /** 展示字段的值（事件/任务名） */
  taskValue: string;
  icon: string;
  color: string;
  /** 距当天 0 点的分钟数 0~1440 */
  startMin: number;
  /** 区间结束分钟；null 表示时间点 */
  endMin: number | null;
  isInterval: boolean;
  /** 该记录的原始字段（用于详情） */
  fields: any;
  /** 布局车道 */
  lane: number;
}

/** 归一化到当天 0 点 */
export function startOfDay(ts: number): number {
  return dayjs(ts).startOf('day').valueOf();
}

/** 由日期快捷方式计算当天 0 点时间戳 */
export function getDayStartByPreset(preset: DatePreset, customDate: number): number {
  switch (preset) {
    case 'today':
      return startOfDay(Date.now());
    case 'yesterday':
      return startOfDay(Date.now() - DAY_MS);
    case 'beforeYesterday':
      return startOfDay(Date.now() - 2 * DAY_MS);
    default:
      return startOfDay(customDate);
  }
}

export function formatDate(ts: number): string {
  return dayjs(ts).format('YYYY年M月D日 dddd');
}

export function formatTime(min: number): string {
  const m = Math.round(min);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 从多维表格字段值中提取纯文本 */
export function extractText(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(extractText).filter(Boolean).join(',');
  if (typeof val === 'object') return val.text || val.name || val.value || '';
  return String(val);
}

/** 从日期时间字段值中提取毫秒时间戳（兼容数字/字符串/对象/数组） */
export function extractTimestamp(val: any): number | null {
  if (val === null || val === undefined) return null;
  let raw: any = val;
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw === 'object' && raw !== null) {
    raw = raw.value ?? raw.text ?? raw.timestamp ?? raw.records;
  }
  if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (!isNaN(n)) return n > 1e12 ? n : n * 1000;
    const d = dayjs(raw);
    if (d.isValid()) return d.valueOf();
  }
  return null;
}

/** 格式化多维表格字段值为可读文本 */
export function formatFieldValue(val: any): string {
  if (val === null || val === undefined || val === '') return '—';
  if (Array.isArray(val)) {
    if (val.length === 0) return '—';
    return val.map((v) => {
      if (typeof v === 'object' && v !== null) {
        return v.text || v.name || v.value || JSON.stringify(v);
      }
      return String(v);
    }).join(', ');
  }
  if (typeof val === 'object') {
    return val.text || val.name || val.value || JSON.stringify(val);
  }
  if (typeof val === 'number') {
    if (val > 1e12) return dayjs(val).format('YYYY-MM-DD HH:mm');
    return String(val);
  }
  return String(val);
}

/** 时间点占据的分钟窗口（用于车道冲突判断） */
const POINT_SPAN_MIN = 24;

/**
 * 计算某条记录的时间点 / 区间（分钟，相对所选日期当天 0 点）。
 * - 有开始时间字段且取到值 → 用开始时间定位；否则用日期字段自带时刻
 * - 有结束时间字段且晚于开始 → 时间区间；否则为时间点
 * - 支持跨天：开始/结束若晚于当天（次日），分钟值 >1440（即 24 点之后，如 26:00），由调用方据此延长时间轴刻度
 */
export function resolveEventTime(
  fields: any,
  source: { dateFieldId: string; startFieldId: string; endFieldId: string },
  dayStartMs: number
): { startMin: number; endMin: number | null; isInterval: boolean } | null {
  const dateTs = extractTimestamp(fields[source.dateFieldId]);
  if (dateTs == null) return null;
  if (startOfDay(dateTs) !== dayStartMs) return null;

  const startTs = source.startFieldId
    ? extractTimestamp(fields[source.startFieldId])
    : null;
  const endTs = source.endFieldId
    ? extractTimestamp(fields[source.endFieldId])
    : null;

  const baseTs = startTs ?? dateTs;
  let startMin = (baseTs - dayStartMs) / MIN_MS;
  startMin = Math.max(0, startMin);

  if (endTs != null) {
    let endMin = (endTs - dayStartMs) / MIN_MS;
    endMin = Math.max(0, endMin);
    if (endMin > startMin) {
      return { startMin, endMin, isInterval: true };
    }
  }
  return { startMin, endMin: null, isInterval: false };
}

/**
 * 把多张表的记录构建成所选日期的事件列表（按开始时间排序并分配车道）。
 * records：每张表已分页拉取的全部记录。
 * style：返回指定 (tableId, 展示值) 的图标与颜色。
 */
export function buildDayEvents(
  dayStartMs: number,
  tableSources: { source: any; records: any[]; tableName: string }[],
  style: (tableId: string, taskValue: string) => { icon: string; color: string }
): DayEvent[] {
  const events: DayEvent[] = [];
  for (const ts of tableSources) {
    const { source, records, tableName } = ts;
    for (const rec of records || []) {
      const fields = rec.fields || rec.fieldValues || {};
      const resolved = resolveEventTime(fields, source, dayStartMs);
      if (!resolved) continue;
      const taskValue = extractText(fields[source.displayFieldId]) || '未命名';
      const st = style(source.tableId, taskValue);
      events.push({
        key: `${source.tableId}-${rec.recordId}`,
        tableId: source.tableId,
        tableName,
        recordId: rec.recordId,
        taskValue,
        icon: st.icon,
        color: st.color,
        startMin: resolved.startMin,
        endMin: resolved.endMin,
        isInterval: resolved.isInterval,
        fields,
        lane: 0,
      });
    }
  }
  // 时间点与时间区间分开独立分配车道（时间点居左、区间居右，互不挤压）
  const points = events.filter((e) => !e.isInterval);
  const intervals = events.filter((e) => e.isInterval);
  return [...assignLanes(points), ...assignLanes(intervals)].sort((a, b) => a.startMin - b.startMin);
}

/** 贪心车道分配：时间点按 24 分钟窗口占位，区间按实际时长占位，避免重叠 */
function assignLanes(events: DayEvent[]): DayEvent[] {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin);
  const laneOcc: { start: number; end: number }[][] = [];
  return sorted.map((ev) => {
    const es = ev.startMin;
    const ee = ev.endMin ?? (ev.startMin + POINT_SPAN_MIN);
    let lane = 0;
    for (;;) {
      const occ = laneOcc[lane] || [];
      const conflict = occ.some((o) => es < o.end && ee > o.start);
      if (!conflict) break;
      lane++;
    }
    (laneOcc[lane] = laneOcc[lane] || []).push({ start: es, end: ee });
    return { ...ev, lane };
  });
}

/** 去重事件名，用于图标配置列表 */
export function distinctTasks(events: DayEvent[]): { key: string; tableId: string; value: string }[] {
  const map = new Map<string, { tableId: string; value: string }>();
  for (const ev of events) {
    const k = `${ev.tableId}::${ev.taskValue}`;
    if (!map.has(k)) map.set(k, { tableId: ev.tableId, value: ev.taskValue });
  }
  return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
}
