import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardStatusCards } from './dashboardStatus.ts';

const input = {
  onlineCount: 0,
  totalCount: 5,
  regionCount: 0,
  totalUp: 0,
  totalDown: 0,
  totalSpeedUp: 0,
  totalSpeedDown: 0,
};

test('does not present unavailable live data as zero online nodes', () => {
  const cards = buildDashboardStatusCards(input, false);
  assert.equal(cards[0].value, '-- / 5');
  assert.equal(cards[0].detail, '实时状态暂不可用');
  assert.equal(cards[1].value, '--');
});
