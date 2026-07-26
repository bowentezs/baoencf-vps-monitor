import assert from 'node:assert/strict';

const { latestDailyTrafficByClient, normalizeDailyTrafficResponse } = await import('./dailyTraffic.ts');

const response = normalizeDailyTrafficResponse({
  timezone: 'Asia/Shanghai',
  generated_at: '2026-07-26T04:00:00Z',
  range_days: 2,
  data: [
    { client: 'a', day: '2026-07-25', up: 10, down: 20 },
    { client: 'a', day: '2026-07-26', up: 30, down: 40 },
    { client: 'b', day: '2026-07-26', up: 50, down: 60 },
  ],
});

assert.ok(response);
assert.deepEqual(latestDailyTrafficByClient(response), {
  a: { up: 30, down: 40 },
  b: { up: 50, down: 60 },
});
assert.equal(normalizeDailyTrafficResponse({ data: [{ client: 'a', day: 'bad', up: 1, down: 2 }] })?.data.length, 0);
