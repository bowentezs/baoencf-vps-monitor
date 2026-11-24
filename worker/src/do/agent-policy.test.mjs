import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  AGENT_WS_STALE_MS,
  agentWsStaleTtlMs,
  shouldBroadcastPolicyOnViewerChange,
} from './agent-policy.ts';

test('agentWsStaleTtlMs 为 120s 空闲周期保留探测与抖动余量，且兼容高空闲间隔', () => {
  assert.equal(agentWsStaleTtlMs(60), AGENT_WS_STALE_MS);
  assert.equal(agentWsStaleTtlMs(120), 270_000);
  assert.equal(agentWsStaleTtlMs(300), 630_000);
  assert.equal(agentWsStaleTtlMs(120, 600), 1_230_000);
  assert.equal(agentWsStaleTtlMs(120, 999_999), 7_230_000);
  assert.equal(agentWsStaleTtlMs(Number.NaN), 270_000);
});

test('shouldBroadcastPolicyOnViewerChange 仅在最后一个观看者离开归零时返回 true', () => {
  assert.equal(shouldBroadcastPolicyOnViewerChange(0, 0), false);
  assert.equal(shouldBroadcastPolicyOnViewerChange(2, 1), false);
  assert.equal(shouldBroadcastPolicyOnViewerChange(1, 0), true);
  assert.equal(shouldBroadcastPolicyOnViewerChange(3, 0), true);
});

test('LiveDataDO 在 alarm 与断线清理中门控 policy 广播，避免空闲节点雪崩饥饿', async () => {
  const source = await readFile(new URL('./live-data.ts', import.meta.url), 'utf8');
  const alarmStart = source.indexOf('async alarm(');
  const alarmEnd = source.indexOf('private async isPersistDue', alarmStart);
  const alarmBody = source.slice(alarmStart, alarmEnd);
  assert.match(alarmBody, /const expiredAnyViewer = this\.removeExpiredViewers\(now\);/);
  assert.match(alarmBody, /shouldBroadcastPolicyOnViewerChange\(expiredAnyViewer \? 1 : 0,\s*this\.activeViewerCount\(now\)\)/);

  const cleanupStart = source.indexOf('private async cleanupDisconnectedSession(');
  const cleanupEnd = source.indexOf('async webSocketClose(', cleanupStart);
  const cleanupBody = source.slice(cleanupStart, cleanupEnd);
  assert.match(cleanupBody, /const removedSession = this\.cleanupSession\(ws, attachment\);/);
  assert.match(cleanupBody, /shouldBroadcastPolicyOnViewerChange\(removedSession \? 1 : 0,\s*this\.activeViewerCount\(now\)\)/);
});
