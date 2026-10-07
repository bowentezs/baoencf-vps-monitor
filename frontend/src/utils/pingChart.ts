import { fetchWithBootstrapRetry } from './api.ts';

export interface PingTask {
  id: number | string;
  name?: string;
  type?: string;
  target?: string;
  clients?: string[] | string;
  all_clients?: boolean | number | string;
  interval?: number;
  interval_sec?: number;
}

export interface PingRecord {
  time: string;
  value: number;
  task_id?: number | string;
}

export interface NormalizedPingTask {
  id: number;
  key: string;
  label: string;
  target: string;
  type: string;
  intervalSec: number;
  color: string;
}

export interface PingTaskSeries {
  task: NormalizedPingTask;
  records: PingRecord[];
}

export type PingChartRow = {
  time: number;
  [key: string]: number | boolean | null;
};

export type PingLossLevel = 'good' | 'minor' | 'moderate' | 'severe';

export interface PingSeriesQuality {
  avgLatency: number | null;
  minLatency: number | null;
  maxLatency: number | null;
  medianLatency: number | null;
  totalPackets: number;
  lostPackets: number;
  successPackets: number;
  packetLossPercent: number;
  lossLevel: PingLossLevel;
  lossBadgeLabel: string;
}

export interface DailyPingTaskStat {
  taskId: number;
  taskKey: string;
  taskLabel: string;
  target: string;
  type: string;
  color: string;
  avgLatency: number | null;
  minLatency: number | null;
  maxLatency: number | null;
  medianLatency: number | null;
  packetLossPercent: number;
  lossLevel: PingLossLevel;
  lossBadgeLabel: string;
  totalPackets: number;
  lostPackets: number;
  successPackets: number;
}

export interface DailyPingSummary {
  date: string;
  displayDate: string;
  fullDisplayDate: string;
  isToday: boolean;
  timestamp: number;
  tasks: DailyPingTaskStat[];
}

const pingSeriesColors = [
  '#FF1744',
  '#00C853',
  '#2979FF',
  '#FF9100',
  '#D500F9',
  '#00B8D4',
  '#FFD600',
  '#651FFF',
  '#FF4081',
  '#64DD17',
];

