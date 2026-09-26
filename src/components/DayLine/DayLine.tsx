import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dashboard, bitable, ui, DashboardState, GroupMode, ORDER,
  DATA_SOURCE_SORT_TYPE, SourceType, FieldType,
} from '@lark-base-open/js-sdk';
import { Button, DatePicker, Select, Input, Switch, Slider, Modal, ColorPicker } from '@douyinfe/semi-ui';
import dayjs from 'dayjs';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { Item } from '../Item';
import { ICustomConfig, DEFAULT_CONFIG, normalizeConfig, DatePreset, TableSource } from './config';
import { DayChart } from './DayChart';
import { IconPicker } from './IconPicker';
import {
  DayEvent, buildDayEvents, getDayStartByPreset, formatDate, formatFieldValue,
  distinctTasks,
} from './utils';

interface Category {
  fieldId: string;
  fieldName: string;
  fieldType: number;
}

export default function DayLine(props: { bgColor: string }) {
  const { t } = useTranslation();
  const isCreate = dashboard.state === DashboardState.Create;
  const isConfig = dashboard.state === DashboardState.Config || isCreate;

  const [tableList, setTableList] = useState<{ tableId: string; tableName: string }[]>([]);
  const [categoriesByTable, setCategoriesByTable] = useState<Record<string, Category[]>>({});
  const [rangesByTable, setRangesByTable] = useState<Record<string, any>>({});
  const [custom, setCustom] = useState<ICustomConfig>(DEFAULT_CONFIG);
  const [recordsByTable, setRecordsByTable] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [inited, setInited] = useState(false);
  const [detail, setDetail] = useState<{ visible: boolean; ev: DayEvent | null }>({ visible: false, ev: null });

  const updateCustom = useCallback((patch: Partial<ICustomConfig>) => {
    setCustom((prev) => ({ ...prev, ...patch }));
  }, []);

  // ---- 读取单张表的全部记录 ----
  const fetchAllRecords = useCallback(async (tableId: string): Promise<any[]> => {
    const table = await bitable.base.getTableById(tableId);
    let all: any[] = [];
    let token: string | undefined;
    let page = 0;
    do {
      const res: any = await table.getRecords({ pageSize: 500, pageToken: token });
      const recs = res.records || res.items || [];
      all = all.concat(recs);
      token = res.pageToken || res.nextPageToken;
      page++;
      if (page > 200) break;
    } while (token);
    return all;
  }, []);

  // ---- 读取字段元数据（用于配置选择与详情格式化）----
  const fetchCategories = useCallback(async (tableId: string): Promise<Category[]> => {
    try {
      const table = await bitable.base.getTableById(tableId);
      const metas: any = await table.getFieldMetaList();
      return (metas || []).map((m: any) => ({
        fieldId: m.id,
        fieldName: m.name,
        fieldType: m.type,
      }));
    } catch (e) {
      console.error('fetch categories failed', tableId, e);
      return [];
    }
  }, []);

  const loadTableMeta = useCallback(async (tid: string) => {
    const [cats, ranges] = await Promise.all([
      fetchCategories(tid),
      dashboard.getTableDataRange(tid).catch(() => [{ type: SourceType.ALL }]),
    ]);
    setCategoriesByTable((prev) => ({ ...prev, [tid]: cats }));
    setRangesByTable((prev) => ({ ...prev, [tid]: ranges[0] }));
    return cats;
  }, [fetchCategories]);

  // ---- 当前所选日期 0 点 ----
  const dayStart = useMemo(
    () => getDayStartByPreset(custom.datePreset, custom.customDate),
    [custom.datePreset, custom.customDate]
  );

  // ---- 加载所有选中表的数据 ----
  const loadRecords = useCallback(async (tables: TableSource[]) => {
    const ids = tables.map((x) => x.tableId).filter(Boolean);
    if (ids.length === 0) {
      setRecordsByTable({});
      return;
    }
    setLoading(true);
    try {
      const map: Record<string, any[]> = {};
      await Promise.all(
        tables.map(async (ts) => {
          try {
            map[ts.tableId] = await fetchAllRecords(ts.tableId);
          } catch (e) {
            console.error('load records failed', ts.tableId, e);
            map[ts.tableId] = [];
          }
        })
      );
      setRecordsByTable(map);
    } finally {
      setLoading(false);
    }
  }, [fetchAllRecords]);

  // ---- 配置 / 创建态：初始化 ----
  useEffect(() => {
    if (!isConfig) return;
    let cancelled = false;
    (async () => {
      const tables = await bitable.base.getTableList();
      const list = await Promise.all(
        tables.map(async (tb: any) => ({ tableId: tb.id, tableName: await tb.getName() }))
      );
      if (cancelled) return;
      setTableList(list);

      let merged: ICustomConfig;
      if (dashboard.state === DashboardState.Create) {
        merged = normalizeConfig(DEFAULT_CONFIG);
      } else {
        const cfg = await dashboard.getConfig();
        merged = normalizeConfig(cfg.customConfig || {});
      }
      if (cancelled) return;
      setCustom(merged);

      // 为已选表加载字段元数据
      await Promise.all(merged.tables.map((ts) => loadTableMeta(ts.tableId)));
      if (cancelled) return;
      setInited(true);
    })();
    return () => { cancelled = true; };
  }, [isConfig, loadTableMeta]);

  // ---- 配置态：首次自动添加第一张表 ----
  useEffect(() => {
    if (!isConfig || !inited) return;
    if (custom.tables.length === 0 && tableList.length > 0) {
      addTable(tableList[0].tableId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfig, inited, tableList, custom.tables.length]);

  // ---- 展示态：读取配置与数据 ----
  useEffect(() => {
    if (isConfig) return;
    let off: any;
    (async () => {
      const cfg = await dashboard.getConfig();
      const merged = normalizeConfig(cfg.customConfig || {});
      setCustom(merged);
      await Promise.all(merged.tables.map((ts) => loadTableMeta(ts.tableId)));
      await loadRecords(merged.tables);
      off = dashboard.onDataChange(() => { loadRecords(merged.tables); });
    })();
    return () => { if (off) off(); };
  }, [isConfig, loadTableMeta, loadRecords]);

  // ---- 选中表集合变化时拉取数据（配置态也用于预览）----
  const tableIdsKey = useMemo(() => custom.tables.map((x) => x.tableId).sort().join(','), [custom.tables]);
  useEffect(() => {
    if (custom.tables.length === 0) return;
    loadRecords(custom.tables);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableIdsKey]);

  // ---- 事件样式 ----
  const getEventStyle = useCallback((tableId: string, taskValue: string) => {
    const conf = custom.eventConfigs?.[`${tableId}::${taskValue}`];
    const tableColor = custom.tables.find((x) => x.tableId === tableId)?.color;
    return {
      icon: conf?.icon || custom.icon,
      color: conf?.color || tableColor || custom.defaultColor,
    };
  }, [custom.eventConfigs, custom.icon, custom.defaultColor, custom.tables]);

  // ---- 构建事件 ----
  const events = useMemo<DayEvent[]>(() => {
    const sources = custom.tables
      .filter((ts) => ts.tableId && ts.dateFieldId && ts.displayFieldId && recordsByTable[ts.tableId])
      .map((ts) => ({
        source: ts,
        tableName: ts.tableName || tableList.find((x) => x.tableId === ts.tableId)?.tableName || '',
        records: recordsByTable[ts.tableId],
      }));
    return buildDayEvents(dayStart, sources, getEventStyle);
  }, [custom.tables, recordsByTable, dayStart, getEventStyle, tableList]);

  // ---- 事件名列表（图标配置用）----
  const taskList = useMemo(() => distinctTasks(events), [events]);

  // ---- 渲染完成通知 ----
  useEffect(() => {
    const timer = setTimeout(() => { dashboard.setRendered().catch(() => {}); }, 600);
    return () => clearTimeout(timer);
  }, [events]);

  // ---- 添加记录表 ----
  const addTable = async (tid: string) => {
    if (!tid || custom.tables.some((x) => x.tableId === tid)) return;
    const cats = await loadTableMeta(tid);
    const dateF = cats.find((c) => c.fieldType === FieldType.DateTime);
    const textF = cats.find((c) => c.fieldType === FieldType.Text && c.fieldId !== dateF?.fieldId)
      || cats.find((c) => c.fieldId !== dateF?.fieldId);
    const name = tableList.find((x) => x.tableId === tid)?.tableName || '';
    const table: TableSource = {
      tableId: tid,
      tableName: name,
      dateFieldId: dateF?.fieldId || '',
      displayFieldId: textF?.fieldId || '',
      startFieldId: '',
      endFieldId: '',
      color: pickColor(custom.tables.length),
    };
    updateCustom({ tables: [...custom.tables, table] });
  };

  const removeTable = (tid: string) => {
    updateCustom({ tables: custom.tables.filter((x) => x.tableId !== tid) });
  };

  const patchTable = (tid: string, patch: Partial<TableSource>) => {
    updateCustom({
      tables: custom.tables.map((x) => (x.tableId === tid ? { ...x, ...patch } : x)),
    });
  };

  const setTableColor = (tid: string, color: string) => patchTable(tid, { color });

  // ---- 事件图标 / 颜色 ----
  const setEventStyle = (key: string, patch: { icon?: string; color?: string }) => {
    const cur = custom.eventConfigs?.[key] || { icon: custom.icon, color: custom.defaultColor };
    updateCustom({ eventConfigs: { ...custom.eventConfigs, [key]: { ...cur, ...patch } } });
  };

  // ---- 点击事件：详情 ----
  const handleEventClick = (ev: DayEvent) => {
    setDetail({ visible: true, ev });
  };

  const openRecord = () => {
    const ev = detail.ev;
    if (ev) {
      ui.showRecordDetailDialog({ tableId: ev.tableId, recordId: ev.recordId });
      setDetail({ visible: false, ev: null });
    }
  };

  // ---- 保存 ----
  const onSave = () => {
    const primary = custom.tables[0];
    const dataConditions = primary
      ? [{
          tableId: primary.tableId,
          dataRange: rangesByTable[primary.tableId] || { type: SourceType.ALL },
          series: 'COUNTA' as const,
          groups: [{
            fieldId: primary.dateFieldId,
            mode: GroupMode.INTEGRATED,
            sort: { order: ORDER.ASCENDING, sortType: DATA_SOURCE_SORT_TYPE.GROUP },
          }],
        }]
      : [];
    dashboard.saveConfig({ dataConditions, customConfig: custom } as any);
  };

  const presetOptions = [
    { value: 'today', label: t('preset.today') },
    { value: 'yesterday', label: t('preset.yesterday') },
    { value: 'beforeYesterday', label: t('preset.beforeYesterday') },
    { value: 'custom', label: t('preset.custom') },
  ];

  const datePresetSelect = (
    <Select
      style={{ width: 104 }}
      value={custom.datePreset}
      optionList={presetOptions}
      onChange={(v) => updateCustom({ datePreset: v as DatePreset })}
    />
  );

  const detailCats = detail.ev ? (categoriesByTable[detail.ev.tableId] || []) : [];

  return (
    <main
      style={{ backgroundColor: props.bgColor }}
      className={classNames('dl-main', { 'dl-main-config': isConfig })}
    >
      <div className="dl-container">
        {/* 顶部工具条：一行显示，日期下拉 + 标题 + 计数 + 刷新 */}
        <div className="dl-toolbar">
          {datePresetSelect}
          {custom.datePreset === 'custom' && (
            <DatePicker
              style={{ width: 136 }}
              type="date"
              value={custom.customDate}
              onChange={(d: any) => updateCustom({ customDate: d ? dayjs(d).startOf('day').valueOf() : custom.customDate })}
            />
          )}
          <span className="dl-day-title">{custom.showTitle && custom.title ? custom.title : formatDate(dayStart)}</span>
          {!isConfig && (
            <div className="dl-count">
              {loading ? '…' : `${t('table')} ${custom.tables.length} · ${events.length} ${t('records')}`}
            </div>
          )}
          {!isConfig && (
            <button className="dl-refresh-btn" onClick={() => loadRecords(custom.tables)}>{t('refresh')}</button>
          )}
        </div>

        <div className="dl-scroll">
          {loading ? (
            <div className="dl-chart empty">…</div>
          ) : events.length === 0 ? (
            <DayChart
              events={[]}
              custom={custom}
              isToday={isToday(dayStart)}
              emptyText={custom.tables.length === 0 ? t('please.selectTable') : t('no.data')}
              onEventClick={handleEventClick}
            />
          ) : (
            <DayChart
              events={events}
              custom={custom}
              isToday={isToday(dayStart)}
              emptyText=""
              onEventClick={handleEventClick}
            />
          )}
        </div>
      </div>

      {/* 配置面板 */}
      {isConfig && inited && (
        <div className="dl-settings">
          <div className="dl-form">
            <div className="dl-section">{t('section.title')}</div>
            <Item label={t('label.title')}>
              <Input
                value={custom.title}
                placeholder={formatDate(dayStart)}
                onChange={(v) => updateCustom({ title: v })}
              />
            </Item>
            <Item label={
              <div className="label-checkbox">
                {t('label.showTitle')}
                <Switch checked={custom.showTitle} onChange={(v) => updateCustom({ showTitle: !!v })} />
              </div>
            }>
              <div />
            </Item>

            <div className="dl-section">{t('section.datasource')}</div>
            <Item label={t('label.tables')}>
              <div className="dl-table-manager">
                {custom.tables.length > 0 && (
                  <div className="dl-table-list">
                    {custom.tables.map((ts) => {
                      const cats = categoriesByTable[ts.tableId] || [];
                      const dateOpts = cats.filter((c) => c.fieldType === FieldType.DateTime);
                      const dispOpts = cats.filter((c) => c.fieldId !== ts.dateFieldId);
                      const timeOpts = [{ fieldId: '', fieldName: t('label.field.optional') }]
                        .concat(cats.filter((c) => c.fieldType === FieldType.DateTime));
                      return (
                        <div key={ts.tableId} className="dl-table-card">
                          <div className="dl-table-card-head">
                            <ColorField className="dl-event-color" value={ts.color} onChange={(c) => setTableColor(ts.tableId, c)} />
                            <span className="dl-table-name">{ts.tableName || ts.tableId}</span>
                            <button
                              type="button"
                              className="dl-table-remove"
                              onClick={() => removeTable(ts.tableId)}
                              title={t('label.removeTable')}
                            >×</button>
                          </div>
                          <div className="dl-table-fields">
                            <div className="dl-field-row">
                              <span className="dl-f-label">{t('label.dateField')}</span>
                              <Select
                                filter
                                value={ts.dateFieldId}
                                optionList={dateOpts.map((c) => ({ value: c.fieldId, label: c.fieldName }))}
                                onChange={(v) => patchTable(ts.tableId, { dateFieldId: v as string })}
                              />
                            </div>
                            <div className="dl-field-row">
                              <span className="dl-f-label">{t('label.displayField')}</span>
                              <Select
                                filter
                                value={ts.displayFieldId}
                                optionList={dispOpts.map((c) => ({ value: c.fieldId, label: c.fieldName }))}
                                onChange={(v) => patchTable(ts.tableId, { displayFieldId: v as string })}
                              />
                            </div>
                            <div className="dl-hint">{t('label.displayField.tip')}</div>
                            <div className="dl-field-row">
                              <span className="dl-f-label">{t('label.startField')}</span>
                              <Select
                                filter
                                value={ts.startFieldId}
                                optionList={timeOpts.map((c) => ({ value: c.fieldId, label: c.fieldName }))}
                                onChange={(v) => patchTable(ts.tableId, { startFieldId: v as string })}
                              />
                            </div>
                            <div className="dl-field-row">
                              <span className="dl-f-label">{t('label.endField')}</span>
                              <Select
                                filter
                                value={ts.endFieldId}
                                optionList={timeOpts.map((c) => ({ value: c.fieldId, label: c.fieldName }))}
                                onChange={(v) => patchTable(ts.tableId, { endFieldId: v as string })}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="dl-table-add-row">
                  <Select
                    filter
                    value=""
                    placeholder={t('label.addTable')}
                    optionList={tableList
                      .filter((x) => !custom.tables.some((ts) => ts.tableId === x.tableId))
                      .map((x) => ({ value: x.tableId, label: x.tableName }))}
                    onChange={(v) => { if (v) addTable(v as string); }}
                  />
                </div>
              </div>
            </Item>

            <div className="dl-section">{t('section.date')}</div>
            <Item label={t('label.selectDate')}>
              {datePresetSelect}
              {custom.datePreset === 'custom' && (
                <div style={{ marginTop: 8 }}>
                  <DatePicker
                    style={{ width: '100%' }}
                    type="date"
                    value={custom.customDate}
                    onChange={(d: any) => {
                      updateCustom({ datePreset: 'custom', customDate: d ? dayjs(d).startOf('day').valueOf() : custom.customDate });
                    }}
                  />
                </div>
              )}
            </Item>

            <div className="dl-section">{t('section.style')}</div>
            <Item label={t('label.eventIcon')}>
              <div className="dl-default-row">
                <IconPicker
                  value={custom.icon}
                  onChange={(ic) => updateCustom({ icon: ic })}
                  size={36}
                />
                <div className="dl-color-row">
                  <ColorField className="dl-color-input" value={custom.defaultColor} onChange={(c) => updateCustom({ defaultColor: c })} />
                  <span className="dl-color-hex">{custom.defaultColor}</span>
                </div>
              </div>
            </Item>
            {taskList.length > 0 && (
              <Item label={t('label.tables') + ' · 事件'}>
                <div className="dl-event-list">
                  {taskList.map((task) => {
                    const style = getEventStyle(task.tableId, task.value);
                    return (
                      <div key={task.key} className="dl-event-chip" style={{ borderLeftColor: style.color }}>
                        <IconPicker
                          value={style.icon}
                          onChange={(ic) => setEventStyle(task.key, { icon: ic })}
                          size={28}
                        />
                        <span title={task.value}>{task.value}</span>
                        <ColorField className="dl-event-color" value={style.color} onChange={(c) => setEventStyle(task.key, { color: c })} />
                        <button
                          type="button"
                          className="dl-event-remove"
                          onClick={() => {
                            const next = { ...(custom.eventConfigs || {}) };
                            delete next[task.key];
                            updateCustom({ eventConfigs: next });
                          }}
                          title="清除"
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              </Item>
            )}

            <div className="dl-section">{t('section.layout')}</div>
            <Item label={`${t('label.hourHeight')}：${custom.hourHeight}px`}>
              <Slider min={16} max={80} step={2} value={custom.hourHeight}
                onChange={(v) => updateCustom({ hourHeight: v as number })} />
            </Item>
            <Item label={`${t('label.pointRadius')}：${custom.pointRadius}px`}>
              <Slider min={3} max={16} step={1} value={custom.pointRadius}
                onChange={(v) => updateCustom({ pointRadius: v as number })} />
            </Item>

            <div className="dl-save-row">
              <Button className="dl-btn" theme="solid" onClick={onSave} block disabled={custom.tables.length === 0}>
                {t('confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 事件详情 */}
      <Modal
        title={
          detail.ev ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{detail.ev.icon}</span>
              <span style={{ fontWeight: 600 }}>{detail.ev.taskValue}</span>
              <span style={{ color: '#999', fontSize: 13 }}>{detail.ev.tableName}</span>
            </div>
          ) : ''
        }
        visible={detail.visible}
        onCancel={() => setDetail({ visible: false, ev: null })}
        footer={
          detail.ev ? (
            <Button theme="solid" onClick={openRecord}>查看原始记录</Button>
          ) : null
        }
        width={460}
        centered
      >
        {detail.ev && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              fontSize: 13, color: detail.ev.color, fontWeight: 600,
            }}>
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: detail.ev.color,
              }} />
              {detail.ev.isInterval
                ? `${t('range.interval')} · ${fmtRange(detail.ev)}`
                : `${t('range.point')} · ${fmtRange(detail.ev)}`}
            </div>
            {detailCats.map((cat) => (
              <div key={cat.fieldId} style={{ fontSize: 13, lineHeight: 1.8, display: 'flex', gap: 8 }}>
                <span style={{ color: '#999', flexShrink: 0, width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cat.fieldName}:
                </span>
                <span style={{ color: '#333', flex: 1, wordBreak: 'break-all' }}>
                  {formatFieldValue(detail.ev!.fields[cat.fieldId])}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </main>
  );
}

const PALETTE = ['#3370ff', '#7f3bf5', '#f54a45', '#10b981', '#fa8c16', '#eb2f96', '#00b8d9', '#5b8ff9', '#f7ba2a', '#8a2be2'];
function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

/* 支持透明度的颜色选择器（Semi ColorPicker 封装，弹出式色板） */
function ColorField({ value, onChange, className }: { value: string; onChange: (c: string) => void; className?: string }) {
  const val = useMemo(() => {
    const raw = value && /^#/.test(value) || /^rgba?\(/.test(value || '') ? (value || '#999999') : '#999999';
    try {
      return ColorPicker.colorStringToValue(raw);
    } catch {
      return ColorPicker.colorStringToValue('#999999');
    }
  }, [value]);
  return (
    <ColorPicker usePopover alpha value={val} onChange={(v) => onChange(rgbaString(v))}>
      <span className={className} style={{ background: value || '#999999' }} />
    </ColorPicker>
  );
}

function rgbaString(v: { rgba: { r: number; g: number; b: number; a: number } }): string {
  const { r, g, b, a } = v.rgba;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 100) / 100})`;
}

function isToday(ts: number): boolean {
  return dayjs(ts).isSame(dayjs(), 'day');
}

function fmtRange(ev: DayEvent): string {
  const fmt = (m: number | null) => (m == null ? '--:--' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`);
  return ev.isInterval ? `${fmt(ev.startMin)} – ${fmt(ev.endMin)}` : fmt(ev.startMin);
}
