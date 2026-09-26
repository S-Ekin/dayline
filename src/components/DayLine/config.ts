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

/** 布局方向：竖向（时间轴从上到下）/ 横向（时间轴从左到右） */
export type Orientation = 'vertical' | 'horizontal';

export interface ICustomConfig {
  title: string;
  showTitle: boolean;
  /** 选中记录表（可多个） */
  tables: TableSource[];
  /** 日期快捷方式 */
  datePreset: DatePreset;
  /** 自定义日期（仅 datePreset === 'custom' 时生效） */
  customDate: number;
  /** 默认图标 */
  icon: string;
  /** 默认颜色 */
  defaultColor: string;
  /** 区间条默认宽度（px），每个事件可单独覆盖以形成高低起伏 */
  defaultBarWidth: number;
  /** 按「tableId::展示字段值」配置的图标 / 颜色 / 条宽 */
  eventConfigs?: Record<string, { icon: string; color: string; width?: number }>;
  /** 布局方向 */
  orientation: Orientation;
  /** 布局 */
  hourHeight: number;
  pointRadius: number;
}

export const DEFAULT_CONFIG: ICustomConfig = {
  title: '',
  showTitle: true,
  tables: [],
  datePreset: 'today',
  customDate: dayjs().startOf('day').valueOf(),
  icon: '📌',
  defaultColor: '#3370ff',
  defaultBarWidth: 30,
  orientation: 'vertical',
  hourHeight: 34,
  pointRadius: 7,
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
  if (!['vertical', 'horizontal'].includes(merged.orientation)) {
    merged.orientation = 'vertical';
  }
  if (!merged.customDate) merged.customDate = DEFAULT_CONFIG.customDate;
  return merged;
}

export const ICON_OPTIONS = [
  // 常用 / 目标
  '📌', '🎯', '✅', '⭐', '🔥', '🚀', '💼', '📅', '📋', '🗂️',
  // 学习与工作
  '📚', '📖', '🎓', '🧠', '✍️', '📝', '💻', '🎨', '🎵', '🔬',
  '🖥️', '🖨️', '🗄️', '🗃️', '📁', '📂', '📎', '✏️', '🔍', '🔎',
  '🔧', '🔨', '⚙️', '🧰',
  // 运动与健康
  '💪', '🏃', '🚴', '🏊', '🧘', '🏋️', '🚶', '🤸', '⛹️', '⚽',
  '🏸', '🏓', '🏀', '🏈', '⚾', '🏐', '🎾', '⛳', '🎣', '⛸️',
  '🥊', '🥋', '🚵', '🏄', '⛷️', '🏂', '🩺', '💊', '💉', '🦷',
  '🧼', '🧽', '🪥', '🏥', '🧑‍⚕️',
  // 饮食
  '🍎', '💧', '🍳', '☕', '🥗', '🍜', '🥑', '🥛', '🍵', '🍇',
  '🍚', '🍔', '🍟', '🍕', '🌮', '🥪', '🍝', '🍲', '🍗', '🍖',
  '🥩', '🥦', '🍅', '🍓', '🥭', '🍍', '🍿', '🍰', '🍩', '🍪',
  '🍞', '🥤', '🍹', '🍺', '🍷', '🍴',
  // 生活与作息
  '😴', '🌙', '☀️', '🌱', '💰', '🏠', '🛒', '✈️', '🚗', '🧹',
  '🛋️', '🛏️', '🛁', '🚿', '🧺', '🪣', '🚽', '🏡', '🏢', '🏬',
  // 出行与交通
  '🚕', '🚙', '🚌', '🚐', '🚚', '🛵', '🛴', '🚲', '🚉', '🚆',
  '🚇', '🚄', '🚢', '🛳️', '🚁', '🛸',
  // 娱乐与休闲
  '🎸', '🎹', '🎮', '📷', '🎬', '🧩', '🎲', '🎤', '🖼️', '🎭',
  '🎧', '🎼', '🎺', '🎻', '🥁', '🎷', '🕹️', '🎰', '🎪', '🎢',
  '🎡', '🎠', '🎳',
  // 社交与沟通
  '❤️', '👟', '🌟', '💎', '🌈', '🎁', '📱', '⌚', '🧴', '💡',
  '💬', '💭', '📞', '📲', '✉️', '📨', '📢', '🔔', '🥳', '🤝',
  // 自然与天气
  '🌤️', '⛅', '🌧️', '🌨️', '⛈️', '🌊', '⛰️', '🏔️', '🏕️', '⛺',
  '🏝️', '🌸', '🌻', '🌹', '🌳', '🍂',
  // 数码与工具
  '📀', '💾', '💿', '🖱️', '⌨️', '🔌', '🔋', '📡', '📺', '🖲️',
];
