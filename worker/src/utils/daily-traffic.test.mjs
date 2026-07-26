import assert from 'node:assert/strict';

const { buildDailyTrafficResponse, normalizeDailyTrafficSnapshot, shanghaiDayKey } = await import('./daily-traffic.ts');

assert.equal(shanghaiDayKey(Date.parse('2026-07-25T15:59:59Z')), '2026-07-25');
assert.equal(shanghaiDayKey(Date.parse('2026-07-25T16:00:00Z')), '2026-07-26');

const snapshot = normalizeDailyTrafficSnapshot({
  series: [
    { client: 'a', day: '2026-07-25', up: 100, down: 200 },
    { client: 'a', day: '2026-07-26', up: 10, down: 20 },
    { client: 'hidden', day: '2026-07-26', up: 999, down: 999 },
  ],
  latest: [
    { client: 'a', time: '2026-07-26T00:00:00Z', net_total_up: 1000, net_total_down: 2000 },
  ],
});
const result = buildDailyTrafficResponse({
  snapshot,
  visibleClients: ['a', 'b'],
  liveData: {
    a: { net_total_up: 1075, net_total_down: 2125 },
  },
  days: 2,
  nowMs: Date.parse('2026-07-26T04:00:00Z'),
});

assert.deepEqual(result.data, [
  { client: 'a', day: '2026-07-25', up: 100, down: 200 },
  { client: 'a', day: '2026-07-26', up: 85, down: 145 },
  { client: 'b', day: '2026-07-25', up: 0, down: 0 },
  { client: 'b', day: '2026-07-26', up: 0, down: 0 },
]);

const resetResult = buildDailyTrafficResponse({
  snapshot: {
    series: [],
    latest: [{ client: 'a', time: '2026-07-26T00:00:00Z', net_total_up: 900, net_total_down: 800 }],
  },
  visibleClients: ['a'],
  liveData: { a: { net_total_up: 25, net_total_down: 30 } },
  days: 1,
  nowMs: Date.parse('2026-07-26T04:00:00Z'),
});
assert.deepEqual(resetResult.data[0], { client: 'a', day: '2026-07-26', up: 25, down: 30 });
