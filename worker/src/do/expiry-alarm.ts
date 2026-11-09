export type ExpiryAlarmPlan =
  | { action: 'none' }
  | { action: 'set'; at: number }
  | { action: 'delete' };

/**
 * 决定到期闹钟是否需要写 DO 存储。
 *
 * Durable Object 的 setAlarm()/deleteAlarm() 按 SQLite 计费规则都会算 1 行写入，
 * 而免费版每天只有 100,000 行。WebSocket 上报是秒级热路径，必须在每次上报时
 * 去抖：已有闹钟不晚于目标时间就什么都不做，让它触发后在 alarm() 里重新排程。
 */
export function planExpiryAlarm(
  currentAlarmAt: number | null,
  nextExpiryAt: number | undefined,
  now: number,
): ExpiryAlarmPlan {
  if (nextExpiryAt === undefined) {
    return currentAlarmAt === null ? { action: 'none' } : { action: 'delete' };
  }

  const target = Math.max(nextExpiryAt, now + 1000);
  if (currentAlarmAt !== null && currentAlarmAt <= target) {
    return { action: 'none' };
  }

  return { action: 'set', at: target };
}
