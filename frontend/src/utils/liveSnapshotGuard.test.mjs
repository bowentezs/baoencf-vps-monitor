import assert from 'node:assert/strict';
import test from 'node:test';
import { isEmptyLiveSnapshot, shouldDeferLiveSnapshot } from './liveSnapshotGuard.ts';

const empty = { online: [], clients: [], count: 0 };
const online = { online: ['node-1'], clients: [{ uuid: 'node-1' }], count: 1 };
const cluster = {
  online: ['node-1', 'node-2', 'node-3', 'node-4'],
  clients: [{ uuid: 'node-1' }, { uuid: 'node-2' }, { uuid: 'node-3' }, { uuid: 'node-4' }],
  count: 4,
};
const partialCluster = { online: ['node-1'], clients: [{ uuid: 'node-1' }], count: 1 };

test('defers an empty snapshot until the grace window can confirm it', () => {
  assert.equal(isEmptyLiveSnapshot(empty), true);
  assert.equal(shouldDeferLiveSnapshot(null, empty), true);
  assert.equal(shouldDeferLiveSnapshot(online, empty), true);
});

test('defers a major partial snapshot drop but accepts ordinary changes', () => {
  assert.equal(isEmptyLiveSnapshot(online), false);
  assert.equal(shouldDeferLiveSnapshot(null, online), false);
  assert.equal(shouldDeferLiveSnapshot(empty, empty), false);
  assert.equal(shouldDeferLiveSnapshot(cluster, partialCluster), true);
  assert.equal(shouldDeferLiveSnapshot(cluster, {
    online: ['node-1', 'node-2', 'node-3'],
    clients: [{ uuid: 'node-1' }, { uuid: 'node-2' }, { uuid: 'node-3' }],
    count: 3,
  }), false);
});
