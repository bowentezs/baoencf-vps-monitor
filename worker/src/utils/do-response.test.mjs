import assert from 'node:assert/strict';
import test from 'node:test';
import { readLiveSnapshot } from './do-response.ts';

test('rejects failed Durable Object responses instead of treating them as live state', async () => {
  const snapshot = await readLiveSnapshot(Response.json(
    { online: [], clients: [], count: 0 },
    { status: 503 },
  ));
  assert.equal(snapshot, null);
});

test('keeps a valid empty snapshot distinguishable from an upstream failure', async () => {
  const snapshot = await readLiveSnapshot(Response.json({
    online: [],
    clients: [],
    data: {},
    count: 0,
    timestamp: 123,
  }));
  assert.deepEqual(snapshot, {
    online: [],
    clients: [],
    data: {},
    count: 0,
    timestamp: 123,
  });
});
