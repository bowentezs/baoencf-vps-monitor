import assert from 'node:assert/strict';
import test from 'node:test';
import { isEmptyLiveSnapshot, shouldDeferLiveSnapshot } from './liveSnapshotGuard.ts';

const empty = { online: [], clients: [], count: 0 };
const online = { online: ['node-1'], clients: [{ uuid: 'node-1' }], count: 1 };

test('defers an empty snapshot until the grace window can confirm it', () => {
  assert.equal(isEmptyLiveSnapshot(empty), true);
  assert.equal(shouldDeferLiveSnapshot(null, empty), true);
  assert.equal(shouldDeferLiveSnapshot(online, empty), true);
});

test('accepts non-empty snapshots and already-confirmed empty state', () => {
  assert.equal(isEmptyLiveSnapshot(online), false);
  assert.equal(shouldDeferLiveSnapshot(null, online), false);
  assert.equal(shouldDeferLiveSnapshot(empty, empty), false);
});
