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
      className="mini-ping-chart"
      style={{
        width: contentWidth,
        maxWidth: fillContainer ? 'none' : 'calc(100vw - 32px)',
        padding: 8,
      }}
    >
      <Flex
        align="center"
        justify="between"
        style={{
          minHeight: 22,
          marginBottom: 6,
          padding: '0 4px',
        }}
      >
        <Text size="1" weight="bold" color="gray" style={{ fontSize: 11 }}>
          {activeTaskId === 'all' ? (
            '全网多线延迟走势'
          ) : (
            <Flex align="center" gap="1">
              <span>已聚焦线路：</span>
              <span style={{ color: activeSeries[0]?.task.color, fontWeight: 700 }}>
                {activeSeries[0]?.task.label}
              </span>
            </Flex>
          )}
        </Text>
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
          <Text size="1" color="gray" style={{ fontSize: 10, opacity: 0.75 }}>
            点击下方线路卡片可单独聚焦
          </Text>
        )}
      </Flex>

      <Box style={{ width: '100%', height: typeof height === 'number' ? Math.max(150, height - 28) : height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.25} />
            <XAxis
              dataKey="time"
              type="number"
              domain={xAxisDomain}
              tickFormatter={(value) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              fontSize={11}
              width={48}
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
                borderRadius: 9,
                color: 'var(--gray-12)',
                fontSize: 12,
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
                  strokeWidth={isFocused ? 3.5 : 2.5}
                  strokeOpacity={1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </Box>

      <Box className="mini-ping-chart-legend">
        {seriesWithRecords.map((item) => {
          const avg = getPingSeriesAverage(item.records);
          const isFocused = activeTaskId === item.task.id;
          const isDimmed = activeTaskId !== 'all' && !isFocused;
          return (
            <Box
              key={item.task.key}
              className={`mini-ping-chart-legend-item${isFocused ? ' is-active' : ''}${isDimmed ? ' is-dimmed' : ''}`}
              style={{
                ['--item-color' as string]: item.task.color,
              }}
              onClick={() => setActiveTaskId(activeTaskId === item.task.id ? 'all' : item.task.id)}
              title={`点击${isFocused ? '取消聚焦' : '聚焦查看'}此线路走势\n${item.task.type} ${item.task.target}`}
            >
              <Flex align="center" justify="between" gap="1">
                <Flex align="center" gap="1" style={{ minWidth: 0, flex: 1 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      background: item.task.color,
                      flexShrink: 0,
                    }}
                  />
                  <Text size="1" weight="bold" truncate className="mini-ping-chart-legend-name" style={{ color: item.task.color }}>
                    {item.task.label}
                  </Text>
                </Flex>
                {isFocused && (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: item.task.color,
                      color: '#fff',
                      lineHeight: 1.1,
                      flexShrink: 0,
                    }}
                  >
                    聚焦
                  </span>
                )}
              </Flex>
              <Text size="1" color="gray" className="mini-ping-chart-legend-stat">
                {avg === null ? '全部超时' : `平均 ${formatPingMs(avg)}`}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
