import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { PingTaskSeries, PingRecord } from '../utils/pingChart';

interface PingSlot {
  key: string;
  slotStart: number;
  slotEnd: number;
  state: 'up' | 'down' | 'degraded' | 'empty';
  totalCount: number;
  lostCount: number;
  avgLatency: number | null;
  title: string;
}

type HeartbeatTooltip = {
  text: string;
  anchorX: number;
  anchorTop: number;
  left: number;
  top: number;
  arrowLeft: number;
};

function formatTimeSlot(start: number, end: number): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const format = (d: Date) => d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const startStr = format(startDate);
  const endStr = format(endDate);
  return `${startStr} ~ ${endStr}`;
}

export interface PingHeartbeatBarProps {
  series: PingTaskSeries[];
  activeTaskId: number | 'all';
  rangeHours?: number;
  slotCount?: number;
}

export default function PingHeartbeatBar({
  series,
  activeTaskId,
  rangeHours = 24,
  slotCount = 50,
}: PingHeartbeatBarProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<HeartbeatTooltip | null>(null);

  // 1. 过滤当前目标线路的记录
  const activeSeries = useMemo(() => {
    if (activeTaskId === 'all') return series;
    return series.filter((item) => item.task.id === activeTaskId);
  }, [series, activeTaskId]);

  const activeTaskName = useMemo(() => {
    if (activeTaskId === 'all') return '全网综合';
    const found = series.find((s) => s.task.id === activeTaskId);
    return found ? found.task.label : '选定线路';
  }, [series, activeTaskId]);

  // 2. 收集所有有效时间戳并确定时间窗口
  const { slots, overallSuccessRate, totalPackets, lostPackets } = useMemo(() => {
    const allRecords: PingRecord[] = [];
    for (const s of activeSeries) {
      for (const r of s.records) {
        allRecords.push(r);
      }
    }

    if (allRecords.length === 0) {
      return { slots: [], overallSuccessRate: null, totalPackets: 0, lostPackets: 0 };
    }

    let minTime = Infinity;
    let maxTime = -Infinity;
    let total = 0;
    let lost = 0;

    for (const r of allRecords) {
      const t = new Date(r.time).getTime();
      if (!Number.isFinite(t)) continue;
      total++;
      if (r.value < 0) lost++;
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }

    const windowEnd = maxTime > 0 ? maxTime : Date.now();
    const effectiveHours = Math.max(1, rangeHours);
    const windowStart = Math.min(minTime, windowEnd - effectiveHours * 3600 * 1000);
    const totalDuration = windowEnd - windowStart;
    const bucketDuration = totalDuration / slotCount;

    // 建立插槽
    const buckets: Array<{
      validLatencies: number[];
      lost: number;
      total: number;
    }> = Array.from({ length: slotCount }, () => ({
      validLatencies: [],
      lost: 0,
      total: 0,
    }));

    for (const r of allRecords) {
      const t = new Date(r.time).getTime();
      if (!Number.isFinite(t) || t < windowStart || t > windowEnd) continue;
      let index = Math.floor((t - windowStart) / bucketDuration);
      if (index >= slotCount) index = slotCount - 1;
      if (index < 0) index = 0;

      buckets[index].total++;
      if (r.value < 0) {
        buckets[index].lost++;
      } else {
        buckets[index].validLatencies.push(Number(r.value));
      }
    }

    const slotList: PingSlot[] = buckets.map((b, idx) => {
      const start = Math.round(windowStart + idx * bucketDuration);
      const end = Math.round(start + bucketDuration);
      const timeStr = formatTimeSlot(start, end);

      if (b.total === 0) {
        return {
          key: `slot-${idx}`,
          slotStart: start,
          slotEnd: end,
          state: 'empty',
          totalCount: 0,
          lostCount: 0,
          avgLatency: null,
          title: `${timeStr} · 暂无探测数据`,
        };
      }

      const avg = b.validLatencies.length
        ? Math.round(b.validLatencies.reduce((sum, v) => sum + v, 0) / b.validLatencies.length)
        : null;

      let state: PingSlot['state'] = 'up';
      let statusDesc = '';

      if (b.lost === b.total) {
        state = 'down';
        statusDesc = `全部丢包 (${b.total}次超时)`;
      } else if (b.lost > 0) {
        state = 'degraded';
        const lossPercent = ((b.lost / b.total) * 100).toFixed(0);
        statusDesc = `丢包 ${lossPercent}% (${b.lost}/${b.total}次) · 均值 ${avg ?? '-'}ms`;
      } else {
        state = 'up';
        statusDesc = `畅通 (${b.total}次成功) · 均值 ${avg ?? '-'}ms`;
      }

      return {
        key: `slot-${idx}-${start}`,
        slotStart: start,
        slotEnd: end,
        state,
        totalCount: b.total,
        lostCount: b.lost,
        avgLatency: avg,
        title: `${timeStr} · ${statusDesc}`,
      };
    });

    // 智能填补正常采样周期内的微小插槽空隙（防止因固定步长离散切片造成虚假灰色缺口）
    for (let i = 1; i < slotList.length - 1; i++) {
      if (slotList[i].state === 'empty' && slotList[i - 1].state !== 'empty' && slotList[i + 1].state !== 'empty') {
        const gap = slotList[i + 1].slotStart - slotList[i - 1].slotEnd;
        if (gap < 15 * 60 * 1000) {
          slotList[i].state = slotList[i - 1].state;
          slotList[i].avgLatency = slotList[i - 1].avgLatency;
          const timeStr = formatTimeSlot(slotList[i].slotStart, slotList[i].slotEnd);
          slotList[i].title = `${timeStr} · 持续畅通 · 均值 ~${slotList[i].avgLatency ?? '-'}ms`;
        }
      }
    }

    const successRate = total > 0 ? (((total - lost) / total) * 100).toFixed(1) : null;

    return {
      slots: slotList,
      overallSuccessRate: successRate,
      totalPackets: total,
      lostPackets: lost,
    };
  }, [activeSeries, rangeHours, slotCount]);

  const showTooltip = (text: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    setTooltip({
      text,
      anchorX,
      anchorTop: rect.top,
      left: anchorX,
      top: Math.max(8, rect.top - 8),
      arrowLeft: 0,
    });
  };

  useLayoutEffect(() => {
    if (!tooltip) return;
    const element = tooltipRef.current;
    if (!element) return;

    const margin = 8;
    const rect = element.getBoundingClientRect();
    const halfWidth = rect.width / 2;
    const left = Math.min(
      Math.max(tooltip.anchorX, margin + halfWidth),
      window.innerWidth - margin - halfWidth,
    );
    const top = Math.max(margin, tooltip.anchorTop - rect.height - 8);
    const arrowLeft = Math.min(
      Math.max(tooltip.anchorX - (left - halfWidth), 8),
      Math.max(8, rect.width - 8),
    );

    if (
      Math.abs(left - tooltip.left) > 0.5 ||
      Math.abs(top - tooltip.top) > 0.5 ||
      Math.abs(arrowLeft - tooltip.arrowLeft) > 0.5
    ) {
      setTooltip({ ...tooltip, left, top, arrowLeft });
    }
  }, [tooltip]);

  if (slots.length === 0) return null;

  return (
    <div className="ping-heartbeat-box">
      <div className="ping-heartbeat-header">
        <div className="ping-heartbeat-title-group">
          <span className="ping-heartbeat-indicator-dot" />
          <span className="ping-heartbeat-title">网络连通性时间轴</span>
          <span className="ping-heartbeat-subtitle">({activeTaskName})</span>
        </div>
        <div className="ping-heartbeat-stats">
          {overallSuccessRate !== null ? (
            <span>
              健康度 <strong style={{ color: Number(overallSuccessRate) >= 99 ? 'var(--green-11)' : 'var(--amber-11)' }}>{overallSuccessRate}%</strong>
              <span style={{ color: 'var(--gray-9)', marginLeft: 6 }}>· 探测 {totalPackets}次</span>
              {lostPackets > 0 ? (
                <span style={{ color: 'var(--red-11)', marginLeft: 6 }}>({lostPackets}次丢包)</span>
              ) : (
                <span style={{ color: 'var(--gray-9)', marginLeft: 6 }}>(0丢包)</span>
              )}
            </span>
          ) : (
            <span>暂无采样</span>
          )}
        </div>
      </div>

      <div
        className="ping-heartbeat-bar"
        style={{ '--ping-segment-count': slots.length } as CSSProperties}
      >
        {slots.map((slot) => (
          <span
            key={slot.key}
            className={`ping-heartbeat-segment is-${slot.state}`}
            onMouseEnter={(e) => showTooltip(slot.title, e.currentTarget)}
            onMouseLeave={() => setTooltip(null)}
            onPointerEnter={(e) => showTooltip(slot.title, e.currentTarget)}
            onPointerLeave={() => setTooltip(null)}
            onClick={(e) => showTooltip(slot.title, e.currentTarget)}
            tabIndex={0}
            role="button"
            aria-label={slot.title}
          />
        ))}
      </div>

      <div className="ping-heartbeat-footer">
        <span>{rangeHours >= 24 ? `${Math.round(rangeHours / 24)}天前` : `${rangeHours}小时前`}</span>
        <span className="ping-heartbeat-hint">悬停小方块可查看时间切片状态</span>
        <span>刚刚</span>
      </div>

      {tooltip && (
        <div
          ref={tooltipRef}
          className="ping-heartbeat-tooltip"
          role="tooltip"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            '--heartbeat-tooltip-arrow-left': `${tooltip.arrowLeft}px`,
          } as CSSProperties}
        >
          {tooltip.text}
          <span className="ping-heartbeat-tooltip-arrow" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
