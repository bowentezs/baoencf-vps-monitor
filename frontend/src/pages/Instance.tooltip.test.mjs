import assert from 'node:assert/strict';
import test from 'node:test';

// 模拟 CustomPingTooltip 的核心过滤与排序计算逻辑
function computeTooltipItems({
  row,
  orderedSeries,
  activeTaskId,
  hoveredKey,
}) {
  const targetSeries = activeTaskId !== 'all'
    ? orderedSeries.filter((item) => item.task.id === activeTaskId)
    : orderedSeries;

  const effectiveSeries = targetSeries.length > 0 ? targetSeries : orderedSeries;

  const items = effectiveSeries.map((item) => {
    const rawVal = row[item.task.key];
    const isLoss = Boolean(row[`${item.task.key}_loss`]);
    const numVal = typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal : null;
    return {
      id: item.task.id,
      key: item.task.key,
      label: item.task.label,
      color: item.task.color,
      value: numVal,
      isLoss: isLoss || (rawVal === null && row[item.task.key] !== undefined),
      hasData: item.task.key in row,
    };
  }).filter((item) => item.hasData);

  const sortedItems = [...items].sort((a, b) => {
    if (a.isLoss && !b.isLoss) return -1;
    if (!a.isLoss && b.isLoss) return 1;
    const valA = a.value ?? -1;
    const valB = b.value ?? -1;
    return valB - valA;
  });

  return {
    items,
    sortedItems,
    isSingle: sortedItems.length === 1,
    isMulti: sortedItems.length > 4,
  };
}

const mockSeries = [
  { task: { id: 1, key: 'ah_mobile', label: 'AH 移动', color: '#ec4899' } },
  { task: { id: 2, key: 'ah_telecom', label: 'AH 电信', color: '#f59e0b' } },
  { task: { id: 3, key: 'zj_unicom', label: 'ZJ 联通', color: '#3b82f6' } },
  { task: { id: 4, key: 'gd_telecom', label: 'GD 电信', color: '#10b981' } },
  { task: { id: 5, key: 'zj_mobile', label: 'ZJ 移动', color: '#8b5cf6' } },
];

const mockRow = {
  time: 1791469200000,
  ah_mobile: 216,
  ah_telecom: 358,
  zj_unicom: 514,
  gd_telecom: 1316,
  zj_mobile: null,
  zj_mobile_loss: true,
};

test('聚焦特定线路时：仅输出单条该线路指标，标记 isSingle=true', () => {
  const result = computeTooltipItems({
    row: mockRow,
    orderedSeries: mockSeries,
    activeTaskId: 1, // 聚焦 AH 移动
    hoveredKey: null,
  });

  assert.equal(result.sortedItems.length, 1);
  assert.equal(result.isSingle, true);
  assert.equal(result.isMulti, false);
  assert.equal(result.sortedItems[0].label, 'AH 移动');
  assert.equal(result.sortedItems[0].value, 216);
  assert.equal(result.sortedItems[0].isLoss, false);
});

test('聚焦异常丢包线路时：正确标定丢包状态', () => {
  const result = computeTooltipItems({
    row: mockRow,
    orderedSeries: mockSeries,
    activeTaskId: 5, // 聚焦 ZJ 移动
    hoveredKey: null,
  });

  assert.equal(result.sortedItems.length, 1);
  assert.equal(result.isSingle, true);
  assert.equal(result.sortedItems[0].label, 'ZJ 移动');
  assert.equal(result.sortedItems[0].isLoss, true);
});

test('全网对比模式时：输出全部线路并按丢包优先与延迟降序排列', () => {
  const result = computeTooltipItems({
    row: mockRow,
    orderedSeries: mockSeries,
    activeTaskId: 'all',
    hoveredKey: null,
  });

  assert.equal(result.sortedItems.length, 5);
  assert.equal(result.isSingle, false);
  assert.equal(result.isMulti, true);
  assert.equal(result.sortedItems[0].label, 'ZJ 移动'); // 丢包排在最前
  assert.equal(result.sortedItems[1].label, 'GD 电信'); // 1316ms 延迟最高排第二
});

test('全网对比时：悬停不会触发元素位移重排（保证布局绝对稳定，零闪烁）', () => {
  const resultWithoutHover = computeTooltipItems({
    row: mockRow,
    orderedSeries: mockSeries,
    activeTaskId: 'all',
    hoveredKey: null,
  });

  const resultWithHover = computeTooltipItems({
    row: mockRow,
    orderedSeries: mockSeries,
    activeTaskId: 'all',
    hoveredKey: 'ah_telecom', // 悬停 AH 电信
  });

  // 验证两者的元素顺序完全一致，绝不因悬停改变元素几何索引
  assert.deepEqual(
    resultWithoutHover.sortedItems.map(i => i.key),
    resultWithHover.sortedItems.map(i => i.key)
  );
});

test('未知 activeTaskId 容错：安全降级为全量对比而不崩溃', () => {
  const result = computeTooltipItems({
    row: mockRow,
    orderedSeries: mockSeries,
    activeTaskId: 99999, // 不存在的 id
    hoveredKey: null,
  });

  assert.equal(result.sortedItems.length, 5);
});
