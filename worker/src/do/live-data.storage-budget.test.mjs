import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// 免费版 DO 每天只有 100,000 行写入；这里锁定热路径上的写入放大回归。
const source = await readFile(new URL('./live-data.ts', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  return source.slice(start, end);
}

test('Ping 去重状态按客户端合并为一行写入', () => {
  const persist = sliceBetween('private async persistPingResultState', 'private shouldPersistPingResult');
  assert.match(persist, /loadPingResultStateClient\(clientId\)/);
  assert.match(persist, /storage\.put\(this\.pingResultStateClientKey\(clientId\), entries\)/);

  const mark = sliceBetween('private async markPingResultsPersisted', 'private async persistReport');
  assert.doesNotMatch(mark, /storage\.put/);
  assert.match(mark, /await this\.persistPingResultState\(clientId\);/);
});

test('未入库的 Ping 结果只推进内存限频，不再逐结果写 DO 存储', () => {
  assert.doesNotMatch(source, /writePingResultState/);

  const filter = source.slice(source.indexOf('private async filterTrustedPingResultsByInterval'));
  assert.match(filter, /const state = await this\.readPingResultState\(clientId, result\.taskId\)/);
  assert.match(filter, /this\.pingResultStateCache\.set\(key, \{/);
});

test('到期闹钟不随每条上报重写，且 alarm 触发后会清空缓存重新排程', () => {
  const schedule = sliceBetween('private async scheduleExpiryAlarm', 'private nextExpiryAt');
  assert.match(schedule, /planExpiryAlarm\(this\.alarmScheduledAt, this\.nextExpiryAt\(now\), now\)/);

  const alarm = sliceBetween('async alarm(', 'private async isPersistDue');
  assert.match(alarm, /this\.alarmScheduledAt = null;/);
  assert.match(alarm, /finally \{[^]*?scheduleExpiryAlarm\(now\)/);
});
