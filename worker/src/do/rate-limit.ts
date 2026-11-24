const RATE_LIMIT_STORAGE_PREFIX = 'rate-limit:';
const RATE_LIMIT_MAX_BUCKETS = 5000;
const RATE_LIMIT_CLEANUP_ALARM_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_BODY_BYTES = 2 * 1024;
const STORAGE_DELETE_BATCH_SIZE = 128;

export class RateLimitDO {
  private state: DurableObjectState;
  private sweepCounter = 0;
  private memoryBuckets: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/rate-limit') {
      return this.checkRateLimit(request);
    }
    if (request.method === 'POST' && url.pathname === '/visitor-check') {
      return this.checkVisitorLog(request);
    }
    return Response.json({ error: 'Not Found' }, { status: 404 });
  }

  private async readBoundedJson(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
    const contentLength = Number(request.headers.get('Content-Length') || '0');
    if (Number.isFinite(contentLength) && contentLength > RATE_LIMIT_MAX_BODY_BYTES) {
      return { ok: false, response: Response.json({ error: 'Rate limit payload too large' }, { status: 413 }) };
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { ok: false, response: Response.json({ error: 'Invalid rate limit payload' }, { status: 400 }) };
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, response: Response.json({ error: 'Invalid rate limit payload' }, { status: 400 }) };
    }
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > RATE_LIMIT_MAX_BODY_BYTES) {
      return { ok: false, response: Response.json({ error: 'Rate limit payload too large' }, { status: 413 }) };
    }
    return { ok: true, body: body as Record<string, unknown> };
  }

  private sweepExpiredMemoryBuckets(now: number): void {
    this.sweepCounter += 1;
    if (this.sweepCounter % 256 !== 0) return;
    for (const [k, v] of this.memoryBuckets.entries()) {
      if (v.resetAt <= now) this.memoryBuckets.delete(k);
    }
  }

  private async deleteKeysInBatches(keys: string[]): Promise<void> {
    for (let offset = 0; offset < keys.length; offset += STORAGE_DELETE_BATCH_SIZE) {
      await this.state.storage.delete(keys.slice(offset, offset + STORAGE_DELETE_BATCH_SIZE));
    }
  }

  private async checkVisitorLog(request: Request): Promise<Response> {
    const parsed = await this.readBoundedJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    const subnetKey = typeof body.subnetKey === 'string' ? body.subnetKey.slice(0, 128) : '';
    const dedupeKey = typeof body.dedupeKey === 'string' ? body.dedupeKey.slice(0, 128) : '';
    const subnetMax = Number(body.subnetMax);
    const windowMs = Number(body.windowMs);
    if (!subnetKey || !dedupeKey || !Number.isInteger(subnetMax) || subnetMax <= 0 || !Number.isInteger(windowMs) || windowMs < 1000) {
      return Response.json({ error: 'Invalid visitor check payload' }, { status: 400 });
    }

    const now = Date.now();
    this.sweepExpiredMemoryBuckets(now);

    // 1. 先检查单路径 10 分钟去重：重复访问直接跳过，不白白消耗子网配额
    const dedupeStorageKey = `${RATE_LIMIT_STORAGE_PREFIX}visitor-log:${dedupeKey}`;
    const existingDedupe = this.memoryBuckets.get(dedupeStorageKey);
    if (existingDedupe && existingDedupe.resetAt > now) {
      return Response.json({ allowed: false });
    }

    // 2. 仅首次路径访问才检查并累加子网配额
    const subnetStorageKey = `${RATE_LIMIT_STORAGE_PREFIX}visitor-subnet-cap:${subnetKey}`;
    let subnetState = this.memoryBuckets.get(subnetStorageKey);
    if (!subnetState || subnetState.resetAt <= now) {
      const persisted = await this.state.storage.get<{ count: number; resetAt: number }>(subnetStorageKey);
      subnetState = !persisted || persisted.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : persisted;
    }
    if (subnetState.count >= subnetMax) {
      this.memoryBuckets.set(subnetStorageKey, subnetState);
      return Response.json({ allowed: false });
    }

    subnetState.count += 1;
    this.memoryBuckets.set(subnetStorageKey, subnetState);
    this.memoryBuckets.set(dedupeStorageKey, { count: 1, resetAt: now + windowMs });
    if (subnetState.count >= subnetMax) {
      this.state.waitUntil(this.state.storage.put(subnetStorageKey, subnetState));
      await this.scheduleCleanupAlarm(now);
    }

    return Response.json({ allowed: true });
  }

  private async checkRateLimit(request: Request): Promise<Response> {
    const parsed = await this.readBoundedJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    const bucket = typeof body.bucket === 'string' ? body.bucket.slice(0, 96) : '';
    const ip = typeof body.ip === 'string' ? body.ip.slice(0, 128) : '';
    const max = Number(body.max);
    const windowMs = Number(body.windowMs);
    if (!bucket || !ip || !Number.isInteger(max) || max <= 0 || !Number.isInteger(windowMs) || windowMs < 1000) {
      return Response.json({ error: 'Invalid rate limit payload' }, { status: 400 });
    }

    const now = Date.now();
    const key = `${RATE_LIMIT_STORAGE_PREFIX}${bucket}:${ip}`;

    // 优先读取内存桶，未命中时尝试读取持久化存储
    let state = this.memoryBuckets.get(key);
    if (!state || state.resetAt <= now) {
      const persisted = await this.state.storage.get<{ count: number; resetAt: number }>(key);
      state = !persisted || persisted.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : persisted;
    }

    state.count += 1;
    this.memoryBuckets.set(key, state);

    // 仅在超限（触发封禁惩罚）时异步持久化，正常放行无需耗费 SQLite 写入配额
    if (state.count > max) {
      this.state.waitUntil(this.state.storage.put(key, state));
      await this.scheduleCleanupAlarm(now);
    }

    // 热路径仅做轻量内存过期清理，持久化存储清理交给定时 alarm() 异步批处理
    this.sweepExpiredMemoryBuckets(now);

    const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    const remaining = Math.max(0, max - state.count);
    return Response.json({
      allowed: state.count <= max,
      retry_after: retryAfter,
      limit: max,
      remaining,
      reset: Math.ceil(state.resetAt / 1000),
    });
  }

  private async cleanupExpiredBuckets(now: number): Promise<void> {
    try {
      const entries = await this.state.storage.list<{ count: number; resetAt: number }>({
        prefix: RATE_LIMIT_STORAGE_PREFIX,
      });
      const expired: string[] = [];
      for (const [key, value] of entries) {
        if (!value || value.resetAt <= now) expired.push(key);
      }
      if (expired.length > 0) {
        await this.deleteKeysInBatches(expired);
      }
    } catch {
      // Best effort; active buckets overwrite themselves.
    }
  }

  private async scheduleCleanupAlarm(now: number): Promise<void> {
    try {
      const current = await this.state.storage.getAlarm();
      if (current === null) {
        await this.state.storage.setAlarm(now + RATE_LIMIT_CLEANUP_ALARM_MS);
      }
    } catch {
      // Best effort; alarm will be re-scheduled on next limit trigger.
    }
  }

  private async enforceBucketLimit(now: number): Promise<void> {
    try {
      const entries = await this.state.storage.list<{ count: number; resetAt: number }>({
        prefix: RATE_LIMIT_STORAGE_PREFIX,
      });
      if (entries.size <= RATE_LIMIT_MAX_BUCKETS) return;

      const expired: string[] = [];
      const active: Array<{ key: string; resetAt: number }> = [];
      for (const [key, value] of entries) {
        if (!value || value.resetAt <= now) {
          expired.push(key);
        } else {
          active.push({ key, resetAt: value.resetAt });
        }
      }

      const overflow = Math.max(0, active.length - RATE_LIMIT_MAX_BUCKETS);
      const oldest = overflow > 0
        ? active.sort((a, b) => a.resetAt - b.resetAt).slice(0, overflow).map(item => item.key)
        : [];
      const toDelete = [...expired, ...oldest];
      if (toDelete.length > 0) {
        await this.deleteKeysInBatches(toDelete);
      }
    } catch {
      // Best effort; rate-limit correctness does not depend on compaction.
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    await this.cleanupExpiredBuckets(now);
    await this.enforceBucketLimit(now);

    try {
      const entries = await this.state.storage.list({ prefix: RATE_LIMIT_STORAGE_PREFIX, limit: 1 });
      if (entries.size > 0) {
        await this.state.storage.setAlarm(now + RATE_LIMIT_CLEANUP_ALARM_MS);
      } else {
        await this.state.storage.deleteAlarm();
      }
    } catch {
      // If storage inspection fails, try again later.
      await this.state.storage.setAlarm(now + RATE_LIMIT_CLEANUP_ALARM_MS);
    }
  }
}
