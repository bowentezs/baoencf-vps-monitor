export const AGENT_WS_STALE_MS = 180_000;
export const AGENT_WS_MAX_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_POLICY_IDLE_INTERVAL_SEC = 3600;

/**
 * 计算 WebSocket Agent 的判死 TTL（毫秒）。
 *
 * 必须覆盖空闲上报间隔（默认 120s）叠加一次完整探测与网络抖动的耗时，
 * 避免旧版 Agent、高探测负载节点或 DO 刚从休眠恢复时被固定死线误杀。
 */
export function agentWsStaleTtlMs(idleIntervalSec: number, reportedIntervalSec?: number): number {
  const safeIdleSec = Number.isFinite(idleIntervalSec) && idleIntervalSec > 0
    ? Math.min(idleIntervalSec, MAX_POLICY_IDLE_INTERVAL_SEC)
    : 120;
  const safeReportedSec = typeof reportedIntervalSec === 'number' && Number.isFinite(reportedIntervalSec) && reportedIntervalSec > 0
    ? Math.min(reportedIntervalSec, MAX_POLICY_IDLE_INTERVAL_SEC)
    : 0;
  const effectiveIdleSec = Math.max(safeIdleSec, safeReportedSec);
  return Math.min(
    Math.max(AGENT_WS_STALE_MS, Math.ceil(effectiveIdleSec * 2 + 30) * 1000),
    AGENT_WS_MAX_TTL_MS,
  );
}

/**
 * 仅当活跃观看者数量从 >0 归零（即确实从 active 切回 idle）时才需要广播 idle 策略。
 *
 * 若本来就没有观看者（例如 alarm 清理过期 Agent），或仍有其他观看者在线，
 * 广播相同策略只会无意义地唤醒/干扰在线 Agent。
 */
export function shouldBroadcastPolicyOnViewerChange(
  activeViewersBefore: number,
  activeViewersAfter: number,
): boolean {
  return activeViewersBefore > 0 && activeViewersAfter === 0;
}
