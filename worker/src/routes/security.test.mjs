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
