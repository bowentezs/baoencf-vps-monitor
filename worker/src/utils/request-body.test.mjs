import assert from 'node:assert/strict';
import test from 'node:test';
import { readJsonWithLimit } from './request-body.ts';

const endpoint = 'https://example.test/api/visit';
const LIMIT = 4 * 1024;

function makeRequest(init) {
  return new Request(endpoint, init);
}

test('超过上限的字符串 body 返回 too_large', async () => {
  const result = await readJsonWithLimit(makeRequest({ method: 'POST', body: 'a'.repeat(LIMIT + 1000) }), LIMIT);
  assert.deepEqual(result, { ok: false, reason: 'too_large' });
});

test('Content-Length 谎报小于实际长度时仍按真实字节拦截', async () => {
  const result = await readJsonWithLimit(
    makeRequest({ method: 'POST', headers: { 'Content-Length': '10' }, body: 'a'.repeat(LIMIT + 1000) }),
    LIMIT,
  );
  assert.deepEqual(result, { ok: false, reason: 'too_large' });
});

test('没有 Content-Length 的流式 body 同样受限', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('b'.repeat(LIMIT * 2)));
      controller.close();
    },
  });
  const result = await readJsonWithLimit(makeRequest({ method: 'POST', body, duplex: 'half' }), LIMIT);
  assert.deepEqual(result, { ok: false, reason: 'too_large' });
});

test('限制内的合法 JSON 正常解析', async () => {
  const result = await readJsonWithLimit(
    makeRequest({ method: 'POST', body: JSON.stringify({ path: '/abc' }) }),
    LIMIT,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.body, { path: '/abc' });
});

test('空 body 视为非法 JSON，而不是抛错', async () => {
  const result = await readJsonWithLimit(makeRequest({ method: 'POST' }), LIMIT);
  assert.deepEqual(result, { ok: false, reason: 'invalid_json' });
});
