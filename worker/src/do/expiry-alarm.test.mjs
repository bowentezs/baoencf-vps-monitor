import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { planExpiryAlarm } from './expiry-alarm.ts';

const NOW = 1_790_000_000_000;

test('无到期时间且无闹钟时不写存储', () => {
  assert.deepEqual(planExpiryAlarm(null, undefined, NOW), { action: 'none' });
});

test('无到期时间但存在旧闹钟时只删除一次', () => {
  assert.deepEqual(planExpiryAlarm(NOW + 60_000, undefined, NOW), { action: 'delete' });
});

test('没有闹钟时按最近到期时间排程，并保证至少 1 秒后触发', () => {
  assert.deepEqual(planExpiryAlarm(null, NOW + 120_000, NOW), { action: 'set', at: NOW + 120_000 });
  assert.deepEqual(planExpiryAlarm(null, NOW, NOW), { action: 'set', at: NOW + 1000 });
  assert.deepEqual(planExpiryAlarm(null, NOW - 5_000, NOW), { action: 'set', at: NOW + 1000 });
});

test('已有闹钟更早触发时跳过写入（观看者续期与每条上报的热路径）', () => {
  assert.deepEqual(planExpiryAlarm(NOW + 30_000, NOW + 120_000, NOW), { action: 'none' });
  assert.deepEqual(planExpiryAlarm(NOW + 120_000, NOW + 120_000, NOW), { action: 'none' });
});

test('新的到期时间早于已排闹钟时提前重排', () => {
  assert.deepEqual(
    planExpiryAlarm(NOW + 300_000, NOW + 60_000, NOW),
    { action: 'set', at: NOW + 60_000 },
  );
});

const source = await readFile(new URL('./live-data.ts', import.meta.url), 'utf8');

test('到期闹钟热路径统一走 planExpiryAlarm，不再无条件重写存储', () => {
  const start = source.indexOf('private async scheduleExpiryAlarm');
  const end = source.indexOf('private nextExpiryAt', start);
  assert.notEqual(start, -1, 'missing scheduleExpiryAlarm');
  assert.notEqual(end, -1, 'missing nextExpiryAt');
  const body = source.slice(start, end);
  assert.match(body, /planExpiryAlarm\(this\.alarmScheduledAt, this\.nextExpiryAt\(now\), now\)/);
  assert.match(body, /if \(plan\.action === 'set'\)/);
  assert.doesNotMatch(body, /await this\.state\.storage\.deleteAlarm\(\);\s*return;/);
});

test('alarm 触发后清空闹钟缓存，保证后续到期仍会重新排程', () => {
  const start = source.indexOf('async alarm(');
  const end = source.indexOf('private async isPersistDue', start);
  assert.notEqual(start, -1, 'missing alarm');
  const body = source.slice(start, end);
  assert.match(body, /this\.alarmScheduledAt = null;/);
  assert.match(body, /finally \{[^]*?scheduleExpiryAlarm\(now\)/);
});
