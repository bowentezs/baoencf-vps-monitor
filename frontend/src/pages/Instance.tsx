import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Flex, Card, Text, Badge, Heading,
  Button, Box, Tabs, SegmentedControl
} from '@radix-ui/themes';
import {
  ArrowLeft,
  Server, Globe, Activity,
  Layers, RotateCcw, Cpu, Boxes,
  ChevronDown, ArrowUp
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import Loading from '../components/Loading';
import DetailsGrid from '../components/DetailsGrid';
import Flag from '../components/Flag';
import PingYAxisTick from '../components/PingYAxisTick';
import PingHeartbeatBar from '../components/PingHeartbeatBar';
import UnlockMatrix from '../components/UnlockMatrix';
import CarrierRadar, { matchTaskCarrier, type CarrierKey } from '../components/CarrierRadar';
import { useLiveData } from '../contexts/LiveDataContext';
import { useAuth } from '../contexts/AuthContext';
import { publicFetch } from '../utils/api';
import { normalizePublicClients } from '../utils/publicClients';
import {
  normalizePublicGpuRecords,
  normalizePublicMonitorRecords,
  type PublicGpuRecord,
  type PublicMonitorRecord,
} from '../utils/publicHistory';
import type { ClientInfo } from '../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, Bar, BarChart
} from 'recharts';
import {
  buildPingChartRows,
  fetchPingTaskSeries,
  findClosestPingSeriesKey,
  formatPingMs,
  getPingSeriesQuality,
  getPingSeriesWithRecords,
  getPingTimeDomain,
  getPingYAxisDomain,
  PingTaskSeries,
} from '../utils/pingChart';
import { buildMonitorChartData, getMonitorChartRenderData } from '../utils/monitorChartData';
import { monitorYAxisProps, pingYAxisProps, wideYAxisProps } from '../utils/monitorChartAxis';
import { formatBytes, formatSpeed, formatUptime } from '../utils/format';
import { getLocalStorageItem, setLocalStorageItem, removeLocalStorageItem } from '../utils/browserStorage';
import { normalizeDailyTrafficResponse, type DailyTrafficRow } from '../utils/dailyTraffic';

type TimeRange = '1h' | '4h' | '24h' | '3d';
type PingTimeRange = '1h' | '6h' | '24h' | '3d';
type ChartTab = 'cpu' | 'ram' | 'disk' | 'network' | 'connections' | 'process' | 'temp' | 'gpu';
type TrafficRangeDays = 7 | 30;
type InstanceViewTab = 'all' | 'ops' | 'network' | 'metrics';

const pingTimeRangeHours: Record<PingTimeRange, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '3d': 72,
};

const timeRangeMs: Record<TimeRange, number> = {
  '1h': 3600000,
  '4h': 14400000,
  '24h': 86400000,
  '3d': 259200000,
};

const timeRangePointLimit: Record<TimeRange, number> = {
  '1h': 240,
  '4h': 360,
  '24h': 720,
  '3d': 1000,
};

const monitorChartMargin = { top: 12, right: 16, bottom: 4, left: 4 };
const monitorChartHeight = 296;
const pingChartHeight = 260;
const dailyTrafficChartHeight = 256;

interface CustomPingTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: unknown;
    color?: string;
    payload: Record<string, unknown>;
  }>;
  label?: unknown;
  orderedSeries: PingTaskSeries[];
  timeFormatter: (value: unknown) => string;
  hoveredKey: string | null;
  activeTaskId: number | 'all';
  tooltipStyle?: 'capsule' | 'full';
  onHoverKey: (key: string | null) => void;
  onSelectTaskId?: (id: number) => void;
}

