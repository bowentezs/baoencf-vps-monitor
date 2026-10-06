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

// 检查该 IP 与访问路径是否在 10 分钟防抖期内；若不是，则标记并返回 true
async function checkVisitorAllowed(c: AppContext, dedupeKey: string): Promise<boolean> {
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
          ip: dedupeKey,
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

  const lastSeen = localSeenMap.get(dedupeKey);
  if (lastSeen && now - lastSeen < LOCAL_DEDUPE_WINDOW_MS) {
    return false;
  }

  localSeenMap.set(dedupeKey, now);
  return true;
}

// 真实访客异步安全记录器
export function recordVisitorSafely(c: AppContext, targetPath = '/'): void {
  const ip = getCloudflareClientIp(c);
  // 严格校验 IP 格式（仅允许有效 IPv4/IPv6 字符），防止非法字符或伪造攻击
  if (!ip || ip === 'unknown' || /[^\da-fA-F:.]/.test(ip)) {
    return;
  }

  let resolvedPath = (targetPath || '').trim();
  // 若未指定有效路径或仅为根路径，尝试从 Referer 解析
  if (!resolvedPath || resolvedPath === '/') {
    const referer = c.req.header('referer') || c.req.header('referrer');
    if (referer) {
      try {
        const refUrl = new URL(referer);
        const reqUrl = new URL(c.req.url);
        if (refUrl.host === reqUrl.host && refUrl.pathname) {
          resolvedPath = refUrl.pathname;
        }
      } catch {
        // 忽略无效 Referer
      }
    }
  }

  if (!resolvedPath.startsWith('/')) {
    resolvedPath = '/' + resolvedPath;
  }
  // 去除可能的 query 参数，保留纯路径
  try {
    const parsed = new URL(resolvedPath, 'https://internal.local');
    resolvedPath = parsed.pathname;
  } catch {
    // 忽略异常
  }

  const path = (resolvedPath || '/').slice(0, 128);

  // 忽略后台与管理路径、内部 API 路径，避免污染公开访客记录
  if (path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/db-init')) {
    return;
  }

  const cf = (c.req.raw as Request & { cf?: Record<string, unknown> }).cf || {};
  const country = String(cf.country || c.req.header('CF-IPCountry') || '').trim().slice(0, 8);

  let rawCity = String(cf.city || c.req.header('cf-ipcity') || '').trim();
  try {
    rawCity = decodeURIComponent(rawCity);
  } catch {
    // 忽略异常编码
  }
  const city = rawCity.slice(0, 64);
  const userAgent = (c.req.header('user-agent') || '').trim().slice(0, 256);

  const dedupeKey = `${ip}:${path}`.slice(0, 120);

  const task = (async () => {
    try {
      const isFirstVisit = await checkVisitorAllowed(c, dedupeKey);
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
