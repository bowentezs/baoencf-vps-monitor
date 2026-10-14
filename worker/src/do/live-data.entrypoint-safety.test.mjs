import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// LiveDataDO 用无扩展名相对导入，无法被 node --test 直接加载，
// 因此与 live-data.metadata-sync.test.mjs 一致，用源码契约断言锁定入口安全。

const source = await readFile(new URL('./live-data.ts', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  return source.slice(start, end);
}

test('构造函数兜底会话 hydration，避免构造失败导致对象整体不可用', () => {
  const ctor = sliceBetween('constructor(state: DurableObjectState', 'private getQueryDatabase');
  assert.match(ctor, /try \{[^]*?hydrateSessionsFromAcceptedWebSockets\(\)[^]*?\} catch/);
});

test('hydration 对单个损坏的 WebSocket 会话做隔离', () => {
  const hydrate = sliceBetween('private hydrateSessionsFromAcceptedWebSockets', 'private sanitizeReport');
  assert.match(hydrate, /for \(const ws of this\.state\.getWebSockets\(\)\) \{[^]*?try \{[^]*?\} catch/);
});

test('fetch 统一兜底为 500 JSON，绝不把异常抛回运行时', () => {
  const fetch = sliceBetween('async fetch(request: Request)', 'private async handleRequest');
  assert.match(fetch, /try \{[^]*?return await this\.handleRequest\(request\)[^]*?\} catch \(error\)/);
  assert.match(fetch, /Response\.json\(\{ error: 'Durable Object request failed' \}, \{ status: 500 \}\)/);
});

test('WebSocket 三个入口全部兜底', () => {
  const message = sliceBetween('async webSocketMessage(', 'async webSocketClose(');
  assert.match(message, /^\s*async webSocketMessage[^]*?\btry \{/, 'webSocketMessage 必须整体包在 try 中');
  assert.match(message, /\} catch \{/);

  const close = sliceBetween('async webSocketClose(', 'async webSocketError(');
  assert.match(close, /try \{[^]*?\} catch \(error\)/);

  const error = sliceBetween('async webSocketError(', 'async alarm(');
  assert.match(error, /try \{[^]*?\} catch \(error\)/);
});

test('alarm 无论成败都会重新排程', () => {
  const alarm = sliceBetween('async alarm(', 'private async isPersistDue');
  assert.match(alarm, /try \{[^]*?\} catch \(error\)[^]*?finally \{[^]*?scheduleExpiryAlarm\(now\)/);
});
