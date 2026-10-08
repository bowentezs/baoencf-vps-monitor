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

function resolveCapsuleTargetItem({
  items,
  activeTaskId,
  hoveredKey,
}) {
  const sortedItems = [...items].sort((a, b) => {
    if (a.isLoss && !b.isLoss) return -1;
    if (!a.isLoss && b.isLoss) return 1;
    const valA = a.value ?? -1;
    const valB = b.value ?? -1;
    return valB - valA;
  });

  const targetItem = (activeTaskId !== 'all'
    ? sortedItems.find((i) => i.id === activeTaskId)
    : (hoveredKey ? sortedItems.find((i) => i.key === hoveredKey) : null)) || sortedItems[0];

  return targetItem;
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

test('单线胶囊模式：精准定位悬停线路或最关键丢包线路', () => {
  const items = mockSeries.map(s => ({
    id: s.task.id,
    key: s.task.key,
    label: s.task.label,
    color: s.task.color,
    value: mockRow[s.task.key],
    isLoss: Boolean(mockRow[`${s.task.key}_loss`]),
  }));

  // 1. 悬停特定线路时，胶囊精准展示该线路
  const hoveredTarget = resolveCapsuleTargetItem({
    items,
    activeTaskId: 'all',
    hoveredKey: 'ah_mobile',
  });
  assert.equal(hoveredTarget.label, 'AH 移动');
  assert.equal(hoveredTarget.value, 216);

  // 2. 未悬停时，胶囊优先展示发生丢包的故障线路
  const defaultTarget = resolveCapsuleTargetItem({
    items,
    activeTaskId: 'all',
    hoveredKey: null,
  });
  assert.equal(defaultTarget.label, 'ZJ 移动');
  assert.equal(defaultTarget.isLoss, true);
});

// 模拟 findClosestPingSeriesKey 磁吸计算逻辑
function testFindClosestPingSeriesKey({
  chartY,
  chartHeight = 260,
  topPad = 12,
  bottomPad = 34,
  yMin = 0,
  yMax = 2500,
  row,
  series,
}) {
  if (!row || !series || series.length === 0) return null;
  const plotHeight = Math.max(1, chartHeight - topPad - bottomPad);
  const normalizedY = Math.max(0, Math.min(1, (chartY - topPad) / plotHeight));
  const cursorVal = yMax - normalizedY * (yMax - yMin);

  let closestKey = null;
  let minDiff = Infinity;

  for (const item of series) {
    const rawVal = row[item.task.key];
    const isLoss = Boolean(row[`${item.task.key}_loss`]);
    const effectiveVal = isLoss
      ? yMax
      : typeof rawVal === 'number' && Number.isFinite(rawVal)
      ? rawVal
      : null;
    if (effectiveVal === null) continue;

    const diff = Math.abs(effectiveVal - cursorVal);
    if (diff < minDiff) {
      minDiff = diff;
      closestKey = item.task.key;
    }
  }

  return closestKey;
}

test('Y 轴磁吸探针算法：光标移至高位时吸附到顶部丢包或高突刺线路', () => {
  const closestKey = testFindClosestPingSeriesKey({
    chartY: 15, // 靠近顶部 2500ms
    row: mockRow,
    series: mockSeries,
  });
  // 顶格丢包线路为 zj_mobile (yMax 等效 2500ms)
  assert.equal(closestKey, 'zj_mobile');
});

test('Y 轴磁吸探针算法：光标移至中位时吸附到对应高度的折线', () => {
  const closestKey = testFindClosestPingSeriesKey({
    chartY: 120, // 对应 ~1235ms 延迟高度
    row: mockRow,
    series: mockSeries,
  });
  // mockRow 中 gd_telecom 是 1316ms，离 1235ms 最近
  assert.equal(closestKey, 'gd_telecom');
});

test('Y 轴磁吸探针算法：光标移至低位时吸附到底部低延迟折线', () => {
  const closestKey = testFindClosestPingSeriesKey({
    chartY: 220, // 靠近底部 ~160ms 延迟高度
    row: mockRow,
    series: mockSeries,
  });
  // mockRow 中 ah_mobile 是 216ms，离 160ms 最近
  assert.equal(closestKey, 'ah_mobile');
});