const demoTaskColorOrder = [
  'Demo - Cloudflare ICMP',
  'Demo - IPv6 DNS',
  'Demo - HTTPS 443',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pingTaskFromRecord(record: Record<string, unknown>): PingTask {
  const clients = Array.isArray(record.clients)
    ? record.clients.filter((client): client is string => typeof client === 'string')
    : stringValue(record.clients);
  return {
    id: typeof record.id === 'number' || typeof record.id === 'string' ? record.id : '',
    name: stringValue(record.name),
    type: stringValue(record.type),
    target: stringValue(record.target),
    clients,
    all_clients: typeof record.all_clients === 'boolean' ||
      typeof record.all_clients === 'number' ||
      typeof record.all_clients === 'string'
      ? record.all_clients
      : undefined,
    interval: numberValue(record.interval),
    interval_sec: numberValue(record.interval_sec),
  };
}

function getTaskColor(task: PingTask, index: number) {
  const demoIndex = demoTaskColorOrder.findIndex((name) => name === task.name);
  const colorIndex = demoIndex >= 0 ? demoIndex : index + demoTaskColorOrder.length;
  return pingSeriesColors[colorIndex % pingSeriesColors.length];
}

function toClients(value: PingTask['clients']): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function isAllClients(value: PingTask['all_clients']) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function hasValidPingTaskId(task: PingTask) {
  const id = Number(task.id);
  return Number.isFinite(id) && id > 0;
}

export function pingTaskAppliesToClient(task: unknown, uuid: string) {
  const record = asRecord(task);
  if (!record) return false;
  const pingTask = pingTaskFromRecord(record);
  if (!hasValidPingTaskId(pingTask)) return false;
  const clients = toClients(pingTask.clients);
  return isAllClients(pingTask.all_clients) || clients.length === 0 || clients.includes(uuid);
}

export function normalizePingTask(task: unknown, index: number): NormalizedPingTask | null {
  const record = asRecord(task);
  if (!record) return null;
  const pingTask = pingTaskFromRecord(record);
  const id = Number(pingTask.id);
  if (!hasValidPingTaskId(pingTask)) return null;

  const target = (pingTask.target || pingTask.name || `Task ${id}`).trim();
  const type = (pingTask.type || 'ping').toUpperCase();
  const intervalSec = Number(pingTask.interval_sec || pingTask.interval || 60);

  return {
    id,
    key: `task_${id}`,
    label: (pingTask.name || target).trim(),
    target,
    type,
    intervalSec: Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : 60,
    color: getTaskColor(pingTask, index),
  };
}

export function normalizePingRecord(payload: unknown): PingRecord | null {
  const record = asRecord(payload);
  if (!record || typeof record.time !== 'string' || !Number.isFinite(new Date(record.time).getTime())) {
    return null;
  }
  if (typeof record.value !== 'number' || !Number.isFinite(record.value)) return null;
  const taskId = record.task_id;
  return {
    time: record.time,
    value: record.value,
    ...(typeof taskId === 'number' || typeof taskId === 'string' ? { task_id: taskId } : {}),
  };
}

export function normalizePingRecords(payload: unknown): PingRecord[] {
  const record = asRecord(payload);
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? record.data
      : [];
  return records.flatMap((item) => {
    const record = normalizePingRecord(item);
    return record ? [record] : [];
  });
}

function findAnchor(anchors: number[], timestamp: number, toleranceMs: number) {
  for (const anchor of anchors) {
    if (Math.abs(anchor - timestamp) <= toleranceMs) return anchor;
  }
  return null;
}

function niceStep(range: number): number {
  if (range <= 20) return 5;
  if (range <= 50) return 10;
  if (range <= 100) return 20;
  if (range <= 250) return 50;
  if (range <= 600) return 100;
  if (range <= 1500) return 200;
  return 500;
}

export function buildPingChartRows(series: PingTaskSeries[]) {
  const validIntervals = series
    .map((item) => item.task.intervalSec)
    .filter((value) => Number.isFinite(value) && value > 0);
  const minInterval = validIntervals.length ? Math.min(...validIntervals) : 60;
  // 容差适应任务采样周期，保证同一轮探测任务（时差数秒至30秒）聚合到同一时间行，最小15秒，最大60秒
  const toleranceMs = Math.max(15000, Math.min(60000, Math.floor(minInterval * 1000 * 0.45)));
  const anchors: number[] = [];
  const grouped: Record<number, PingChartRow> = {};

  for (const item of series) {
    for (const record of item.records) {
      const timestamp = new Date(record.time).getTime();
      if (!Number.isFinite(timestamp)) continue;

      const anchor = findAnchor(anchors, timestamp, toleranceMs);
      const useTimestamp = anchor ?? timestamp;
      if (!grouped[useTimestamp]) {
        grouped[useTimestamp] = { time: useTimestamp };
        if (anchor === null) anchors.push(useTimestamp);
      }
      const isLoss = record.value < 0;
      grouped[useTimestamp][item.task.key] = isLoss ? null : Number(record.value);
      grouped[useTimestamp][`${item.task.key}_loss`] = isLoss;
    }
  }

  return Object.values(grouped).sort((a, b) => Number(a.time) - Number(b.time));
}

function getLatestPingTimestamp(series: PingTaskSeries[]) {
  const timestamps = series.flatMap((item) =>
    item.records
      .map((record) => new Date(record.time).getTime())
      .filter((timestamp) => Number.isFinite(timestamp)),
  );
  return timestamps.length ? Math.max(...timestamps) : null;
}

export function limitPingSeriesToRecentRange(series: PingTaskSeries[], rangeHours?: number) {
  if (!rangeHours || rangeHours <= 0) return series;

  const latest = getLatestPingTimestamp(series);
  if (!latest) return series;

  const cutoff = latest - rangeHours * 3600000;
  return series.map((item) => ({
    ...item,
    records: item.records.filter((record) => {
      const timestamp = new Date(record.time).getTime();
      return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= latest;
    }),
  }));
}

export function getPingTimeDomain(series: PingTaskSeries[], rangeHours?: number): [number | string, number | string] {
  const latest = getLatestPingTimestamp(series);
  if (!latest || !rangeHours || rangeHours <= 0) return ['dataMin', 'dataMax'];
  return [latest - rangeHours * 3600000, latest];
}

export function getPingValues(series: PingTaskSeries[]) {
  return series.flatMap((item) =>
    item.records
      .map((record) => Number(record.value))
      .filter((value) => Number.isFinite(value) && value >= 0),
  );
}

export function getPingSeriesWithRecords(series: PingTaskSeries[]) {
  return series.filter((item) => item.records.length > 0);
}

export function getPingYAxisDomain(series: PingTaskSeries[]): [number, number] {
  const values = getPingValues(series);
  if (values.length === 0) return [0, 100];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const step = niceStep(range);

  let lower = min <= 50 ? 0 : Math.max(0, Math.floor((min - step * 0.8) / step) * step);
  let upper = Math.ceil((max + step * 0.6) / step) * step;

  if (upper - lower < step * 2) {
    upper = lower + step * 2;
  }

  return [lower, upper];
}

export function getPingSeriesAverage(records: PingRecord[]): number | null {
  const chronological = records
    .map((record) => Number(record.value))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (chronological.length === 0) return null;

  const sum = chronological.reduce((total, value) => total + value, 0);
  return sum / chronological.length;
}

export function formatPingMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return '-';
  return `${Math.round(numberValue)} ms`;
}

