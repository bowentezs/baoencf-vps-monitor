import type { Context } from 'hono';
import type { Bindings, Variables } from '../index.ts';
import { getCloudflareClientIp } from './request-ip.ts';
import { getDatabase } from '../db/provider.ts';
import * as db from '../db/queries.ts';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

const LOCAL_DEDUPE_WINDOW_MS = 10 * 60 * 1000; // 10 分钟防抖
const LOCAL_MAP_MAX_ENTRIES = 2000;
const localSeenMap = new Map<string, number>();

// 清理本地内存过期的防抖记录，防止 V8 堆内存泄露
function sweepExpiredLocalBuckets(now: number): void {
  for (const [ip, timestamp] of localSeenMap.entries()) {
    if (now - timestamp >= LOCAL_DEDUPE_WINDOW_MS) {
      localSeenMap.delete(ip);
    }
  }
}

// 检查该 IP 是否在 10 分钟防抖期内；若不是，则标记并返回 true
async function checkVisitorAllowed(c: AppContext, ip: string): Promise<boolean> {
  const now = Date.now();

  // 1. 若配置了 Durable Objects RATE_LIMIT，使用全局强一致防抖
  if (c.env.RATE_LIMIT) {
    try {
      const doId = c.env.RATE_LIMIT.idFromName('visitor-limiter');
      const stub = c.env.RATE_LIMIT.get(doId);
      const res = await stub.fetch(new Request('https://do/rate-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket: 'visitor-log',
          ip,
          max: 1,
          windowMs: LOCAL_DEDUPE_WINDOW_MS,
        }),
      }));
      if (res.ok) {
        const data = await res.json() as { allowed?: boolean };
        // allowed 为 true 表示本次为窗口期内的第 1 次访问，允许记录；false 表示已超限，跳过
        return Boolean(data.allowed);
      }
    } catch {
      // DO 通信异常时降级至本地内存检查
    }
  }

  // 2. 本地内存降级防抖保护
  if (localSeenMap.size >= LOCAL_MAP_MAX_ENTRIES) {
    sweepExpiredLocalBuckets(now);
  }

  const lastSeen = localSeenMap.get(ip);
  if (lastSeen && now - lastSeen < LOCAL_DEDUPE_WINDOW_MS) {
    return false;
  }

  localSeenMap.set(ip, now);
  return true;
}

// 真实访客异步安全记录器
export function recordVisitorSafely(c: AppContext, targetPath = '/'): void {
  const ip = getCloudflareClientIp(c);
  // 严格校验 IP 格式（仅允许有效 IPv4/IPv6 字符），防止非法字符或伪造攻击
  if (!ip || ip === 'unknown' || /[^\da-fA-F:.]/.test(ip)) {
    return;
  }

  const cf = (c.req.raw as Request & { cf?: Record<string, unknown> }).cf || {};
  const country = String(cf.country || c.req.header('CF-IPCountry') || '').trim().slice(0, 8);
  const city = String(cf.city || '').trim().slice(0, 64);
  const path = (targetPath || new URL(c.req.url).pathname).slice(0, 64);
  const userAgent = (c.req.header('user-agent') || '').trim().slice(0, 128);

  const task = (async () => {
    try {
      const isFirstVisit = await checkVisitorAllowed(c, ip);
      if (!isFirstVisit) {
        return;
      }

      const database = getDatabase(c.env);
      await db.insertVisitorLog(database, ip, country, city, path, userAgent);
    } catch {
      // 静默吞掉错误，确保主业务绝对不受任何数据库抖动影响
    }
  })();

  if (c.executionCtx?.waitUntil) {
    c.executionCtx.waitUntil(task);
  } else {
    void task;
  }
}
