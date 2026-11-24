import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const routesDir = path.dirname(fileURLToPath(import.meta.url));
const workerSrc = path.resolve(routesDir, '..');
const setupSource = await readFile(path.join(routesDir, 'setup.ts'), 'utf8');
const publicSource = await readFile(path.join(routesDir, 'public.ts'), 'utf8');
const indexSource = await readFile(path.join(workerSrc, 'index.ts'), 'utf8');
const liveDataSource = await readFile(path.join(workerSrc, 'do', 'live-data.ts'), 'utf8');
const viewerTokenSource = await readFile(path.join(workerSrc, 'auth', 'viewer-token.ts'), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  return source.slice(start, end);
}

test('GET /setup/database/init 仅在初始化阶段回显 project_ref', () => {
  const route = sliceBetween(setupSource, "setupRoutes.get('/database/init'", "setupRoutes.post('/database/init'");
  assert.match(route, /adminAccountStatus\(getDatabase\(c\.env\)\)/, '必须以管理员是否存在作为判定条件');
  assert.match(route, /\.\.\.\(setupPending \? \{ project_ref: projectRef \} : \{\}\)/, 'project_ref 必须条件化返回');
  assert.doesNotMatch(route, /^\s*project_ref: projectRef,\s*$/m, '不得无条件回显 project_ref');
});

test('HSTS 不附带 preload（避免不可逆的子域强制跳转）', () => {
  for (const [name, source] of [['index.ts', indexSource], ['public.ts', publicSource]]) {
    const matches = source.match(/Strict-Transport-Security[^\n]*/g) ?? [];
    assert.ok(matches.length > 0, `${name} 应设置 HSTS`);
    for (const header of matches) {
      assert.doesNotMatch(header, /preload/, `${name} 的 HSTS 不应包含 preload`);
      assert.match(header, /includeSubDomains/, `${name} 的 HSTS 应保留 includeSubDomains`);
    }
  }
});

test('POST /setup/database/init 在管理员已存在时要求管理员认证与 CSRF 并脱敏 projectRef', () => {
  const route = sliceBetween(setupSource, "setupRoutes.post('/database/init'", 'export { setupRoutes }');
  assert.match(route, /adminStatus === 'present'/);
  assert.match(route, /validateAdminSession/);
  assert.match(route, /verifyAdminCsrfToken/);
  assert.match(route, /redactSetupInitError\(error, projectRef\)/);
});

test('GET /api/websites 仅在 DEBUG_SERVER_TIMING 启用时输出 Server-Timing', () => {
  const route = sliceBetween(publicSource, "publicRoutes.get('/websites'", "publicRoutes.get('/websites/:id/checks'");
  assert.match(route, /DEBUG_SERVER_TIMING/);
});

test('LiveDataDO 对公开广播的 websites.upsert 做白名单字段裁剪', () => {
  assert.match(liveDataSource, /\.map\(item => this\.publicWebsiteMetadata\(item\)\)/);
  assert.match(liveDataSource, /private publicWebsiteMetadata\(website: JsonObject\)/);
});

test('管理员写操作跳过单机房 30s 会话缓存，强制查库核验 session_version', () => {
  assert.match(indexSource, /if \(safeMethod && await getAdminSessionEdgeCache\(payload\)\)/);
});

test('viewer-token 使用子网归约键以兼容 IPv6 临时地址切换', () => {
  assert.match(viewerTokenSource, /ip:\s*normalizeIpSubnetKey\(ip\)/);
  assert.match(viewerTokenSource, /payload\.ip !== normalizeIpSubnetKey\(ip\)/);
});
