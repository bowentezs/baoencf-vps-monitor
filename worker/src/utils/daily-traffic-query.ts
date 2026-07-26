const DAILY_TRAFFIC_DAYS = new Set([1, 7, 30]);
const DAILY_TRAFFIC_QUERY_PARAMS = new Set(['days', 'include_hidden']);

export type DailyTrafficQuery = {
  ok: true;
  days: 1 | 7 | 30;
  includeHiddenRequested: boolean;
} | {
  ok: false;
  error: string;
};

export function parseDailyTrafficQuery(requestUrl: string): DailyTrafficQuery {
  const params = new URL(requestUrl).searchParams;
  for (const name of params.keys()) {
    if (!DAILY_TRAFFIC_QUERY_PARAMS.has(name) || params.getAll(name).length > 1) {
      return { ok: false, error: '查询参数无效，仅支持 days=1|7|30 和 include_hidden=0|1' };
    }
  }

  const rawDays = params.get('days');
  const parsedDays = rawDays === null || rawDays === '' ? 7 : Number(rawDays);
  if (!Number.isInteger(parsedDays) || !DAILY_TRAFFIC_DAYS.has(parsedDays)) {
    return { ok: false, error: 'days 仅支持 1、7 或 30' };
  }

  const rawIncludeHidden = params.get('include_hidden');
  if (rawIncludeHidden !== null && rawIncludeHidden !== '0' && rawIncludeHidden !== '1') {
    return { ok: false, error: 'include_hidden 仅支持 0 或 1' };
  }

  return {
    ok: true,
    days: parsedDays as 1 | 7 | 30,
    includeHiddenRequested: rawIncludeHidden === '1',
  };
}

export function dailyTrafficPublicCacheIdentity(requestUrl: string, days: 1 | 7 | 30): {
  key: string;
  request: Request;
} {
  const source = new URL(requestUrl);
  const canonical = new URL(source.pathname, source.origin);
  canonical.searchParams.set('days', String(days));
  return {
    key: `daily-traffic:${canonical.pathname}?${canonical.searchParams.toString()}`,
    request: new Request(canonical.toString(), { method: 'GET' }),
  };
}
