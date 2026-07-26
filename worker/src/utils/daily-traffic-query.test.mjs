import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyTrafficPublicCacheIdentity, parseDailyTrafficQuery } from './daily-traffic-query.ts';

test('accepts only the supported daily traffic query values', () => {
  assert.deepEqual(parseDailyTrafficQuery('https://example.com/api/traffic/daily'), {
    ok: true,
    days: 7,
    includeHiddenRequested: false,
  });
  assert.deepEqual(parseDailyTrafficQuery('https://example.com/api/traffic/daily?days=1'), {
    ok: true,
    days: 1,
    includeHiddenRequested: false,
  });
  assert.deepEqual(parseDailyTrafficQuery('https://example.com/api/traffic/daily?days=30&include_hidden=1'), {
    ok: true,
    days: 30,
    includeHiddenRequested: true,
  });

  for (const query of [
    'days=2',
    'days=31',
    'days=abc',
    'include_hidden=yes',
    'days=7&days=30',
    'days=7&cache_bust=random',
  ]) {
    assert.equal(parseDailyTrafficQuery(`https://example.com/api/traffic/daily?${query}`).ok, false, query);
  }
});

test('builds one canonical public cache identity per supported day range', () => {
  const identity = dailyTrafficPublicCacheIdentity(
    'https://example.com/api/traffic/daily?days=7&include_hidden=0',
    7,
  );
  assert.equal(identity.key, 'daily-traffic:/api/traffic/daily?days=7');
  assert.equal(identity.request.url, 'https://example.com/api/traffic/daily?days=7');
});
