import { useEffect, useMemo, useState } from 'react';
import { Box, Flex, Text } from '@radix-ui/themes';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildPingChartRows,
  fetchPingTaskSeries,
  formatPingMs,
  getPingSeriesAverage,
  getPingSeriesWithRecords,
  getPingTimeDomain,
  getPingYAxisDomain,
  PingTaskSeries,
} from '../utils/pingChart';
import PingYAxisTick from './PingYAxisTick';

interface MiniPingChartProps {
  uuid: string;
  width?: string | number;
  height?: number;
  limit?: number;
  rangeHours?: number;
  fillContainer?: boolean;
  includeHidden?: boolean;
}

export default function MiniPingChart({
  uuid,
  width = 420,
  height = 220,
  limit = 360,
  rangeHours = 1,
  fillContainer = false,
  includeHidden = false,
}: MiniPingChartProps) {
  const [series, setSeries] = useState<PingTaskSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | 'all'>('all');

  useEffect(() => {
    setActiveTaskId('all');
  }, [uuid]);

  useEffect(() => {
    if (!uuid) return;

    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const nextSeries = await fetchPingTaskSeries(uuid, {
          limit,
          maxTasks: 8,
          rangeHours,
          includeHidden,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setSeries(nextSeries);
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(err?.message || '加载 Ping 数据失败');
          setSeries([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadData();
    return () => controller.abort();
  }, [includeHidden, limit, rangeHours, uuid]);

  const seriesWithRecords = useMemo(
    () => getPingSeriesWithRecords(series),
    [series],
  );

  const activeSeries = useMemo(() => {
    if (activeTaskId === 'all') return seriesWithRecords;
    const filtered = seriesWithRecords.filter((item) => item.task.id === activeTaskId);
    return filtered.length > 0 ? filtered : seriesWithRecords;
  }, [seriesWithRecords, activeTaskId]);

  const chartRows = useMemo(() => buildPingChartRows(activeSeries), [activeSeries]);
  const yAxisDomain = useMemo(() => getPingYAxisDomain(activeSeries), [activeSeries]);
  const xAxisDomain = useMemo(
    () => getPingTimeDomain(activeSeries, rangeHours),
    [rangeHours, activeSeries],
  );

  const contentWidth = typeof width === 'number' ? `${width}px` : width;

  if (loading) {
    return (
      <Flex align="center" justify="center" style={{ width: contentWidth, height }}>
        <Text size="2" color="gray">加载 Ping 数据…</Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex align="center" justify="center" style={{ width: contentWidth, minHeight: 120, padding: 16 }}>
        <Text size="2" color="red">{error}</Text>
      </Flex>
    );
  }

  if (series.length === 0) {
    return (
      <Flex align="center" justify="center" style={{ width: contentWidth, minHeight: 120, padding: 16 }}>
        <Text size="2" color="gray">暂无 Ping 任务</Text>
      </Flex>
    );
  }

  if (chartRows.length === 0 || seriesWithRecords.length === 0) {
    return (
      <Flex direction="column" gap="2" style={{ width: contentWidth, minHeight: 120, padding: 14 }}>
        <Text size="2" weight="bold">Ping 延迟</Text>
        <Text size="2" color="gray">暂无该节点的 Ping 记录</Text>
      </Flex>
    );
  }

  return (
    <Box
      className={`mini-ping-chart${fillContainer ? ' is-embedded' : ''}`}
      style={{
        width: contentWidth,
        maxWidth: fillContainer ? 'none' : 'calc(100vw - 32px)',
      }}
    >
      {/* 1. 精工仪表盘 Header 栏 */}
      <Flex
        align="center"
        justify="between"
        className="mini-ping-header"
      >
        <Flex align="center" gap="2" style={{ minWidth: 0, flex: 1 }}>
          <span className="mini-ping-live-pulse" />
          <Text size="2" weight="bold" className="mini-ping-title" truncate>
            {activeTaskId === 'all' ? (
              '全网多线延迟走势'
            ) : (
              <Flex align="center" gap="1" style={{ minWidth: 0 }}>
                <span style={{ opacity: 0.75, fontWeight: 500 }}>聚焦线路:</span>
                <span style={{ color: activeSeries[0]?.task.color, fontWeight: 700 }} title={activeSeries[0]?.task.label}>
                  {activeSeries[0]?.task.label}
                </span>
              </Flex>
            )}
          </Text>
          <span className="mini-ping-badge-count">
            {seriesWithRecords.length} 线路
          </span>
        </Flex>

        {activeTaskId !== 'all' ? (
          <button
            type="button"
            onClick={() => setActiveTaskId('all')}
            className="mini-ping-reset-btn"
            title="恢复显示所有线路"
          >
            ✕ 恢复全部
          </button>
        ) : (
          <Text size="1" color="gray" className="mini-ping-hint">
            点击下方线路聚焦
          </Text>
        )}
      </Flex>

      {/* 2. 独立纯净画布视窗区 */}
      <Box className="mini-ping-chart-viewport" style={{ width: '100%', height: typeof height === 'number' ? Math.max(150, height - 32) : height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} stroke="var(--mini-ping-grid-stroke, rgba(0, 0, 0, 0.08))" />
            <XAxis
              dataKey="time"
              type="number"
              domain={xAxisDomain}
              tickFormatter={(value) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tick={{ fill: 'var(--mini-ping-axis-fill, #64748b)' }}
            />
            <YAxis
              fontSize={10}
              width={46}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              domain={yAxisDomain}
              tick={<PingYAxisTick />}
            />
            <Tooltip
              labelFormatter={(value) => new Date(value as number).toLocaleString('zh-CN')}
              formatter={(value: number, name) => [
                formatPingMs(value),
                name,
              ]}
              contentStyle={{
                borderRadius: 10,
                border: '1px solid var(--mini-ping-tooltip-border, rgba(0, 0, 0, 0.12))',
                background: 'var(--mini-ping-tooltip-bg, rgba(255, 255, 255, 0.98))',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
                color: 'var(--gray-12)',
                fontSize: 12,
                padding: '8px 12px',
              }}
            />
            {seriesWithRecords.map((item) => {
              const isVisible = activeTaskId === 'all' || activeTaskId === item.task.id;
              if (!isVisible) return null;
              const isFocused = activeTaskId === item.task.id;
              return (
                <Line
                  key={item.task.key}
                  type="monotone"
                  dataKey={item.task.key}
                  name={item.task.label}
                  stroke={item.task.color}
                  strokeWidth={isFocused ? 3 : 2}
                  strokeOpacity={isFocused ? 1 : (activeTaskId === 'all' ? 0.92 : 0.2)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 1.5, stroke: '#fff' }}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </Box>

      {/* 3. 苹果精工微晶胶囊图例网格 */}
      <Box className="mini-ping-chart-legend">
        {seriesWithRecords.map((item) => {
          const avg = getPingSeriesAverage(item.records);
          const isFocused = activeTaskId === item.task.id;
          const isDimmed = activeTaskId !== 'all' && !isFocused;

          // 根据真实延迟数值智能匹配色阶
          let latencyColor = 'var(--gray-10)';
          if (avg !== null) {
            if (avg <= 120) latencyColor = '#10b981'; // 极优：翠绿
            else if (avg <= 240) latencyColor = '#0ea5e9'; // 良好：天蓝
            else if (avg <= 350) latencyColor = '#f59e0b'; // 普通：琥珀金
            else latencyColor = '#ef4444'; // 较高：警示红
          }

          return (
            <div
              key={item.task.key}
              className={`mini-ping-chart-legend-item${isFocused ? ' is-active' : ''}${isDimmed ? ' is-dimmed' : ''}`}
              style={{
                ['--item-color' as string]: item.task.color,
              }}
              onClick={() => setActiveTaskId(activeTaskId === item.task.id ? 'all' : item.task.id)}
              title={`点击${isFocused ? '取消聚焦' : '聚焦查看'}此线路走势\n${item.task.type} ${item.task.target}`}
            >
              <div className="mini-ping-item-header">
                <span
                  className="mini-ping-dot"
                  style={{
                    backgroundColor: item.task.color,
                    boxShadow: `0 0 6px ${item.task.color}80`,
                  }}
                />
                <span className="mini-ping-item-name" title={item.task.label}>
                  {item.task.label}
                </span>
                {isFocused && (
                  <span className="mini-ping-focus-tag">
                    聚焦
                  </span>
                )}
              </div>
              <div className="mini-ping-item-value">
                <span className="mini-ping-latency-num" style={{ color: latencyColor }}>
                  {avg === null ? '超时' : `${Math.round(avg)}`}
                </span>
                {avg !== null && <span className="mini-ping-latency-unit">ms</span>}
              </div>
            </div>
          );
        })}
      </Box>
    </Box>
  );
}
