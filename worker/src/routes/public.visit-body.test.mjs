import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 路由模块使用无扩展名相对导入，无法被 node --test 直接加载，
// 因此沿用 public.do-degradation.test.mjs 的源码契约断言方式。
// 行为级断言见 worker/src/utils/request-body.test.mjs。

const routesDir = path.dirname(fileURLToPath(import.meta.url));
const publicSource = await readFile(path.join(routesDir, 'public.ts'), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  return source.slice(start, end);
}

// 去掉注释，避免注释里提到 c.req.json() 时误报；保留字符串内容，
// 因为字符串里出现该调用同样说明代码可能在拼装。
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('/visit 使用受限读取，不会无上限解析请求体', () => {
  const route = sliceBetween(publicSource, "publicRoutes.all('/visit'", 'export { publicRoutes');
  assert.match(route, /readJsonWithLimit\(c\.req\.raw, MAX_VISIT_BODY_BYTES\)/);
  assert.doesNotMatch(route, /c\.req\.json\(/);
  assert.match(publicSource, /const MAX_VISIT_BODY_BYTES = 4 \* 1024;/);
});

test('/visit 在超限时回落 query 参数而不是抛错', () => {
  const route = sliceBetween(publicSource, "publicRoutes.all('/visit'", 'export { publicRoutes');
  assert.match(route, /if \(parsed\.ok\)[^]*?\} else \{[^]*?c\.req\.query\('path'\)/);
});

test('routes 目录下不存在无上限的请求体解析', async () => {
  const offenders = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const source = stripComments(await readFile(full, 'utf8'));
        if (/c\.req\.(json|text|arrayBuffer|blob|parseBody)\(\)|c\.req\.raw\.formData\(\)/.test(source)) {
          offenders.push(path.relative(routesDir, full));
        }
      }
    }
  }
  await walk(routesDir);
  assert.deepEqual(offenders, [], `发现无上限 body 解析: ${offenders.join(', ')}`);
});
