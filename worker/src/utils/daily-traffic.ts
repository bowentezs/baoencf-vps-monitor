export type DailyTrafficRow = {
  client: string;
  day: string;
  up: number;
  down: number;
};

export type DailyTrafficBaseline = {
  client: string;
  time: string;
  net_total_up: number;
  net_total_down: number;
};

export type DailyTrafficSnapshot = {
  series: DailyTrafficRow[];
  latest: DailyTrafficBaseline[];
};

export type DailyTrafficResponse = {
  timezone: 'Asia/Shanghai';
  generated_at: string;
  range_days: number;
  data: DailyTrafficRow[];
};

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function counter(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeSeriesRow(value: unknown): DailyTrafficRow | null {
  if (!isRecord(value)) return null;
  const client = text(value.client).trim();
  const day = text(value.day);
  if (!client || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return { client, day, up: counter(value.up), down: counter(value.down) };
}

function normalizeBaseline(value: unknown): DailyTrafficBaseline | null {
  if (!isRecord(value)) return null;
  const client = text(value.client).trim();
  const time = text(value.time);
  if (!client || !Number.isFinite(Date.parse(time))) return null;
  return {
    client,
    time,
    net_total_up: counter(value.net_total_up),
    net_total_down: counter(value.net_total_down),
  };
}

export function normalizeDailyTrafficSnapshot(value: unknown): DailyTrafficSnapshot {
  if (!isRecord(value)) return { series: [], latest: [] };
  return {
    series: Array.isArray(value.series)
      ? value.series.map(normalizeSeriesRow).filter((row): row is DailyTrafficRow => Boolean(row))
      : [],
    latest: Array.isArray(value.latest)
      ? value.latest.map(normalizeBaseline).filter((row): row is DailyTrafficBaseline => Boolean(row))
      : [],
  };
}

export function shanghaiDayKey(nowMs: number): string {
  return new Date(nowMs + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function shanghaiDayKeys(days: number, nowMs: number): string[] {
  const count = Math.min(Math.max(Math.floor(days), 1), 30);
  const todayMs = Date.parse(`${shanghaiDayKey(nowMs)}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => (
    new Date(todayMs - (count - index - 1) * DAY_MS).toISOString().slice(0, 10)
  ));
}

function counterDelta(current: number, previous: number): number {
  return current >= previous ? current - previous : current;
}

export function buildDailyTrafficResponse(input: {
  snapshot: DailyTrafficSnapshot;
  visibleClients: string[];
  liveData?: Record<string, unknown>;
  days: number;
  nowMs?: number;
}): DailyTrafficResponse {
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const dayKeys = shanghaiDayKeys(input.days, nowMs);
  const allowedDays = new Set(dayKeys);
  const visibleClients = [...new Set(input.visibleClients.filter(Boolean))];
  const visibleSet = new Set(visibleClients);
  const rows = new Map<string, DailyTrafficRow>();

  for (const client of visibleClients) {
    for (const day of dayKeys) {
      rows.set(`${client}:${day}`, { client, day, up: 0, down: 0 });
    }
  }

  for (const row of input.snapshot.series) {
    if (!visibleSet.has(row.client) || !allowedDays.has(row.day)) continue;
    rows.set(`${row.client}:${row.day}`, { ...row });
  }

  const today = dayKeys[dayKeys.length - 1];
  const baselineByClient = new Map(input.snapshot.latest.map((row) => [row.client, row]));
  for (const client of visibleClients) {
    const live = input.liveData?.[client];
    const baseline = baselineByClient.get(client);
    if (!baseline || !isRecord(live)) continue;
    const current = rows.get(`${client}:${today}`);
    if (!current) continue;
    current.up += counterDelta(counter(live.net_total_up), baseline.net_total_up);
    current.down += counterDelta(counter(live.net_total_down), baseline.net_total_down);
  }

  return {
    timezone: 'Asia/Shanghai',
    generated_at: new Date(nowMs).toISOString(),
    range_days: dayKeys.length,
    data: [...rows.values()],
  };
}
