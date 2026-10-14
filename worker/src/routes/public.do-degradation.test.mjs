import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// 路由模块使用无扩展名相对导入，无法被 node --test 直接加载，
// 因此这里与 public.mfa-login.test.mjs 一致，用源码契约断言锁定降级行为。

const publicSource = await readFile(new URL('./public.ts', import.meta.url), 'utf8');
const adminSource = await readFile(new URL('./admin.ts', import.meta.url), 'utf8');
const observabilitySource = await readFile(new URL('../utils/observability.ts', import.meta.url), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  return source.slice(start, end);
}

test('公开 DO 读取叠加层捕获异常并降级为 null，而不是让元数据接口 500', () => {
  const fn = sliceBetween(publicSource, 'async function readAdminClientsSnapshotOverlay', 'async function readPublicLiveSnapshot');
  assert.match(fn, /try \{[^]*?\.fetch\([^]*?\} catch/);
  assert.match(fn, /catch \(error\)[^]*?return null;/);
  assert.match(fn, /warnDurableObjectDegraded\(/);
});

test('/api/live 在 DO 异常时降级为可重试的 503，且不缓存错误', () => {
  const route = sliceBetween(publicSource, "publicRoutes.get('/live'", '// 前台 SPA 页面路由浏览安全上报端点');
  assert.match(route, /try \{[^]*?stub\.fetch\(forwardRequest\)[^]*?\} catch \(error\)/);
  assert.match(route, /c\.json\(\{ error: 'Live data temporarily unavailable' \}, 503\)/);
  assert.match(route, /'Retry-After', '2'/);
  assert.match(route, /'Cache-Control', 'no-store'/);
  // 503 必须在写入边缘缓存之前返回，避免把失败响应缓存下来
  assert.ok(
    route.indexOf('return c.json({ error') < route.indexOf('putPublicEdgeCache(c, response)'),
    '503 降级分支必须先于边缘缓存写入',
  );
});

test('管理端 DO 读取同样捕获异常，避免管理接口 500', () => {
  const fn = sliceBetween(adminSource, 'async function readAdminClientsSnapshot', 'async function writeAdminClientsSnapshot');
  assert.match(fn, /try \{[^]*?\.fetch\([^]*?\} catch \(error\)/);
  assert.match(fn, /warnDurableObjectDegraded\(/);
  assert.match(fn, /return null;/);
});

test('DO 降级告警是可观测且按作用域节流的', () => {
  assert.match(observabilitySource, /export function warnDurableObjectDegraded\(scope: string, error\?: unknown\): void/);
  assert.match(observabilitySource, /console\.warn\(/);
  assert.match(observabilitySource, /DO_DEGRADE_WARN_THROTTLE_MS/);
});
