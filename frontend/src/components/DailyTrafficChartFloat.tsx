import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Flex, Popover, SegmentedControl, Text } from '@radix-ui/themes';
import { Popover as PopoverPrimitive } from 'radix-ui';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { publicFetch } from '../utils/api';
import { normalizeDailyTrafficResponse, type DailyTrafficRow } from '../utils/dailyTraffic';
import { formatBytes } from '../utils/format';

type TrafficRangeDays = 7 | 30;

interface DailyTrafficChartFloatProps {
  uuid: string;
  clientName: string;
  trigger: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  includeHidden?: boolean;
}

export default function DailyTrafficChartFloat({
  uuid,
  clientName,
  trigger,
  includeHidden = false,
}: DailyTrafficChartFloatProps) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<TrafficRangeDays>(7);
  const [rows, setRows] = useState<DailyTrafficRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const suffix = includeHidden ? '&include_hidden=1' : '';
        const payload = await publicFetch(`/traffic/daily?days=${days}${suffix}`);
        const normalized = normalizeDailyTrafficResponse(payload);
        if (!normalized) throw new Error('Invalid daily traffic response');
        if (!cancelled) {
          setRows(normalized.data
            .filter((row) => row.client === uuid)
            .sort((a, b) => a.day.localeCompare(b.day)));
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    void load(true);
    const timer = window.setInterval(() => void load(false), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [days, includeHidden, open, uuid]);

  const chartData = useMemo(() => rows.map((row) => ({
    ...row,
    label: row.day.slice(5).replace('-', '/'),
  })), [rows]);
  const today = rows[rows.length - 1];

  const handleTriggerClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    trigger.props.onClick?.(event);
  }, [trigger]);

  const handleTriggerPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    trigger.props.onPointerDown?.(event);
    event.stopPropagation();
  }, [trigger]);

  const triggerElement = React.cloneElement(trigger, {
    onClick: handleTriggerClick,
    onPointerDown: handleTriggerPointerDown,
  });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        {triggerElement}
      </PopoverPrimitive.Trigger>
      <Popover.Content
        align="end"
        sideOffset={8}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 540,
          maxWidth: 'calc(100vw - 20px)',
          padding: 12,
          border: '1px solid var(--monitor-border)',
          borderRadius: 8,
          background: 'var(--color-panel-solid)',
          boxShadow: 'hsl(206 22% 7% / 35%) 0 10px 38px -10px, hsl(206 22% 7% / 20%) 0 10px 20px -15px',
          zIndex: 5,
        }}
      >
        <Flex justify="between" align="center" gap="3" mb="2">
          <Box style={{ minWidth: 0 }}>
            <Text weight="bold" size="2" as="p" truncate>{clientName} · 每日流量</Text>
            <Text size="1" color="gray" as="p">
              北京时间 · 今日 ↑ {today ? formatBytes(today.up) : '-'} ↓ {today ? formatBytes(today.down) : '-'}
            </Text>
          </Box>
          <SegmentedControl.Root
            size="1"
            value={String(days)}
            onValueChange={(value) => setDays(value === '30' ? 30 : 7)}
          >
            <SegmentedControl.Item value="7">7天</SegmentedControl.Item>
            <SegmentedControl.Item value="30">30天</SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>

        <Box style={{ width: '100%', height: 250 }}>
          {loading ? (
            <Flex align="center" justify="center" style={{ height: '100%' }}>
              <Text size="2" color="gray">加载中</Text>
            </Flex>
          ) : error ? (
            <Flex align="center" justify="center" style={{ height: '100%' }}>
              <Text size="2" color="red">每日流量暂不可用</Text>
            </Flex>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.25} />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  minTickGap={days === 30 ? 18 : 8}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  width={58}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatBytes(Number(value))}
                />
                <Tooltip
                  labelFormatter={(label) => `${String(label)} 北京时间`}
                  formatter={(value: number, name) => [formatBytes(Number(value)), name]}
                  contentStyle={{
                    border: '1px solid var(--gray-5)',
                    borderRadius: 8,
                    background: 'var(--color-panel-solid)',
                    color: 'var(--gray-12)',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="up" name="上传" fill="var(--blue-9)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="down" name="下载" fill="var(--green-9)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Box>
      </Popover.Content>
    </Popover.Root>
  );
}