export async function fetchPingTaskSeries(
  uuid: string,
  {
    limit = 180,
    maxTasks = 8,
    rangeHours,
    cursor = new Date().toISOString(),
    includeHidden = false,
    signal,
  }: {
    limit?: number;
    maxTasks?: number;
    rangeHours?: number;
    cursor?: string;
    includeHidden?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<PingTaskSeries[]> {
  const hiddenQuery = includeHidden ? '&include_hidden=1' : '';
  const taskResponse = await fetchWithBootstrapRetry(`/api/task/ping?${hiddenQuery.slice(1)}`, { signal });
  if (!taskResponse.ok) throw new Error(`HTTP ${taskResponse.status}`);

  const taskData = await taskResponse.json();
  const applicableTasks = (Array.isArray(taskData) ? taskData : [])
    .filter((task) => pingTaskAppliesToClient(task, uuid))
    .map((task, index) => normalizePingTask(task, index))
    .filter((task): task is NormalizedPingTask => Boolean(task));
  const tasks = applicableTasks.slice(0, maxTasks);

  const requestLimitForTask = (task: NormalizedPingTask) => {
    if (rangeHours && rangeHours > 0) {
      const rangeLimit = Math.ceil((rangeHours * 3600) / task.intervalSec) + 4;
      return Math.min(1000, Math.max(8, rangeLimit));
    }
    return Math.min(1000, Math.max(1, limit));
  };

  if (tasks.length > 0) {
    const batchLimit = Math.max(...tasks.map(requestLimitForTask));
    const baseIntervalSec = Math.min(...tasks.map((task) => task.intervalSec));
    const taskSpecs = tasks
      .map((task) => `${task.id}:${requestLimitForTask(task)}:${task.intervalSec}`)
      .join(',');
    try {
      const recordsResponse = await fetch(
        `/api/records/ping/batch?uuid=${encodeURIComponent(uuid)}&task_specs=${encodeURIComponent(taskSpecs)}&base_interval=${baseIntervalSec}&limit=${batchLimit}&cursor=${encodeURIComponent(cursor)}${hiddenQuery}`,
        { signal },
      );
      if (recordsResponse.ok) {
        const recordsByTask = await recordsResponse.json();
        const series = tasks.map((task) => ({
          task,
          records: normalizePingRecords(asRecord(recordsByTask)?.[String(task.id)]),
        }));
        return limitPingSeriesToRecentRange(series, rangeHours);
      }
    } catch {
      // Fall back to the legacy per-task endpoint below.
    }
  }

  const series = await Promise.all(
    tasks.map(async (task) => {
      try {
        const requestLimit = requestLimitForTask(task);
        const recordsResponse = await fetch(
          `/api/records/ping?uuid=${encodeURIComponent(uuid)}&task_id=${task.id}&limit=${requestLimit}&cursor=${encodeURIComponent(cursor)}${hiddenQuery}`,
          { signal },
        );
        if (!recordsResponse.ok) return { task, records: [] };
        const records = await recordsResponse.json();
        return {
          task,
          records: normalizePingRecords(records),
        };
      } catch {
        return { task, records: [] };
      }
    }),
  );

  return limitPingSeriesToRecentRange(series, rangeHours);
}

export function getLossLevelInfo(lossPercent: number, totalPackets: number): {
  level: PingLossLevel;
  badgeLabel: string;
} {
  if (totalPackets === 0) {
    return { level: 'good', badgeLabel: '无记录' };
  }
  if (lossPercent <= 0) {
    return { level: 'good', badgeLabel: '优 0%' };
  }
  if (lossPercent <= 5) {
    return { level: 'minor', badgeLabel: `轻微 ${lossPercent}%` };
  }
  if (lossPercent <= 20) {
    return { level: 'moderate', badgeLabel: `中度 ${lossPercent}%` };
  }
  return { level: 'severe', badgeLabel: `严重 ${lossPercent}%` };
}

export function getPingSeriesQuality(records: PingRecord[]): PingSeriesQuality {
  let validSum = 0;
  let validCount = 0;
  let lostCount = 0;
  let min: number | null = null;
  let max: number | null = null;
  const validLatencies: number[] = [];

  for (const record of records) {
    const val = Number(record.value);
    if (!Number.isFinite(val)) continue;
    if (val < 0) {
      lostCount++;
    } else {
      validCount++;
      validSum += val;
      validLatencies.push(val);
      if (min === null || val < min) min = val;
      if (max === null || val > max) max = val;
    }
  }

  const totalPackets = validCount + lostCount;
  const packetLossPercent = totalPackets > 0 ? Number(((lostCount / totalPackets) * 100).toFixed(1)) : 0;
  const avgLatency = validCount > 0 ? Math.round(validSum / validCount) : null;

  let medianLatency: number | null = null;
  if (validLatencies.length > 0) {
    validLatencies.sort((a, b) => a - b);
    const mid = Math.floor(validLatencies.length / 2);
    medianLatency = validLatencies.length % 2 !== 0
      ? Math.round(validLatencies[mid])
      : Math.round((validLatencies[mid - 1] + validLatencies[mid]) / 2);
  }

  const { level: lossLevel, badgeLabel: lossBadgeLabel } = getLossLevelInfo(packetLossPercent, totalPackets);

  return {
    avgLatency,
    minLatency: min !== null ? Math.round(min) : null,
    maxLatency: max !== null ? Math.round(max) : null,
    medianLatency,
    totalPackets,
    lostPackets: lostCount,
    successPackets: validCount,
    packetLossPercent,
    lossLevel,
    lossBadgeLabel,
  };
}

export function buildDailyPingSummary(series: PingTaskSeries[]): DailyPingSummary[] {
  const dayTaskMap = new Map<string, Map<number, {
    records: PingRecord[];
    task: NormalizedPingTask;
  }>>();

  const todayStr = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  for (const item of series) {
    for (const record of item.records) {
      const d = new Date(record.time);
      if (!Number.isFinite(d.getTime())) continue;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${day}`;

      let taskMap = dayTaskMap.get(dateKey);
      if (!taskMap) {
        taskMap = new Map();
        dayTaskMap.set(dateKey, taskMap);
      }

      let taskData = taskMap.get(item.task.id);
      if (!taskData) {
        taskData = { records: [], task: item.task };
        taskMap.set(item.task.id, taskData);
      }
      taskData.records.push(record);
    }
  }

  const summaries: DailyPingSummary[] = [];

  for (const [dateKey, taskMap] of dayTaskMap.entries()) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d).getTime();
    const isToday = dateKey === todayStr;

    const taskStats: DailyPingTaskStat[] = [];
    for (const item of series) {
      const taskData = taskMap.get(item.task.id);
      const records = taskData?.records || [];
      const quality = getPingSeriesQuality(records);

      taskStats.push({
        taskId: item.task.id,
        taskKey: item.task.key,
        taskLabel: item.task.label,
        target: item.task.target,
        type: item.task.type,
        color: item.task.color,
        avgLatency: quality.avgLatency,
        minLatency: quality.minLatency,
        maxLatency: quality.maxLatency,
        medianLatency: quality.medianLatency,
        packetLossPercent: quality.packetLossPercent,
        lossLevel: quality.lossLevel,
        lossBadgeLabel: quality.lossBadgeLabel,
        totalPackets: quality.totalPackets,
        lostPackets: quality.lostPackets,
        successPackets: quality.successPackets,
      });
    }

    summaries.push({
      date: dateKey,
      displayDate: `${m}/${String(d).padStart(2, '0')}`,
      fullDisplayDate: `${m}月${d}日`,
      isToday,
      timestamp: dayStart,
      tasks: taskStats,
    });
  }

  return summaries.sort((a, b) => a.timestamp - b.timestamp);
}