function CustomPingTooltip({
  active,
  payload,
  label,
  orderedSeries,
  timeFormatter,
  hoveredKey,
  activeTaskId,
  tooltipStyle = 'capsule',
  onHoverKey,
  onSelectTaskId,
}: CustomPingTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload as Record<string, unknown> | undefined;
  if (!row) return null;

  const timeLabel = timeFormatter(label);

  const items = orderedSeries.map((item) => {
    const rawVal = row[item.task.key];
    const isLoss = Boolean(row[`${item.task.key}_loss`]);
    const numVal = typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal : null;
    return {
      id: item.task.id,
      key: item.task.key,
      label: item.task.label,
      color: item.task.color,
      value: numVal,
      isLoss: isLoss || (rawVal === null && row[item.task.key] !== undefined),
      hasData: item.task.key in row,
    };
  }).filter((item) => item.hasData);

  if (items.length === 0) return null;

  // 🛡️ 静态稳定排序：丢包优先，然后按延迟降序排列（绝不因 hover 动态改动数组，根除闪烁）
  const sortedItems = [...items].sort((a, b) => {
    if (a.isLoss && !b.isLoss) return -1;
    if (!a.isLoss && b.isLoss) return 1;
    const valA = a.value ?? -1;
    const valB = b.value ?? -1;
    return valB - valA;
  });

  const isCapsule = tooltipStyle === 'capsule' || activeTaskId !== 'all';

  // 🍏 方案 1：极简单线微胶囊模式（顶部悬浮，彻底 0 遮挡折线波形）
  if (isCapsule) {
    const targetItem = (activeTaskId !== 'all'
      ? sortedItems.find((i) => i.id === activeTaskId)
      : (hoveredKey ? sortedItems.find((i) => i.key === hoveredKey) : null)) || sortedItems[0];

    if (!targetItem) return null;

    const lossCount = sortedItems.filter((i) => i.isLoss).length;
    const extraLossCount = targetItem.isLoss ? lossCount - 1 : lossCount;

    return (
      <div className="custom-ping-capsule">
        <span className="custom-ping-capsule-time">{timeLabel}</span>
        <span className="custom-ping-capsule-divider">·</span>
        <div className="custom-ping-capsule-target">
          <span
            className="custom-ping-tooltip-dot"
            style={{
              backgroundColor: targetItem.color,
              boxShadow: targetItem.isLoss ? '0 0 8px var(--red-9)' : `0 0 6px ${targetItem.color}80`,
            }}
          />
          <span className="custom-ping-capsule-name">{targetItem.label}</span>
        </div>
        <span className={`custom-ping-capsule-value${targetItem.isLoss ? ' is-loss' : ''}`}>
          {targetItem.isLoss ? '丢包 🔴' : `${Math.round(targetItem.value ?? 0)} ms`}
        </span>
        {activeTaskId === 'all' && extraLossCount > 0 && (
          <span className="custom-ping-capsule-loss-tag" title="此采样点还有其他线路丢包">
            +{extraLossCount}丢包
          </span>
        )}
      </div>
    );
  }

  // 全网清单对比视图（固定展示，不遮挡时使用）
  const isMulti = sortedItems.length > 4;

  return (
    <div className="custom-ping-tooltip">
      <div className="custom-ping-tooltip-header">
        <span>{timeLabel}</span>
        {sortedItems.some((i) => i.isLoss) ? (
          <span className="custom-ping-tooltip-header-hint" style={{ color: 'var(--red-10)', fontWeight: 600 }}>
            ⚠️ 存在丢包 · 点击线路可聚焦
          </span>
        ) : (
          <span className="custom-ping-tooltip-header-hint">
            点击线路可单独聚焦
          </span>
        )}
      </div>
      <div className={`custom-ping-tooltip-grid${isMulti ? ' is-multi' : ''}`}>
        {sortedItems.map((item) => {
          const isItemHovered = hoveredKey === item.key;
          const isItemFocused = typeof activeTaskId === 'number' && activeTaskId === item.id;
          return (
            <div
              key={item.key}
              className={`custom-ping-tooltip-item${item.isLoss ? ' is-loss' : ''}${isItemHovered ? ' is-hovered' : ''}${isItemFocused ? ' is-active' : ''}`}
              onMouseEnter={() => onHoverKey(item.key)}
              onMouseLeave={() => onHoverKey(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTaskId?.(item.id);
              }}
              title={`点击单独聚焦查看 ${item.label} 折线走势`}
            >
              <div className="custom-ping-tooltip-name-wrap">
                <span
                  className="custom-ping-tooltip-dot"
                  style={{
                    backgroundColor: item.color,
                    boxShadow: item.isLoss ? '0 0 6px var(--red-9)' : undefined,
                  }}
                />
                <span className="custom-ping-tooltip-label" title={item.label}>
                  {item.label}
                </span>
              </div>
              <span className={`custom-ping-tooltip-value${item.isLoss ? ' is-loss' : ''}`}>
                {item.isLoss ? '丢包 🔴' : item.value !== null ? formatPingMs(item.value) : '-'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SortablePingCardProps {
  item: PingTaskSeries;
  isFocused: boolean;
  isDimmed: boolean;
  isHovered?: boolean;
  canSort?: boolean;
  onFocusToggle: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function SortablePingCard({
  item,
  isFocused,
  isDimmed,
  isHovered = false,
  canSort = false,
  onFocusToggle,
  onMouseEnter,
  onMouseLeave,
}: SortablePingCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.task.id,
    disabled: !canSort,
  });

  if (!item || !item.task) return null;

  const quality = getPingSeriesQuality(item.records);

  const style: React.CSSProperties = {
    ['--item-color' as string]: item.task.color,
    transform: canSort && transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition: canSort ? transition : undefined,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : undefined,
    touchAction: canSort ? (isDragging ? 'none' : 'pan-y') : undefined,
  };

  const sortHint = canSort ? ' · 长按可拖动排序' : '';

  return (
    <div
      ref={setNodeRef}
      className={`instance-ping-card${isFocused ? ' is-active' : ''}${isDimmed ? ' is-dimmed' : ''}${isHovered ? ' is-hovered' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={style}
      onClick={onFocusToggle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={`点击${isFocused ? '取消聚焦' : '聚焦查看'}此线路走势${sortHint}\n${item.task.type} ${item.task.target}\n探测 ${quality.totalPackets} 次，丢包 ${quality.lostPackets} 次\n延迟区间: ${quality.minLatency ?? '-'} ~ ${quality.maxLatency ?? '-'} ms (基准中位: ${quality.medianLatency ?? '-'} ms)`}
      {...(canSort ? attributes : {})}
      {...(canSort ? listeners : {})}
    >
      {/* 头部：圆点 + 正文字色线路名 + 状态徽标 */}
      <div className="instance-ping-card-header">
        <div className="instance-ping-card-name-group">
          <span className="instance-ping-status-dot" />
          <span className="instance-ping-card-label">{item.task.label}</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {isFocused && (
            <span className="instance-ping-pill is-focus">聚焦</span>
          )}
          {quality.packetLossPercent > 0 ? (
            <span className={`instance-ping-pill is-${quality.lossLevel}`}>
              丢包 {quality.packetLossPercent}%
            </span>
          ) : quality.totalPackets > 0 ? (
            <span className="instance-ping-pill is-good">
              畅通
            </span>
          ) : (
            <span className="instance-ping-pill" style={{ background: 'var(--gray-a3)', color: 'var(--gray-10)' }}>
              无数据
            </span>
          )}
        </div>
      </div>

      {/* 核心数值与连通概况 */}
      <div className="instance-ping-card-body">
        <div className="instance-ping-value-wrap">
          <span className="instance-ping-value-num">
            {quality.avgLatency === null ? '全部超时' : quality.avgLatency}
          </span>
          {quality.avgLatency !== null && <span className="instance-ping-value-unit">ms</span>}
        </div>
        <div className="instance-ping-body-meta">
          {quality.totalPackets === 0 ? (
            '无采样'
          ) : quality.lostPackets > 0 ? (
            <>
              <span className="instance-ping-loss-highlight">{quality.lostPackets}次丢包</span> · {quality.totalPackets}次
            </>
          ) : (
            `${quality.totalPackets} 次探测`
          )}
        </div>
      </div>

      {/* 底部指标对 */}
      <div className="instance-ping-card-footer">
        <div className="instance-ping-footer-item">
          <span className="instance-ping-footer-label">中位</span>
          <span className="instance-ping-footer-val">{quality.medianLatency !== null ? `${quality.medianLatency}ms` : '-'}</span>
        </div>
        <div className="instance-ping-footer-item">
          <span className="instance-ping-footer-label">极值</span>
          <span className="instance-ping-footer-val">{quality.minLatency ?? '-'} ~ {quality.maxLatency ?? '-'} ms</span>
        </div>
      </div>
    </div>
  );
}

function historyQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.toString();
}



export default function Instance() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { authLoading, isAuthenticated } = useAuth();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [records, setRecords] = useState<PublicMonitorRecord[]>([]);
  const [clientLoading, setClientLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartTab, setChartTab] = useState<ChartTab>('cpu');
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [recordsRangeEnd, setRecordsRangeEnd] = useState(() => Date.now());
  const [pingSeries, setPingSeries] = useState<PingTaskSeries[]>([]);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const [pingTimeRange, setPingTimeRange] = useState<PingTimeRange>('1h');
  const [activePingTaskId, setActivePingTaskId] = useState<number | 'all'>('all');
  const [activeCarrier, setActiveCarrier] = useState<CarrierKey>('all');
  const [pingFilterCarrier, setPingFilterCarrier] = useState<CarrierKey | 'loss'>('all');

  const handleSelectCarrier = (carrier: CarrierKey, taskIds: number[]) => {
    if (carrier === 'all' || activeCarrier === carrier) {
      setActiveCarrier('all');
      setPingFilterCarrier('all');
    } else {
      setActiveCarrier(carrier);
      setPingFilterCarrier(carrier);
    }
    // 保持多线对比，不强行裁切为单线
    if (typeof activePingTaskId === 'number' && !taskIds.includes(activePingTaskId)) {
      setActivePingTaskId('all');
    }
  };

  const handleFilterCarrierChange = (filter: CarrierKey | 'loss') => {
    setPingFilterCarrier(filter);
    if (filter === 'loss' || filter === 'all') {
      setActiveCarrier('all');
    } else {
      setActiveCarrier(filter);
    }
    if (typeof activePingTaskId === 'number') {
      const currentItem = orderedPingSeries.find((item) => item.task.id === activePingTaskId);
      if (currentItem) {
        if (filter === 'loss') {
          const q = getPingSeriesQuality(currentItem.records);
          if (q.packetLossPercent === 0 && q.lostPackets === 0) {
            setActivePingTaskId('all');
          }
        } else if (filter !== 'all') {
          const c = matchTaskCarrier(currentItem.task.label, currentItem.task.target);
          if (c !== filter) {
            setActivePingTaskId('all');
          }
        }
      }
    }
  };

  const [hoveredPingKey, setHoveredPingKey] = useState<string | null>(null);
  const [pingTooltipStyle, setPingTooltipStyle] = useState<'capsule' | 'full'>(() => {
    const saved = getLocalStorageItem('instancePingTooltipStyle');
    return saved === 'full' ? 'full' : 'capsule';
  });

  const handlePingTooltipStyleChange = (style: 'capsule' | 'full') => {
    setPingTooltipStyle(style);
    setLocalStorageItem('instancePingTooltipStyle', style);
  };
  const [shouldLoadPing, setShouldLoadPing] = useState(false);
  const [gpuRecords, setGpuRecords] = useState<PublicGpuRecord[]>([]);
  const [trafficRangeDays, setTrafficRangeDays] = useState<TrafficRangeDays>(7);
  const [dailyTraffic, setDailyTraffic] = useState<DailyTrafficRow[]>([]);
  const [dailyTrafficLoading, setDailyTrafficLoading] = useState(true);
  const [dailyTrafficError, setDailyTrafficError] = useState(false);
  const [dailyTrafficChartType, setDailyTrafficChartType] = useState<'line' | 'bar'>(() => {
    const saved = getLocalStorageItem('dailyTrafficChartType');
    return saved === 'bar' ? 'bar' : 'line';
  });

  const handleDailyTrafficChartTypeChange = (value: string) => {
    const next = value === 'bar' ? 'bar' : 'line';
    setDailyTrafficChartType(next);
    setLocalStorageItem('dailyTrafficChartType', next);
  };

  const [activeViewTab, setActiveViewTab] = useState<InstanceViewTab>(() => {
    const saved = getLocalStorageItem('instanceActiveViewTab');
    return saved === 'ops' || saved === 'network' || saved === 'metrics' || saved === 'all'
      ? saved
      : 'all';
  });

  const handleViewTabChange = (value: string) => {
    const next = value as InstanceViewTab;
    setActiveViewTab(next);
    setLocalStorageItem('instanceActiveViewTab', next);
  };

  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState<boolean>(() => {
    return getLocalStorageItem('instanceDetailsCollapsed') === 'true';
  });

  const toggleDetailsCollapse = () => {
    setIsDetailsCollapsed((prev) => {
      const next = !prev;
      setLocalStorageItem('instanceDetailsCollapsed', String(next));
      return next;
    });
  };

  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 350);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const pingSectionRef = useRef<HTMLDivElement | null>(null);
  const scrollPosRef = useRef<number | null>(null);
  const isDraggingPingRef = useRef(false);

  const [pingTaskOrder, setPingTaskOrder] = useState<number[]>(() => {
    try {
      const saved = getLocalStorageItem('instancePingTaskOrder');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.map(Number).filter((n) => !Number.isNaN(n)) : [];
    } catch {
      return [];
    }
  });

  const pingSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useLayoutEffect(() => {
    if (scrollPosRef.current === null) return undefined;
    const targetY = scrollPosRef.current;
    window.scrollTo({ top: targetY, behavior: 'instant' });
    const frameId = requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'instant' });
      scrollPosRef.current = null;
    });
    return () => cancelAnimationFrame(frameId);
  }, [uuid]);

  const { liveData } = useLiveData();
  const liveRecord = uuid ? liveData?.data?.[uuid] : undefined;
  const onlineSet = useMemo(() => new Set(liveData?.online || []), [liveData?.online]);
  const groupedClients = useMemo(() => {
    const sorted = [...clients].sort((a, b) => {
      const aOnline = onlineSet.has(a.uuid);
      const bOnline = onlineSet.has(b.uuid);
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    const groups = new Map<string, ClientInfo[]>();
    sorted.forEach((node) => {
      const groupName = node.group?.trim() || '未分组';
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName)!.push(node);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (a === '未分组') return 1;
        if (b === '未分组') return -1;
        return a.localeCompare(b);
      })
      .map(([group, nodes]) => ({ group, nodes }));
  }, [clients, onlineSet]);

  // Load public client info.
  useEffect(() => {
    let cancelled = false;
    if (!uuid || authLoading) return;

    const existing = clients.find((c) => c.uuid === uuid);
    if (existing) {
      setClient(existing);
      setError(null);
    } else {
      setClientLoading(true);
      setError(null);
    }

    publicFetch(`/nodes${isAuthenticated ? '?include_hidden=1' : ''}`)
      .then((data) => {
        if (cancelled) return;
        const visible = normalizePublicClients(data, { includeHidden: isAuthenticated });
        setClients(visible);
        const found = visible.find((c) => c.uuid === uuid) || null;
        if (found) {
          setClient(found);
          setError(null);
        } else {
          setError('服务器不存在');
        }
      })
      .catch(() => {
        if (!cancelled && !existing) setError('加载失败');
      })
      .finally(() => {
        if (!cancelled) setClientLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uuid, authLoading, isAuthenticated]);

  // Load history records
  useEffect(() => {
    let cancelled = false;
    if (!uuid) {
      setRecords([]);
      setRecordsLoading(false);
      return () => { cancelled = true; };
    }
    if (authLoading) return () => { cancelled = true; };

    setRecordsLoading(true);
    const endTs = Date.now();
    const startTs = endTs - timeRangeMs[timeRange];
    const start = new Date(startTs).toISOString();
    const end = new Date(endTs).toISOString();
    const limit = timeRangePointLimit[timeRange];
    setRecordsRangeEnd(endTs);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

    publicFetch(
      `/records/load?${historyQuery({ uuid, start, end, cursor: end, limit, include_hidden: isAuthenticated ? 1 : undefined })}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!cancelled) {
          setRecords(normalizePublicMonitorRecords(data));
        }
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setRecordsLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [uuid, authLoading, isAuthenticated, timeRange]);

  useEffect(() => {
    let cancelled = false;
    if (!uuid) {
      setDailyTraffic([]);
      setDailyTrafficLoading(false);
      return () => { cancelled = true; };
    }
    if (authLoading) return () => { cancelled = true; };

    setDailyTrafficLoading(true);
    setDailyTrafficError(false);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

    publicFetch(
      `/traffic/daily?days=${trafficRangeDays}${isAuthenticated ? '&include_hidden=1' : ''}`,
      { signal: controller.signal },
    )
      .then((payload) => {
        const normalized = normalizeDailyTrafficResponse(payload);
        if (!normalized) throw new Error('Invalid daily traffic response');
        if (!cancelled) {
          setDailyTraffic(normalized.data.filter((row) => row.client === uuid));
          setDailyTrafficError(false);
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setDailyTraffic([]);
          setDailyTrafficError(true);
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setDailyTrafficLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [uuid, trafficRangeDays, authLoading, isAuthenticated]);

  useEffect(() => {
    const isPingNearViewport = () => {
      const el = pingSectionRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight + 350 && rect.bottom > -350;
    };

    setShouldLoadPing(isPingNearViewport());
    setPingSeries([]);
    setPingError(null);
    setPingLoading(false);
    setActivePingTaskId('all');
    setActiveCarrier('all');
    setPingFilterCarrier('all');
    setDailyTraffic([]);
    setDailyTrafficError(false);
  }, [uuid]);

  useEffect(() => {
    if (shouldLoadPing) return;
    const target = pingSectionRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setShouldLoadPing(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldLoadPing(true);
      observer.disconnect();
    }, { rootMargin: '240px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldLoadPing, uuid, client]);

  // Load ping tasks and records only when the Ping card is near the viewport.
  useEffect(() => {
    let cancelled = false;
    if (!uuid || !shouldLoadPing) {
      setPingLoading(false);
      return () => { cancelled = true; };
    }
    if (authLoading) return () => { cancelled = true; };

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

    setPingSeries([]);
    setPingError(null);
    setPingLoading(true);

    const rangeHours = pingTimeRangeHours[pingTimeRange];
    fetchPingTaskSeries(uuid, {
      limit: 1000,
      rangeHours,
      cursor: new Date().toISOString(),
      includeHidden: isAuthenticated,
      signal: controller.signal,
    })
      .then((series) => {
        if (!cancelled) {
          setPingSeries(series);
          setPingError(null);
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setPingError('加载 Ping 数据失败');
          setPingSeries([]);
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setPingLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [shouldLoadPing, pingTimeRange, uuid, authLoading, isAuthenticated]);

  // Load GPU records (only for GPU-capable clients)
  useEffect(() => {
    if (!uuid || authLoading || !client?.gpu_name) return;
    const endTs = Date.now();
    const startTs = endTs - timeRangeMs[timeRange];
    const start = new Date(startTs).toISOString();
    const end = new Date(endTs).toISOString();

    publicFetch(`/records/gpu?${historyQuery({ uuid, start, end, cursor: end, limit: timeRangePointLimit[timeRange], include_hidden: isAuthenticated ? 1 : undefined })}`)
      .then((data) => setGpuRecords(normalizePublicGpuRecords(data)))
      .catch(() => {});
  }, [uuid, timeRange, client?.gpu_name, authLoading, isAuthenticated]);

  const handleTimeRangeChange = (v: string) => {
    const range = v as TimeRange;
    setTimeRange(range);
    setRecordsLoading(true);
  };

  const latestHistory = records.length > 0 ? records[records.length - 1] : null;
  const liveRecordWithTime = liveRecord as { time?: unknown } | undefined;
  const latestRecordTime = typeof liveRecordWithTime?.time === 'string'
    ? liveRecordWithTime.time
    : new Date(liveData?.timestamp || Date.now()).toISOString();
  const latest = liveRecord
    ? ({
      ...(latestHistory || {}),
      ...liveRecord,
      time: latestRecordTime,
    } as PublicMonitorRecord)
    : latestHistory;

  const aggregatedProcesses = useMemo(() => {
    // 权限门禁：仅管理员登录可见活跃进程，未登录外部访客完全绝缘，防止资产刺探
    if (!isAuthenticated || !latest?.top_processes || latest.top_processes.length === 0) return [];
    const map = new Map<string, { pid: number; name: string; cpu: number; ram: number; count: number }>();
    for (const proc of latest.top_processes) {
      // 路径脱敏：彻底剔除父路径（如 /usr/bin/python3 归一为 python3），避免泄露系统绝对目录结构
      const rawName = String(proc.name || '').trim();
      const sanitizedName = rawName.replace(/^.*[\\/]/, '') || rawName || 'unknown';
      const existing = map.get(sanitizedName);
      if (!existing) {
        map.set(sanitizedName, {
          pid: proc.pid,
          name: sanitizedName,
          cpu: proc.cpu,
          ram: proc.ram,
          count: 1,
        });
      } else {
        existing.cpu = Math.round((existing.cpu + proc.cpu) * 10) / 10;
        existing.ram = Math.round((existing.ram + proc.ram) * 10) / 10;
        existing.count += 1;
      }
    }
    return Array.from(map.values())
      .sort((a, b) => (b.cpu === a.cpu ? b.ram - a.ram : b.cpu - a.cpu))
      .slice(0, 5);
  }, [isAuthenticated, latest?.top_processes]);

  const chartTimeFormatter = (value: unknown) => {
    const dateInput = typeof value === 'string' || typeof value === 'number' || value instanceof Date ? value : '';
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return '';
    return timeRange === '24h' || timeRange === '3d'
      ? date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const chartData = buildMonitorChartData(records);
  const chartRenderData = getMonitorChartRenderData(chartData, timeRangeMs[timeRange], recordsRangeEnd);
  const monitorXAxisDomain = [recordsRangeEnd - timeRangeMs[timeRange], recordsRangeEnd] as [number, number];

  const gpuChartData = gpuRecords.map((r) => ({
    time: new Date(r.time).getTime(),
    utilization: r.utilization || 0,
    memory: r.mem_total > 0 ? Number(((r.mem_used / r.mem_total) * 100).toFixed(1)) : 0,
    temp: r.temperature || 0,
  }));

  const pingSeriesWithRecords = getPingSeriesWithRecords(pingSeries);

  const orderedPingSeries = useMemo(() => {
    if (!isAuthenticated || pingTaskOrder.length === 0) return pingSeriesWithRecords;
    const orderMap = new Map<number, number>();
    pingTaskOrder.forEach((id, idx) => orderMap.set(id, idx));

    return [...pingSeriesWithRecords].sort((a, b) => {
      const orderA = orderMap.has(a.task.id) ? orderMap.get(a.task.id)! : 999999;
      const orderB = orderMap.has(b.task.id) ? orderMap.get(b.task.id)! : 999999;
      if (orderA !== orderB) return orderA - orderB;
      return 0;
    });
  }, [pingSeriesWithRecords, pingTaskOrder, isAuthenticated]);

  const carrierCounts = useMemo(() => {
    const counts = {
      all: orderedPingSeries.length,
      ct: 0,
      cu: 0,
      cm: 0,
      intl: 0,
      loss: 0,
    };
    for (const item of orderedPingSeries) {
      const carrier = matchTaskCarrier(item.task.label, item.task.target);
      if (carrier in counts) {
        counts[carrier as keyof typeof counts] += 1;
      }
      const quality = getPingSeriesQuality(item.records);
      if (quality.packetLossPercent > 0 || quality.lostPackets > 0) {
        counts.loss += 1;
      }
    }
    return counts;
  }, [orderedPingSeries]);

  const displayPingSeries = useMemo(() => {
    if (pingFilterCarrier === 'all') return orderedPingSeries;
    if (pingFilterCarrier === 'loss') {
      return orderedPingSeries.filter((item) => {
        const q = getPingSeriesQuality(item.records);
        return q.packetLossPercent > 0 || q.lostPackets > 0;
      });
    }
    return orderedPingSeries.filter((item) => {
      return matchTaskCarrier(item.task.label, item.task.target) === pingFilterCarrier;
    });
  }, [orderedPingSeries, pingFilterCarrier]);

  const displaySortableTaskIds = useMemo(
    () => displayPingSeries.map((item) => item.task.id),
    [displayPingSeries]
  );

  const hasCustomPingOrder = useMemo(() => {
    if (!isAuthenticated || pingTaskOrder.length === 0 || pingSeriesWithRecords.length === 0) return false;
    return pingSeriesWithRecords.some((item) => pingTaskOrder.includes(item.task.id));
  }, [isAuthenticated, pingTaskOrder, pingSeriesWithRecords]);

  const handlePingDragStart = () => {
    if (!isAuthenticated) return;
    isDraggingPingRef.current = true;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(18); } catch {}
    }
  };

  const handlePingDragEnd = (event: DragEndEvent) => {
    if (!isAuthenticated) return;
    setTimeout(() => {
      isDraggingPingRef.current = false;
    }, 60);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = Number(active.id);
    const overId = Number(over.id);

    const currentIds = orderedPingSeries.map((item) => item.task.id);
    const oldIndex = currentIds.indexOf(activeId);
    const newIndex = currentIds.indexOf(overId);

    if (oldIndex !== -1 && newIndex !== -1) {
      const nextIds = arrayMove(currentIds, oldIndex, newIndex);
      setPingTaskOrder(nextIds);
      setLocalStorageItem('instancePingTaskOrder', JSON.stringify(nextIds));
    }
  };

  const handlePingDragCancel = () => {
    setTimeout(() => {
      isDraggingPingRef.current = false;
    }, 60);
  };

  const handleResetPingOrder = () => {
    setPingTaskOrder([]);
    removeLocalStorageItem('instancePingTaskOrder');
  };

  const visiblePingSeries = activePingTaskId === 'all'
    ? orderedPingSeries
    : orderedPingSeries.filter((item) => item.task.id === activePingTaskId);
  const activeSeriesForDomain = visiblePingSeries.length > 0 ? visiblePingSeries : orderedPingSeries;
  const pingChartRows = buildPingChartRows(orderedPingSeries);
  const pingYAxisDomain = getPingYAxisDomain(activeSeriesForDomain);
  const pingXAxisDomain = getPingTimeDomain(orderedPingSeries, pingTimeRangeHours[pingTimeRange]);
  const pingChartTimeFormatter = (value: unknown) => {
    const dateInput = typeof value === 'string' || typeof value === 'number' || value instanceof Date ? value : '';
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return '';
    return pingTimeRange === '24h' || pingTimeRange === '3d'
      ? date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const handlePingChartMouseMove = (state: any) => {
    if (!state || activePingTaskId !== 'all') return;
    const activeIndex = state.activeTooltipIndex;
    const chartY = state.chartY;
    if (typeof activeIndex !== 'number' || typeof chartY !== 'number') return;
    const row = pingChartRows[activeIndex];
    if (!row) return;

    const closestKey = findClosestPingSeriesKey({
      chartY,
      chartHeight: pingChartHeight,
      topPad: monitorChartMargin.top ?? 12,
      bottomPad: (monitorChartMargin.bottom ?? 4) + 30,
      yMin: pingYAxisDomain[0] ?? 0,
      yMax: pingYAxisDomain[1] ?? 100,
      row,
      series: orderedPingSeries,
    });

    if (closestKey && closestKey !== hoveredPingKey) {
      setHoveredPingKey(closestKey);
    }
  };

  const dailyTrafficChartData = dailyTraffic.map((row) => ({
    ...row,
    label: row.day.slice(5).replace('-', '/'),
  }));
  const todayTraffic = dailyTraffic[dailyTraffic.length - 1];
  const showMetrics = activeViewTab === 'all' || activeViewTab === 'metrics';
  const showNetwork = activeViewTab === 'all' || activeViewTab === 'network';
  const hasOpsData = Boolean(
    (isAuthenticated && latest?.top_processes && latest.top_processes.length > 0) ||
    (latest?.unlock_items && latest.unlock_items.length > 0)
  );
  const showOps = activeViewTab === 'ops' || (activeViewTab === 'all' && hasOpsData);

  if (!client && clientLoading) return <Loading />;
  if (error || !client) return <Text color="red" align="center" style={{ padding: 40 }}>{error || '未找到'}</Text>;

  return (
    <div className="instance-page">
      <div className="instance-shell">
        <InstanceNodeSidebar
          groups={groupedClients}
          activeUuid={uuid || ''}
          onlineSet={onlineSet}
          liveData={liveData?.data || {}}
          onSelect={(nextUuid) => {
            if (nextUuid === uuid) return;
            scrollPosRef.current = window.scrollY;
            navigate(`/instance/${nextUuid}`);
          }}
        />

        <section className="instance-detail-panel">
      {/* Top bar */}
      <Flex justify="between" align="center" mb="3">
        <button
          type="button"
          className="instance-back-pill"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={15} />
          <span>返回节点大厅</span>
        </button>
      </Flex>

      {/* Header + compact details */}
      <Card className="instance-top-summary" mb="3">
        <Flex justify="between" align="center" gap="3" wrap="wrap" className="instance-top-summary-header">
          <Flex align="center" gap="3" wrap="wrap">
            <Server size={24} color="var(--accent-9)" />
            <Heading size="5">{client.name}</Heading>
            {client.region && <Badge color="gray"><Globe size={12} /> {client.region}</Badge>}
            {client.group && <Badge color="purple"><Layers size={12} /> {client.group}</Badge>}
            {latest && (
              <Badge color="green" variant="solid">
                <Activity size={12} /> 已运行 {formatUptime(latest.uptime)}
              </Badge>
            )}
          </Flex>
          <button
            type="button"
            className="instance-collapse-toggle-btn"
            onClick={toggleDetailsCollapse}
            title={isDetailsCollapsed ? '展开硬件规格' : '折叠硬件规格'}
          >
            <span className={`instance-toggle-icon ${isDetailsCollapsed ? 'is-collapsed' : ''}`}>
              <ChevronDown size={13} />
            </span>
            <span>{isDetailsCollapsed ? '展开硬件规格' : '折叠规格'}</span>
          </button>
        </Flex>
        <div className={`instance-details-collapsible ${isDetailsCollapsed ? 'collapsed' : ''}`} style={{ marginTop: isDetailsCollapsed ? 0 : 8 }}>
          <DetailsGrid client={client} live={latest} compact remark={client.public_remark} />
        </div>
      </Card>

      {/* 🚀 视图切换胶囊导航与快捷直达锚点 */}
      <Flex justify="between" align="center" mb="3" wrap="wrap" gap="2" className="instance-view-nav-bar">
        <SegmentedControl.Root
          size="2"
          value={activeViewTab}
          onValueChange={handleViewTabChange}
          style={{ borderRadius: 99, background: 'var(--gray-a3)' }}
        >
          <SegmentedControl.Item value="all">
            <Flex align="center" gap="1">
              <Layers size={13} />
              <span>全部总览</span>
            </Flex>
          </SegmentedControl.Item>
          <SegmentedControl.Item value="ops">
            <Flex align="center" gap="1">
              <Boxes size={13} />
              <span>系统负载与解锁</span>
            </Flex>
          </SegmentedControl.Item>
          <SegmentedControl.Item value="network">
            <Flex align="center" gap="1">
              <Activity size={13} />
              <span>三网骨干与Ping</span>
            </Flex>
          </SegmentedControl.Item>
          <SegmentedControl.Item value="metrics">
            <Flex align="center" gap="1">
              <Cpu size={13} />
              <span>性能监控与流量</span>
            </Flex>
          </SegmentedControl.Item>
        </SegmentedControl.Root>

        {activeViewTab === 'all' && (
          <Flex align="center" gap="1" wrap="wrap" className="instance-quick-anchor-pills">
            <Text size="1" color="gray" style={{ fontSize: 11, marginRight: 2 }}>
              直达:
            </Text>
            <button
              type="button"
              className="instance-anchor-btn"
              onClick={() => document.getElementById('sec-traffic')?.scrollIntoView({ behavior: 'smooth' })}
            >
              📶 每日流量
            </button>
            <button
              type="button"
              className="instance-anchor-btn"
              onClick={() => document.getElementById('sec-metrics')?.scrollIntoView({ behavior: 'smooth' })}
            >
              📈 性能折线
            </button>
            <button
              type="button"
              className="instance-anchor-btn"
              onClick={() => document.getElementById('sec-network')?.scrollIntoView({ behavior: 'smooth' })}
            >
              🌐 三网雷达
            </button>
            {hasOpsData && (
              <button
                type="button"
                className="instance-anchor-btn"
                onClick={() => document.getElementById('sec-ops')?.scrollIntoView({ behavior: 'smooth' })}
              >
                🚀 负载与解锁
              </button>
            )}
          </Flex>
        )}
      </Flex>

      {/* 模块 A：每日流量统计 */}
      {showMetrics && (
        <div id="sec-traffic">
          <Card className="instance-daily-traffic-card" mb="4">
        <Flex justify="between" align="center" mb="3" gap="3" wrap="wrap">
          <Box>
            <Text weight="bold" as="p">每日流量</Text>
            <Text size="1" color="gray" as="p">
              北京时间 · 今日 ↑ {todayTraffic ? formatBytes(todayTraffic.up) : '-'} ↓ {todayTraffic ? formatBytes(todayTraffic.down) : '-'}
            </Text>
          </Box>
          <Flex align="center" gap="2" wrap="wrap">
            <SegmentedControl.Root
              size="1"
              value={dailyTrafficChartType}
              onValueChange={handleDailyTrafficChartTypeChange}
            >
              <SegmentedControl.Item value="line">折线</SegmentedControl.Item>
              <SegmentedControl.Item value="bar">柱状</SegmentedControl.Item>
            </SegmentedControl.Root>
            <SegmentedControl.Root
              size="1"
              value={String(trafficRangeDays)}
              onValueChange={(value) => setTrafficRangeDays(value === '30' ? 30 : 7)}
            >
              <SegmentedControl.Item value="7">7天</SegmentedControl.Item>
              <SegmentedControl.Item value="30">30天</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>
        </Flex>
        <Box style={{ height: dailyTrafficChartHeight }}>
          {dailyTrafficLoading ? (
            <Flex align="center" justify="center" style={{ height: '100%' }}>
              <Text size="2" color="gray">加载中</Text>
            </Flex>
          ) : dailyTrafficError ? (
            <Flex align="center" justify="center" style={{ height: '100%' }}>
              <Text size="2" color="gray">每日流量暂不可用</Text>
            </Flex>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {dailyTrafficChartType === 'line' ? (
                <LineChart data={dailyTrafficChartData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    fontSize={12}
                    minTickGap={16}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis {...wideYAxisProps} tickFormatter={(value) => formatBytes(Number(value))} />
                  <Tooltip
                    labelFormatter={(label) => `${String(label)} 北京时间`}
                    formatter={(value: number, name) => [formatBytes(Number(value)), name]}
                  />
                  <Line
                    type="monotone"
                    dataKey="up"
                    name="上传"
                    stroke="var(--blue-9)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="down"
                    name="下载"
                    stroke="var(--green-9)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              ) : (
                <BarChart data={dailyTrafficChartData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    fontSize={12}
                    minTickGap={16}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis {...wideYAxisProps} tickFormatter={(value) => formatBytes(Number(value))} />
                  <Tooltip
                    labelFormatter={(label) => `${String(label)} 北京时间`}
                    formatter={(value: number, name) => [formatBytes(Number(value)), name]}
                  />
                  <Bar dataKey="up" name="上传" fill="var(--blue-9)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="down" name="下载" fill="var(--green-9)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </Box>
      </Card>
      </div>
      )}

      {/* 模块 B：性能历史监控图表 */}
      {showMetrics && (
      <div id="sec-metrics">
      <Card mb="4">
        <Flex justify="between" align="center" mb="3" gap="3" wrap="wrap">
          <Text weight="bold">监控图表 · {timeRange === '1h' ? '最近1小时' : timeRange === '4h' ? '最近4小时' : timeRange === '24h' ? '最近24小时' : '最近3天'}</Text>
          <Flex align="center" gap="3" wrap="wrap">
            <SegmentedControl.Root size="1" value={timeRange} onValueChange={handleTimeRangeChange}>
              <SegmentedControl.Item value="1h">1小时</SegmentedControl.Item>
              <SegmentedControl.Item value="4h">4小时</SegmentedControl.Item>
              <SegmentedControl.Item value="24h">24小时</SegmentedControl.Item>
              <SegmentedControl.Item value="3d">3天</SegmentedControl.Item>
            </SegmentedControl.Root>
            <Text size="1" color="gray">{records.length} 个数据点</Text>
          </Flex>
        </Flex>
        <Tabs.Root value={chartTab} onValueChange={(value) => setChartTab(value as ChartTab)}>
          <Flex justify="center" className="instance-chart-tabs">
            <Tabs.List>
              <Tabs.Trigger value="cpu">CPU</Tabs.Trigger>
              <Tabs.Trigger value="ram">内存</Tabs.Trigger>
              <Tabs.Trigger value="disk">磁盘</Tabs.Trigger>
              <Tabs.Trigger value="network">网络</Tabs.Trigger>
              <Tabs.Trigger value="connections">连接数</Tabs.Trigger>
              <Tabs.Trigger value="process">进程数</Tabs.Trigger>
              <Tabs.Trigger value="temp">温度</Tabs.Trigger>
              {client.gpu_name && gpuRecords.length > 0 && (
                <Tabs.Trigger value="gpu">GPU</Tabs.Trigger>
              )}
            </Tabs.List>
          </Flex>

          <Box pt="3">
            {records.length === 0 && recordsLoading ? (
              <Flex align="center" justify="center" style={{ height: monitorChartHeight }}>
                <Text size="2" color="gray">加载监控数据…</Text>
              </Flex>
            ) : chartTab === 'gpu' ? (
              <ResponsiveContainer width="100%" height={monitorChartHeight}>
                <LineChart data={gpuChartData} margin={monitorChartMargin}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={monitorXAxisDomain}
                    tickFormatter={chartTimeFormatter}
                    fontSize={12}
                    minTickGap={28}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis {...monitorYAxisProps} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <Tooltip
                    labelFormatter={chartTimeFormatter}
                    formatter={(value: number, name) => [
                      `${Number(value).toFixed(1)}${name === '温度 °C' ? ' °C' : '%'}`,
                      name,
                    ]}
                  />
                  <Line type="monotone" dataKey="utilization" stroke="var(--accent-9)" dot={false} strokeWidth={2} name="利用率 %" isAnimationActive={false} />
                  <Line type="monotone" dataKey="memory" stroke="var(--green-9)" dot={false} strokeWidth={2} name="显存 %" isAnimationActive={false} />
                  <Line type="monotone" dataKey="temp" stroke="var(--red-9)" dot={false} strokeWidth={2} name="温度 °C" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : chartTab === 'network' ? (
              <ResponsiveContainer width="100%" height={monitorChartHeight}>
                <AreaChart data={chartRenderData} margin={monitorChartMargin}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={monitorXAxisDomain}
                    tickFormatter={chartTimeFormatter}
                    fontSize={12}
                    minTickGap={28}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis {...wideYAxisProps} tickFormatter={(value) => formatSpeed(Number(value))} unit="" />
                  <Tooltip
                    labelFormatter={chartTimeFormatter}
                    formatter={(value: number, name) => [formatSpeed(Number(value)), name]}
                  />
                  <Area type="monotone" dataKey="net_in" stroke="var(--green-9)" fill="var(--green-3)" fillOpacity={0.32} dot={false} name="下载" isAnimationActive={false} />
                  <Area type="monotone" dataKey="net_out" stroke="var(--blue-9)" fill="var(--blue-3)" fillOpacity={0.32} dot={false} name="上传" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : chartTab === 'connections' ? (
              <ResponsiveContainer width="100%" height={monitorChartHeight}>
                <LineChart data={chartRenderData} margin={monitorChartMargin}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={monitorXAxisDomain}
                    tickFormatter={chartTimeFormatter}
                    fontSize={12}
                    minTickGap={28}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis {...wideYAxisProps} domain={['auto', 'auto']} allowDecimals={false} unit=" 个" />
                  <Tooltip
                    labelFormatter={chartTimeFormatter}
                    formatter={(value: number, name) => [Number(value).toFixed(0), name]}
                  />
                  <Line type="monotone" dataKey="connections" stroke="var(--accent-9)" dot={false} strokeWidth={2} name="TCP" isAnimationActive={false} />
                  <Line type="monotone" dataKey="connections_udp" stroke="var(--cyan-9)" dot={false} strokeWidth={2} name="UDP" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : chartTab === 'process' ? (
              <ResponsiveContainer width="100%" height={monitorChartHeight}>
                <LineChart data={chartRenderData} margin={monitorChartMargin}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={monitorXAxisDomain}
                    tickFormatter={chartTimeFormatter}
                    fontSize={12}
                    minTickGap={28}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis {...wideYAxisProps} domain={['auto', 'auto']} allowDecimals={false} unit=" 个" />
                  <Tooltip
                    labelFormatter={chartTimeFormatter}
                    formatter={(value: number) => [Number(value).toFixed(0), '进程数']}
                  />
                  <Line type="monotone" dataKey="process_count" stroke="var(--accent-9)" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={monitorChartHeight}>
                <LineChart data={chartRenderData} margin={monitorChartMargin}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={monitorXAxisDomain}
                    tickFormatter={chartTimeFormatter}
                    fontSize={12}
                    minTickGap={28}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    {...monitorYAxisProps}
                    domain={chartTab === 'temp' ? ['auto', 'auto'] : [0, 100]}
                    tickFormatter={(value) => {
                      if (chartTab === 'temp') return `${Number(value).toFixed(0)}°C`;
                      return `${Number(value).toFixed(0)}%`;
                    }}
                  />
                  <Tooltip
                    labelFormatter={chartTimeFormatter}
                    formatter={(value: number) => {
                      if (chartTab === 'temp') return [`${Number(value).toFixed(1)} °C`, '温度'];
                      return [`${Number(value).toFixed(1)}%`, chartTab === 'cpu' ? 'CPU' : chartTab === 'ram' ? '内存' : '磁盘'];
                    }}
                  />
                  <Line type="monotone" dataKey={chartTab} stroke="var(--accent-9)" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Tabs.Root>
      </Card>
      </div>
      )}

      {/* 模块 C：三网骨干雷达与 Ping 测速 */}
      {showNetwork && (
      <div ref={pingSectionRef} id="sec-network">
        {orderedPingSeries.length > 0 && (
          <CarrierRadar
            series={orderedPingSeries}
            activeCarrier={activeCarrier}
            onSelectCarrier={handleSelectCarrier}
            activePingTaskId={activePingTaskId}
          />
        )}
        <Card mb="4">
        <Flex justify="between" align="center" mb="3" gap="3" wrap="wrap">
          <Flex align="center" gap="3" wrap="wrap">
            <Text weight="bold">Ping 延迟折线走势</Text>
            <SegmentedControl.Root size="1" value={pingTimeRange} onValueChange={(v) => setPingTimeRange(v as PingTimeRange)}>
              <SegmentedControl.Item value="1h">1小时</SegmentedControl.Item>
              <SegmentedControl.Item value="6h">6小时</SegmentedControl.Item>
              <SegmentedControl.Item value="24h">24小时</SegmentedControl.Item>
              <SegmentedControl.Item value="3d">3天</SegmentedControl.Item>
            </SegmentedControl.Root>
            <SegmentedControl.Root
              size="1"
              value={pingTooltipStyle}
              onValueChange={(val) => handlePingTooltipStyleChange(val as 'capsule' | 'full')}
            >
              <SegmentedControl.Item value="capsule" title="智能微胶囊：顶部悬浮，彻底不遮挡折线波形">单线胶囊</SegmentedControl.Item>
              <SegmentedControl.Item value="full" title="全网清单：展示全部地区完整对比列表">全网清单</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>
          <Flex align="center" gap="3" wrap="wrap">
            {activePingTaskId !== 'all' && (
              <Button
                size="1"
                variant="soft"
                color="gray"
                onClick={() => {
                  setActivePingTaskId('all');
                  setActiveCarrier('all');
                }}
                style={{ cursor: 'pointer', fontSize: '11px', height: '24px', padding: '0 8px' }}
              >
                ✕ 恢复全网对比
              </Button>
            )}
            {hasCustomPingOrder && (
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={handleResetPingOrder}
                title="已应用自定义长按拖拽排序，点击恢复默认排序"
                style={{ cursor: 'pointer', fontSize: '11px', height: '24px', padding: '0 6px' }}
              >
                <RotateCcw size={12} style={{ marginRight: 3 }} /> 恢复默认排序
              </Button>
            )}
            {pingSeries.length > 0 && (
              <Text size="1" color="gray">
                {pingSeriesWithRecords.length} / {pingSeries.length} 个任务有记录
              </Text>
            )}
          </Flex>
        </Flex>

        {pingLoading ? (
          <Loading />
        ) : pingError ? (
          <Text size="2" color="red" align="center" style={{ display: 'block', padding: '20px' }}>
            {pingError}
          </Text>
        ) : pingSeries.length === 0 ? (
          <Text size="2" color="gray" align="center" style={{ display: 'block', padding: '20px' }}>
            暂无 Ping 任务
          </Text>
        ) : pingSeriesWithRecords.length === 0 ? (
          <Text size="2" color="gray" align="center" style={{ display: 'block', padding: '20px' }}>
            暂无该节点的 Ping 记录
          </Text>
        ) : pingChartRows.length === 0 ? (
          <Text size="2" color="gray" align="center" style={{ display: 'block', padding: '20px' }}>
            暂无该时间段的 Ping 记录
          </Text>
        ) : (
          <>
            <div className="instance-ping-main-layout">
              <div className="instance-ping-chart-pane">
                <ResponsiveContainer width="100%" height={pingChartHeight}>
                  <LineChart
                    data={pingChartRows}
                    margin={monitorChartMargin}
                    onMouseMove={handlePingChartMouseMove}
                    onMouseLeave={() => setHoveredPingKey(null)}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={pingXAxisDomain}
                      tickFormatter={pingChartTimeFormatter}
                      fontSize={12}
                      minTickGap={28}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      {...pingYAxisProps}
                      domain={pingYAxisDomain}
                      allowDecimals={false}
                      tick={<PingYAxisTick />}
                    />
                    <Tooltip
                      wrapperStyle={{ pointerEvents: pingTooltipStyle === 'capsule' ? 'none' : 'auto', zIndex: 100 }}
                      position={pingTooltipStyle === 'capsule' || activePingTaskId !== 'all' ? { y: 2 } : undefined}
                      content={
                        <CustomPingTooltip
                          orderedSeries={orderedPingSeries}
                          timeFormatter={pingChartTimeFormatter}
                          hoveredKey={hoveredPingKey}
                          activeTaskId={activePingTaskId}
                          tooltipStyle={pingTooltipStyle}
                          onHoverKey={setHoveredPingKey}
                          onSelectTaskId={(id) => setActivePingTaskId(id)}
                        />
                      }
                    />
                    {orderedPingSeries.map((item) => {
                      const isVisible = activePingTaskId === 'all' || activePingTaskId === item.task.id;
                      if (!isVisible) return null;

                      const carrier = matchTaskCarrier(item.task.label, item.task.target);
                      const isCarrierMatched =
                        pingFilterCarrier === 'all' ||
                        (pingFilterCarrier === 'loss'
                          ? (() => {
                              const q = getPingSeriesQuality(item.records);
                              return q.packetLossPercent > 0 || q.lostPackets > 0;
                            })()
                          : carrier === pingFilterCarrier);

                      const isSingleFocused = activePingTaskId === item.task.id;
                      const isHovered = hoveredPingKey === item.task.key;

                      let strokeOpacity = 1;
                      let strokeWidth = 1.6;

                      if (hoveredPingKey !== null) {
                        strokeOpacity = isHovered ? 1 : 0.15;
                        strokeWidth = isHovered ? 3.0 : 1.2;
                      } else if (isSingleFocused) {
                        strokeOpacity = 1;
                        strokeWidth = 2.6;
                      } else if (pingFilterCarrier !== 'all') {
                        strokeOpacity = isCarrierMatched ? 1 : 0.12;
                        strokeWidth = isCarrierMatched ? 2.2 : 1.2;
                      }

                      return (
                        <Line
                          key={item.task.key}
                          type="linear"
                          dataKey={item.task.key}
                          name={item.task.label}
                          stroke={item.task.color}
                          strokeWidth={strokeWidth}
                          strokeOpacity={strokeOpacity}
                          dot={false}
                          activeDot={
                            isSingleFocused || isHovered
                              ? { r: 4.5, strokeWidth: 1.5, stroke: '#fff' }
                              : false
                          }
                          connectNulls={true}
                          isAnimationActive={false}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setActivePingTaskId(activePingTaskId === item.task.id ? 'all' : item.task.id)}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>

                <PingHeartbeatBar
                  series={orderedPingSeries}
                  activeTaskId={activePingTaskId}
                  rangeHours={pingTimeRangeHours[pingTimeRange]}
                />
              </div>

              <div className="instance-ping-cards-pane">
                {/* 顶层微晶药丸分类控制条 */}
                <div className="instance-ping-filter-bar">
                  <div className="instance-ping-filter-pills">
                    <button
                      type="button"
                      className={`instance-ping-pill-btn${pingFilterCarrier === 'all' ? ' is-active' : ''}`}
                      onClick={() => handleFilterCarrierChange('all')}
                    >
                      全部骨干 <span className="instance-ping-pill-num">{carrierCounts.all}</span>
                    </button>
                    {carrierCounts.ct > 0 && (
                      <button
                        type="button"
                        className={`instance-ping-pill-btn is-ct${pingFilterCarrier === 'ct' ? ' is-active' : ''}`}
                        onClick={() => handleFilterCarrierChange('ct')}
                      >
                        <span className="carrier-dot ct" /> 中国电信
                        <span className="instance-ping-pill-num">{carrierCounts.ct}</span>
                      </button>
                    )}
                    {carrierCounts.cu > 0 && (
                      <button
                        type="button"
                        className={`instance-ping-pill-btn is-cu${pingFilterCarrier === 'cu' ? ' is-active' : ''}`}
                        onClick={() => handleFilterCarrierChange('cu')}
                      >
                        <span className="carrier-dot cu" /> 中国联通
                        <span className="instance-ping-pill-num">{carrierCounts.cu}</span>
                      </button>
                    )}
                    {carrierCounts.cm > 0 && (
                      <button
                        type="button"
                        className={`instance-ping-pill-btn is-cm${pingFilterCarrier === 'cm' ? ' is-active' : ''}`}
                        onClick={() => handleFilterCarrierChange('cm')}
                      >
                        <span className="carrier-dot cm" /> 中国移动
                        <span className="instance-ping-pill-num">{carrierCounts.cm}</span>
                      </button>
                    )}
                    {carrierCounts.intl > 0 && (
                      <button
                        type="button"
                        className={`instance-ping-pill-btn is-intl${pingFilterCarrier === 'intl' ? ' is-active' : ''}`}
                        onClick={() => handleFilterCarrierChange('intl')}
                      >
                        <span className="carrier-dot intl" /> 国际/海外
                        <span className="instance-ping-pill-num">{carrierCounts.intl}</span>
                      </button>
                    )}
                    {carrierCounts.loss > 0 && (
                      <button
                        type="button"
                        className={`instance-ping-pill-btn is-loss${pingFilterCarrier === 'loss' ? ' is-active' : ''}`}
                        onClick={() => handleFilterCarrierChange('loss')}
                      >
                        <span className="carrier-dot loss" /> 异常丢包
                        <span className="instance-ping-pill-num is-loss">{carrierCounts.loss}</span>
                      </button>
                    )}
                  </div>

                  <div className="instance-ping-filter-actions">
                    {activePingTaskId !== 'all' && (
                      <button
                        type="button"
                        className="instance-ping-action-btn is-clear"
                        onClick={() => setActivePingTaskId('all')}
                        title="取消聚焦，查看多线对比"
                      >
                        ✕ 取消单线聚焦
                      </button>
                    )}
                    {pingFilterCarrier !== 'all' && (
                      <button
                        type="button"
                        className="instance-ping-action-btn"
                        onClick={() => handleFilterCarrierChange('all')}
                        title="恢复全部运营商"
                      >
                        重置分类
                      </button>
                    )}
                  </div>
                </div>

                <DndContext
                  sensors={pingSensors}
                  collisionDetection={closestCenter}
                  onDragStart={handlePingDragStart}
                  onDragEnd={handlePingDragEnd}
                  onDragCancel={handlePingDragCancel}
                >
                  <SortableContext items={displaySortableTaskIds} strategy={rectSortingStrategy}>
                    <div className="instance-ping-series-grid">
                      {displayPingSeries.map((item) => {
                        const isFocused = activePingTaskId === item.task.id;
                        const isDimmed = activePingTaskId !== 'all' && !isFocused;

                        return (
                          <SortablePingCard
                            key={item.task.key}
                            item={item}
                            isFocused={isFocused}
                            isDimmed={isDimmed}
                            isHovered={hoveredPingKey === item.task.key}
                            canSort={isAuthenticated && pingFilterCarrier === 'all'}
                            onMouseEnter={() => setHoveredPingKey(item.task.key)}
                            onMouseLeave={() => setHoveredPingKey(null)}
                            onFocusToggle={() => {
                              if (isDraggingPingRef.current) return;
                              setActivePingTaskId(activePingTaskId === item.task.id ? 'all' : item.task.id);
                            }}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          </>
        )}
      </Card>
      </div>
      )}

      {/* 模块 D：容器运行与运维态势 */}
      {showOps && (
        <div id="sec-ops">
          {/* Top 5 进程 与 AI/流媒体原生解锁矩阵 双列 Bento Box 并排 */}
          {((latest?.top_processes && latest.top_processes.length > 0) ||
            (latest?.unlock_items && latest.unlock_items.length > 0)) && (
            <div className="instance-ops-bento-grid">
              {aggregatedProcesses.length > 0 && (
                <Card className="instance-top-processes-card">
                  <Flex justify="between" align="center" mb="3" wrap="wrap" gap="2" style={{ minWidth: 0, width: '100%' }}>
                    <Flex align="center" gap="2" wrap="wrap" style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <Cpu size={18} color="var(--accent-9)" style={{ flexShrink: 0 }} />
                      <Heading size="3" weight="bold" style={{ wordBreak: 'break-word' }}>活跃负载进程 (Top 5)</Heading>
                      <Badge size="1" color="green" variant="soft" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>仅管理员可见</Badge>
                    </Flex>
                    <Text size="1" color="gray" style={{ whiteSpace: 'nowrap' }}>
                      同名进程智能聚合 · 实时动态采样
                    </Text>
                  </Flex>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, minWidth: 0, width: '100%' }}>
                    {aggregatedProcesses.map((proc) => {
                      const cpuPercent = Math.min(proc.cpu, 100);
                      const ramPercent = Math.min(proc.ram, 100);
                      const cpuColor = proc.cpu > 50 ? 'var(--red-9)' : proc.cpu > 20 ? 'var(--amber-9)' : 'var(--accent-9)';
                      return (
                        <div key={proc.pid} className="instance-process-tile">
                          <Flex justify="between" align="center" mb="2" gap="2" style={{ minWidth: 0 }}>
                            <Flex align="center" gap="1" style={{ flex: 1, minWidth: 0 }}>
                              <Text
                                size="2"
                                weight="bold"
                                style={{
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                }}
                                title={proc.name}
                              >
                                {proc.name}
                              </Text>
                              {proc.count > 1 && (
                                <span
                                  style={{
                                    flexShrink: 0,
                                    fontSize: 10,
                                    padding: '0 4px',
                                    borderRadius: 4,
                                    background: 'var(--accent-a3)',
                                    color: 'var(--accent-11)',
                                    fontWeight: 600,
                                  }}
                                  title={`包含 ${proc.count} 个聚合进程实例`}
                                >
                                  ×{proc.count}
                                </span>
                              )}
                            </Flex>
                          </Flex>

                          {/* CPU Metric & Micro Bar */}
                          <div style={{ marginBottom: 6 }}>
                            <Flex justify="between" align="center" style={{ fontSize: 11 }}>
                              <Text size="1" color="gray">CPU 占用</Text>
                              <span style={{ fontWeight: 600, color: cpuColor, fontFamily: 'monospace' }}>
                                {proc.cpu.toFixed(1)}%
                              </span>
                            </Flex>
                            <div className="instance-metric-track">
                              <div
                                className="instance-metric-fill"
                                style={{ width: `${Math.max(cpuPercent, 2)}%`, background: cpuColor }}
                              />
                            </div>
                          </div>

                          {/* RAM Metric & Micro Bar */}
                          <div>
                            <Flex justify="between" align="center" style={{ fontSize: 11 }}>
                              <Text size="1" color="gray">内存占比</Text>
                              <span style={{ fontWeight: 600, color: 'var(--blue-9)', fontFamily: 'monospace' }}>
                                {proc.ram.toFixed(1)}%
                              </span>
                            </Flex>
                            <div className="instance-metric-track">
                              <div
                                className="instance-metric-fill"
                                style={{ width: `${Math.max(ramPercent, 2)}%`, background: 'var(--blue-9)' }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {latest?.unlock_items && latest.unlock_items.length > 0 && (
                <UnlockMatrix items={latest.unlock_items} />
              )}
            </div>
          )}

          {!hasOpsData && (
            <Card mb="4" className="instance-ops-empty-card" style={{ textAlign: 'center', padding: '48px 20px', borderRadius: 16 }}>
              <Flex direction="column" align="center" gap="2">
                <Boxes size={32} color="var(--gray-8)" style={{ opacity: 0.6 }} />
                <Text size="2" weight="bold" color="gray">
                  {isAuthenticated ? '该节点暂未上报活跃负载进程或流媒体解锁数据' : '该节点暂未上报流媒体解锁数据'}
                </Text>
                <Text size="1" color="gray" style={{ opacity: 0.8, maxWidth: 460 }}>
                  {isAuthenticated ? '系统每 15 秒动态采样 Top 5 负载进程（仅管理端呈现），每 30 分钟刷新一次流媒体与 AI 原生解锁矩阵。' : '系统每 30 分钟自动刷新一次该节点的流媒体与 AI 原生网络解锁矩阵。'}
                </Text>
              </Flex>
            </Card>
          )}
        </div>
      )}

        </section>
      </div>

      {showBackToTop && (
        <button
          type="button"
          className="instance-back-to-top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="返回顶部"
          aria-label="返回顶部"
        >
          <ArrowUp size={20} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

function InstanceNodeSidebar({
  groups,
  activeUuid,
  onlineSet,
  liveData,
  onSelect,
}: {
  groups: Array<{ group: string; nodes: ClientInfo[] }>;
  activeUuid: string;
  onlineSet: Set<string>;
  liveData: Record<string, Partial<PublicMonitorRecord>>;
  onSelect: (uuid: string) => void;
}) {
  const total = groups.reduce((sum, group) => sum + group.nodes.length, 0);

  return (
    <aside className="instance-node-sidebar" aria-label="节点列表">
      <Card className="instance-node-sidebar-card">
        <Flex direction="column" style={{ height: '100%', minHeight: 0 }}>
          <Flex justify="between" align="center" className="instance-sidebar-header">
            <Box>
              <Text size="2" weight="bold" style={{ display: 'block' }}>节点列表</Text>
              <Text size="1" color="gray">{onlineSet.size} / {total} 在线</Text>
            </Box>
          </Flex>

          <Box className="instance-sidebar-scroll">
            {groups.map((group) => (
              <Box key={group.group}>
                <div className="instance-sidebar-group">
                  {group.group} ({group.nodes.length})
                </div>
                {group.nodes.map((node) => {
                  const isActive = node.uuid === activeUuid;
                  const isOnline = onlineSet.has(node.uuid);
                  const live = liveData[node.uuid];

                  return (
                    <button
                      key={node.uuid}
                      type="button"
                      className={`instance-sidebar-node${isActive ? ' is-active' : ''}`}
                      onClick={() => onSelect(node.uuid)}
                      title={node.name}
                    >
                      <span
                        className={`instance-sidebar-status${isOnline ? ' is-online' : ' is-offline'}`}
                        aria-hidden="true"
                      />
                      <Flag region={node.region} size={16} />
                      <span className="instance-sidebar-node-main">
                        <span className="instance-sidebar-node-name">{node.name}</span>
                        <span className="instance-sidebar-node-meta">
                          {isOnline ? `CPU ${(live?.cpu ?? 0).toFixed(0)}%` : '离线'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Flex>
      </Card>
    </aside>
  );
}
