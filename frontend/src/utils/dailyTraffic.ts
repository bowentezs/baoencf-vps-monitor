export interface DailyTrafficUsage {
  up: number;
  down: number;
}

export interface DailyTrafficRow extends DailyTrafficUsage {
  client: string;
  day: string;
}

export interface DailyTrafficResponse {
  timezone: string;
  generated_at: string;
  range_days: number;
  data: DailyTrafficRow[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function counter(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeDailyTrafficResponse(value: unknown): DailyTrafficResponse | null {
  const response = asRecord(value);
  if (!response || !Array.isArray(response.data)) return null;
  const data = response.data.flatMap((item) => {
    const row = asRecord(item);
    const up = counter(row?.up);
    const down = counter(row?.down);
    if (
      !row ||
      typeof row.client !== 'string' ||
      typeof row.day !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.day) ||
      up === null ||
      down === null
    ) return [];
    return [{ client: row.client, day: row.day, up, down }];
  });
  return {
    timezone: typeof response.timezone === 'string' ? response.timezone : 'Asia/Shanghai',
    generated_at: typeof response.generated_at === 'string' ? response.generated_at : '',
    range_days: typeof response.range_days === 'number' ? response.range_days : data.length,
    data,
  };
}

export function latestDailyTrafficByClient(response: DailyTrafficResponse | null): Record<string, DailyTrafficUsage> {
  const result: Record<string, DailyTrafficUsage> = {};
  for (const row of response?.data || []) {
    result[row.client] = { up: row.up, down: row.down };
  }
  return result;
}
