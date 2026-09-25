import dayjs from 'dayjs';

/** 日期快捷方式 */
export type DatePreset = 'today' | 'yesterday' | 'beforeYesterday' | 'custom';

/** 单个记录表的数据源配置 */
export interface TableSource {
  tableId: string;
  tableName?: string;
  /** 日期字段：用于匹配所选日期，每个表有一个 */
  dateFieldId: string;
  /** 展示字段（事件/任务列）：其值成为时间轴上的事件 */
  displayFieldId: string;
  /** 开始时间字段：有值则按该时刻定位（可选） */
  startFieldId: string;
  /** 结束时间字段：与开始字段同时有值则为时间区间（可选） */
  endFieldId: string;
  /** 该表事件的默认颜色 */
  color: string;
}

export interface ICustomConfig {
  title: string;
  showTitle: boolean;
  /** 选中的记录表（可多个） */
  tables: TableSource[];
  /** 日期快捷方式 */
  datePreset: DatePreset;
  /** 自定义日期（仅 datePreset === 'custom' 时生效） */
  customDate: number;
  /** 默认图标 */
  icon: string;
  /** 默认颜色 */
  defaultColor: string;
  /** 按「tableId::展示字段值」配置的图标与颜色 */
  eventConfigs?: Record<string, { icon: string; color: string }>;
  /** 布局 */
  hourHeight: number;
  pointRadius: number;
  barHeight: number;
}

export const DEFAULT_CONFIG: ICustomConfig = {
  title: '',
  showTitle: true,
  tables: [],
  datePreset: 'today',
  customDate: dayjs().startOf('day').valueOf(),
  icon: '📌',
  defaultColor: '#3370ff',
  hourHeight: 34,
  pointRadius: 7,
  barHeight: 22,
};

/** 兼容缺失字段的旧配置 */
export function normalizeConfig(saved: any): ICustomConfig {
  const merged: ICustomConfig = { ...DEFAULT_CONFIG, ...(saved || {}) };
  if (!merged.tables || !Array.isArray(merged.tables)) merged.tables = [];
  merged.tables = merged.tables.map((t) => ({
    tableId: t.tableId || '',
    tableName: t.tableName || '',
    dateFieldId: t.dateFieldId || '',
    displayFieldId: t.displayFieldId || '',
    startFieldId: t.startFieldId || '',
    endFieldId: t.endFieldId || '',
    color: t.color || DEFAULT_CONFIG.defaultColor,
  }));
  if (!['today', 'yesterday', 'beforeYesterday', 'custom'].includes(merged.datePreset)) {
    merged.datePreset = 'today';
  }
  if (!merged.customDate) merged.customDate = DEFAULT_CONFIG.customDate;
  return merged;
}

export const ICON_OPTIONS = [
  '📌', '🎯', '✅', '⭐', '🔥', '🚀', '💼', '📅', '📋', '🗂️',
  '📚', '📖', '🎓', '🧠', '✍️', '📝', '💻', '🎨', '🎵', '🔬',
  '💪', '🏃', '🚴', '🏊', '🧘', '🏋️', '🚶', '🤸', '⛹️', '⚽',
  '🍎', '💧', '🍳', '☕', '🥗', '🍜', '🥑', '🥛', '🍵', '🍇',
  '😴', '🌙', '☀️', '🌱', '💰', '🏠', '🛒', '✈️', '🚗', '🧹',
  '🎸', '🎹', '🎮', '📷', '🎬', '🧩', '🎲', '🎤', '🖼️', '🎭',
  '❤️', '👟', '🌟', '💎', '🌈', '🎁', '📱', '⌚', '🧴', '💡',
];
