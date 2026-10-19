import React, { useMemo } from 'react';
import { Flex as RFlex, Card as RCard, Text as RText, Badge as RBadge, Heading as RHeading } from '@radix-ui/themes';
import { Radio } from 'lucide-react';
import type { PingTaskSeries, PingRecord } from '../utils/pingChart';

export type CarrierKey = 'all' | 'ct' | 'cu' | 'cm' | 'intl';

export function matchTaskCarrier(label: string, target = ''): CarrierKey {
  const text = `${label} ${target}`.toLowerCase();
  if (text.includes('电信') || text.includes('ct') || text.includes('163') || text.includes('cn2') || text.includes('chinatelecom') || text.includes('telecom')) {
    return 'ct';
  }
  if (text.includes('联通') || text.includes('cu') || text.includes('4837') || text.includes('9929') || text.includes('chinaunicom') || text.includes('unicom')) {
    return 'cu';
  }
  if (text.includes('移动') || text.includes('cm') || text.includes('cmi') || text.includes('cmin2') || text.includes('chinamobile')) {
    return 'cm';
  }
  return 'intl';
}

interface CarrierRadarProps {
  series: PingTaskSeries[];
  activeCarrier: CarrierKey;
  onSelectCarrier: (carrier: CarrierKey, taskIds: number[]) => void;
  activePingTaskId?: number | 'all';
}

export interface CarrierStat {
  key: CarrierKey;
  name: string;
  enName: string;
  brandColor: string;
  accentColor: string;
  taskIds: number[];
  taskCount: number;
  avgLatency: number | null;
  peakAvgLatency: number | null;
  lossRate: number;
  peakLossRate: number;
  jitter: number | null;
  rating: 'S' | 'A+' | 'A' | 'B' | 'C' | 'N/A';
  ratingLabel: string;
  ratingColor: 'green' | 'blue' | 'amber' | 'red' | 'gray';
  routeFeature: string;
}

// 运营商专属高精度品牌矢量 SVG 徽标
const CarrierLogos: Record<string, React.FC<{ size?: number }>> = {
  // 中国电信 China Telecom 官方天翼双环
  ct: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#005BAC" fillOpacity="0.12" stroke="#005BAC" strokeWidth="1.2" />
      <path
        d="M6 14C8.5 8.5 15.5 8 18 10C15 10.5 10 13 8.5 16C7.5 16.5 6.5 15.5 6 14Z"
        fill="#005BAC"
      />
      <path
        d="M9 10C11.5 5.5 16.5 5.5 18 7C15.5 8 12.5 10 11 12C10 11.5 9.5 10.5 9 10Z"
        fill="#0080FF"
      />
    </svg>
  ),

  // 中国联通 China Unicom 官方同心中国结
  cu: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#E60012" fillOpacity="0.12" stroke="#E60012" strokeWidth="1.2" />
      <rect x="7" y="7" width="10" height="10" rx="2" transform="rotate(45 12 12)" stroke="#E60012" strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="2.2" fill="#E60012" />
    </svg>
  ),

  // 中国移动 China Mobile 官方灵动半环
  cm: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#0085D0" fillOpacity="0.12" stroke="#0085D0" strokeWidth="1.2" />
      <path
        d="M7 13.5C7 9.5 10 7 14 7C17 7 18 8.5 18 8.5M17 10.5C17 14.5 14 17 10 17C7 17 6 15.5 6 15.5"
        stroke="#0085D0"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2" fill="#00A388" />
    </svg>
  ),

  // 国际骨干 / 教育科研 Global / CERNET
  intl: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#8B5CF6" fillOpacity="0.12" stroke="#8B5CF6" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="7" stroke="#8B5CF6" strokeWidth="1.2" fill="none" />
      <ellipse cx="12" cy="12" rx="3.5" ry="7" stroke="#8B5CF6" strokeWidth="1.2" fill="none" />
      <path d="M5 12H19" stroke="#8B5CF6" strokeWidth="1.2" />
    </svg>
  ),
};

export default function CarrierRadar({
  series,
  activeCarrier,
  onSelectCarrier,
  activePingTaskId,
}: CarrierRadarProps) {
  // 计算三网与国际骨干详细数据
  const carrierStats = useMemo(() => {
    return analyzeCarrierQuality(series);
  }, [series]);

  // 仅渲染实际配置了测速探针的分类，若只有三网则三列完美对称展示，绝不留空卡
  const displayStats = useMemo(() => {
    const withTasks = carrierStats.filter((c) => c.taskCount > 0);
    return withTasks.length > 0 ? withTasks : carrierStats;
  }, [carrierStats]);

  // 计算综合三网晚高峰健康指数
  const validCarriers = useMemo(() => carrierStats.filter((c) => c.taskCount > 0), [carrierStats]);
  const overallHealth = useMemo(() => {
    if (validCarriers.length === 0) return 100;
    const avgPeakLoss = validCarriers.reduce((acc, c) => acc + c.peakLossRate, 0) / validCarriers.length;
    return Math.max(0, Math.min(100, Math.round(100 - avgPeakLoss * 2.5)));
  }, [validCarriers]);

  // 🛡️ 所有 Hook 执行完毕后，才允许早退
  const hasValidData = validCarriers.length > 0;
  if (!hasValidData) return null;

  return (
    <RCard className="instance-carrier-radar-card" mb="4">
      {/* 头部标题与晚高峰状态看板 */}
      <RFlex justify="between" align="center" mb="3" wrap="wrap" gap="2" style={{ minWidth: 0, width: '100%' }}>
        <RFlex align="center" gap="2" wrap="wrap" style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
              border: '1px solid rgba(37, 99, 235, 0.35)',
              boxShadow: '0 0 10px rgba(37, 99, 235, 0.2)',
              flexShrink: 0,
            }}
          >
            <Radio size={16} color="var(--blue-9)" />
          </div>
          <RHeading size="3" weight="bold" style={{ wordBreak: 'break-word' }}>
            三网骨干晚高峰回程质量与丢包雷达
          </RHeading>
          <RBadge
            size="2"
            color={overallHealth >= 95 ? 'green' : overallHealth >= 80 ? 'blue' : 'amber'}
            variant="surface"
            style={{ borderRadius: 99, padding: '2px 10px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            晚高峰健康度: {overallHealth}%
          </RBadge>
        </RFlex>

        <RFlex align="center" gap="2" style={{ flexShrink: 0 }}>
          <RBadge size="1" color="gray" variant="soft" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            晚高峰时段: 20:00 - 24:00 CST · 点击卡片过滤折线
          </RBadge>
          {activeCarrier !== 'all' && (
            <button
              onClick={() => onSelectCarrier('all', [])}
              style={{
                cursor: 'pointer',
                background: 'var(--gray-a3)',
                border: '1px solid var(--gray-a5)',
                borderRadius: 6,
                padding: '2px 8px',
                fontSize: 11,
                color: 'var(--gray-11)',
                whiteSpace: 'nowrap',
              }}
            >
              ✕ 恢复全网
            </button>
          )}
        </RFlex>
      </RFlex>

      {/* 骨干运营商卡片网格 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          gap: 12,
          minWidth: 0,
          width: '100%',
        }}
      >
        {displayStats.map((stat) => {
          const isSelected =
            activeCarrier === stat.key ||
            (typeof activePingTaskId === 'number' && stat.taskIds.includes(activePingTaskId));
          const Logo = CarrierLogos[stat.key];
          const hasTasks = stat.taskCount > 0;

          return (
            <div
              key={stat.key}
              onClick={() => {
                if (!hasTasks) return;
                if (isSelected) {
                  onSelectCarrier('all', []);
                } else {
                  onSelectCarrier(stat.key, stat.taskIds);
                }
              }}
              className="instance-carrier-tile"
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: 12,
                cursor: hasTasks ? 'pointer' : 'default',
                background: isSelected ? 'var(--accent-a3)' : 'var(--gray-a2)',
                border: isSelected
                  ? `1.5px solid ${stat.brandColor}`
                  : '1px solid var(--gray-a4)',
                boxShadow: isSelected
                  ? `0 0 16px ${stat.brandColor}33, 0 4px 12px rgba(0, 0, 0, 0.08)`
                  : '0 2px 6px rgba(0, 0, 0, 0.02)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                opacity: hasTasks ? 1 : 0.65,
                minWidth: 0,
                maxWidth: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              {/* 顶部：Logo、名称与综合评级徽章 */}
              <RFlex justify="between" align="center" mb="2" wrap="wrap" gap="2" style={{ minWidth: 0, width: '100%' }}>
                <RFlex align="center" gap="2" style={{ minWidth: 0, flex: '1 1 auto' }}>
                  {Logo && <Logo size={24} />}
                  <div style={{ minWidth: 0 }}>
                    <RText size="2" weight="bold" style={{ letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {stat.name}
                    </RText>
                    <RText size="1" color="gray" style={{ fontSize: 10, display: 'block', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {stat.enName}
                    </RText>
                  </div>
                </RFlex>

                {hasTasks ? (
                  <RBadge
                    size="2"
                    color={stat.ratingColor}
                    variant="surface"
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      padding: '2px 8px',
                      borderRadius: 8,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      boxShadow: stat.rating === 'S' || stat.rating === 'A+'
                        ? `0 0 8px ${stat.brandColor}40`
                        : undefined,
                    }}
                  >
                    {stat.rating} 级
                  </RBadge>
                ) : (
                  <RBadge size="1" color="gray" variant="soft" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                    无探针
                  </RBadge>
                )}
              </RFlex>

              {/* 中间指标栏：时延与晚高峰丢包 */}
              {hasTasks ? (
                <div style={{ marginTop: 4, marginBottom: 8 }}>
                  {/* 延迟对比 */}
                  <RFlex justify="between" align="center" mb="1">
                    <RText size="1" color="gray" style={{ fontSize: 11 }}>
                      全天平均时延
                    </RText>
                    <RText size="2" weight="bold" style={{ fontFamily: 'monospace' }}>
                      {stat.avgLatency !== null ? `${stat.avgLatency} ms` : '-'}
                    </RText>
                  </RFlex>

                  {/* 晚高峰时延与膨胀 */}
                  <RFlex justify="between" align="center" mb="2">
                    <RText size="1" color="gray" style={{ fontSize: 11 }}>
                      晚高峰 (20-24h)
                    </RText>
                    <RFlex align="center" gap="1">
                      <RText
                        size="1"
                        weight="bold"
                        style={{
                          fontFamily: 'monospace',
                          color: stat.peakAvgLatency && stat.avgLatency && stat.peakAvgLatency > stat.avgLatency * 1.3
                            ? 'var(--amber-10)'
                            : 'inherit',
                        }}
                      >
                        {stat.peakAvgLatency !== null ? `${stat.peakAvgLatency} ms` : '平稳'}
                      </RText>
                      {stat.jitter !== null && (
                        <RText size="1" color="gray" style={{ fontSize: 10, opacity: 0.8 }}>
                          (抖动 ±{stat.jitter}ms)
                        </RText>
                      )}
                    </RFlex>
                  </RFlex>

                  {/* 晚高峰丢包率进度条 */}
                  <div>
                    <RFlex justify="between" align="center" mb="1">
                      <RText size="1" color="gray" style={{ fontSize: 11 }}>
                        晚高峰丢包率
                      </RText>
                      <RText
                        size="1"
                        weight="bold"
                        style={{
                          color: stat.peakLossRate === 0
                            ? 'var(--green-9)'
                            : stat.peakLossRate <= 3
                              ? 'var(--amber-9)'
                              : 'var(--red-9)',
                        }}
                      >
                        {stat.peakLossRate === 0 ? '0% 极佳' : `${stat.peakLossRate}%`}
                      </RText>
                    </RFlex>

                    {/* 自定义微型丢包条 */}
                    <div
                      style={{
                        width: '100%',
                        height: 5,
                        borderRadius: 3,
                        background: 'var(--gray-a4)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(stat.peakLossRate > 0 ? 8 : 0, stat.peakLossRate * 3.5))}%`,
                          height: '100%',
                          borderRadius: 3,
                          background: stat.peakLossRate === 0
                            ? 'var(--green-9)'
                            : stat.peakLossRate <= 3
                              ? 'var(--amber-9)'
                              : 'var(--red-9)',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 0', textAlign: 'center' }}>
                  <RText size="1" color="gray">
                    未分配属于该运营商的 Ping 节点
                  </RText>
                </div>
              )}

              {/* 底部线路推断与节点数 */}
              <RFlex
                justify="between"
                align="center"
                pt="2"
                style={{ borderTop: '1px solid var(--gray-a3)' }}
              >
                <RText
                  size="1"
                  color={stat.ratingColor === 'green' ? 'green' : 'gray'}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    maxWidth: 140,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={stat.routeFeature}
                >
                  {stat.routeFeature}
                </RText>

                <RFlex align="center" gap="1">
                  <RText size="1" color="gray" style={{ fontSize: 10 }}>
                    {stat.taskCount} 个探针
                  </RText>
                  {isSelected && (
                    <RBadge size="1" color="blue" variant="solid" style={{ fontSize: 9, padding: '0 4px' }}>
                      聚焦中
                    </RBadge>
                  )}
                </RFlex>
              </RFlex>
            </div>
          );
        })}
      </div>
    </RCard>
  );
}

// 核心分析函数：计算各运营商晚高峰指标与评级
function analyzeCarrierQuality(series: PingTaskSeries[]): CarrierStat[] {
  const configs: Array<{
    key: CarrierKey;
    name: string;
    enName: string;
    brandColor: string;
    accentColor: string;
    matcher: (label: string, target: string) => boolean;
  }> = [
    {
      key: 'ct',
      name: '中国电信',
      enName: 'China Telecom · 163 / CN2',
      brandColor: '#005BAC',
      accentColor: '#38BDF8',
      matcher: (l, t) => {
        const text = `${l} ${t}`.toLowerCase();
        return (
          text.includes('电信') ||
          text.includes('ct') ||
          text.includes('163') ||
          text.includes('cn2') ||
          text.includes('chinatelecom') ||
          text.includes('telecom')
        );
      },
    },
    {
      key: 'cu',
      name: '中国联通',
      enName: 'China Unicom · 4837 / 9929',
      brandColor: '#E60012',
      accentColor: '#F97316',
      matcher: (l, t) => {
        const text = `${l} ${t}`.toLowerCase();
        return (
          text.includes('联通') ||
          text.includes('cu') ||
          text.includes('4837') ||
          text.includes('9929') ||
          text.includes('chinaunicom') ||
          text.includes('unicom')
        );
      },
    },
    {
      key: 'cm',
      name: '中国移动',
      enName: 'China Mobile · CMI / CMIN2',
      brandColor: '#0085D0',
      accentColor: '#10B981',
      matcher: (l, t) => {
        const text = `${l} ${t}`.toLowerCase();
        return (
          text.includes('移动') ||
          text.includes('cm') ||
          text.includes('cmi') ||
          text.includes('cmin2') ||
          text.includes('chinamobile')
        );
      },
    },
    {
      key: 'intl',
      name: '国际与教育科研',
      enName: 'Global / CERNET / BGP',
      brandColor: '#8B5CF6',
      accentColor: '#A855F7',
      matcher: () => true, // fallback
    },
  ];

  // 预归类
  const carrierItemsMap = new Map<CarrierKey, PingTaskSeries[]>();
  carrierItemsMap.set('ct', []);
  carrierItemsMap.set('cu', []);
  carrierItemsMap.set('cm', []);
  carrierItemsMap.set('intl', []);

  for (const item of series) {
    const l = item.task.label || '';
    const t = item.task.target || '';
    if (configs[0].matcher(l, t)) {
      carrierItemsMap.get('ct')!.push(item);
    } else if (configs[1].matcher(l, t)) {
      carrierItemsMap.get('cu')!.push(item);
    } else if (configs[2].matcher(l, t)) {
      carrierItemsMap.get('cm')!.push(item);
    } else {
      carrierItemsMap.get('intl')!.push(item);
    }
  }

  return configs.map((cfg) => {
    const matchedSeries = carrierItemsMap.get(cfg.key) || [];
    const taskIds = matchedSeries.map((s) => s.task.id);
    const allRecords: PingRecord[] = [];
    const peakRecords: PingRecord[] = [];

    matchedSeries.forEach((s) => {
      s.records.forEach((r) => {
        allRecords.push(r);
        const dt = new Date(r.time);
        if (!Number.isNaN(dt.getTime())) {
          // CST (UTC+8) 小时判断
          const cstHours = new Date(dt.getTime() + 8 * 3600000).getUTCHours();
          if (cstHours >= 20 && cstHours < 24) {
            peakRecords.push(r);
          }
        }
      });
    });

    if (matchedSeries.length === 0 || allRecords.length === 0) {
      return {
        key: cfg.key,
        name: cfg.name,
        enName: cfg.enName,
        brandColor: cfg.brandColor,
        accentColor: cfg.accentColor,
        taskIds: [],
        taskCount: matchedSeries.length,
        avgLatency: null,
        peakAvgLatency: null,
        lossRate: 0,
        peakLossRate: 0,
        jitter: null,
        rating: 'N/A',
        ratingLabel: '暂无数据',
        ratingColor: 'gray',
        routeFeature: '未部署该线路探针',
      };
    }

    // 计算全天时延与丢包
    let validSum = 0;
    let validCount = 0;
    let lostCount = 0;
    const sortedValids: number[] = [];

    allRecords.forEach((r) => {
      const v = Number(r.value);
      if (v < 0) {
        lostCount++;
      } else if (Number.isFinite(v)) {
        validCount++;
        validSum += v;
        sortedValids.push(v);
      }
    });

    const totalPackets = validCount + lostCount;
    const lossRate = totalPackets > 0 ? Number(((lostCount / totalPackets) * 100).toFixed(1)) : 0;
    const avgLatency = validCount > 0 ? Math.round(validSum / validCount) : null;

    // 计算晚高峰时延与丢包
    let peakValidSum = 0;
    let peakValidCount = 0;
    let peakLostCount = 0;

    peakRecords.forEach((r) => {
      const v = Number(r.value);
      if (v < 0) {
        peakLostCount++;
      } else if (Number.isFinite(v)) {
        peakValidCount++;
        peakValidSum += v;
      }
    });

    const peakTotal = peakValidCount + peakLostCount;
    // 若当前时间段内还没有 20-24 点晚高峰采样点，则以总体丢包作为基准
    const peakLossRate = peakTotal > 0
      ? Number(((peakLostCount / peakTotal) * 100).toFixed(1))
      : lossRate;
    const peakAvgLatency = peakValidCount > 0
      ? Math.round(peakValidSum / peakValidCount)
      : avgLatency;

    // 计算相邻抖动 Jitter
    let jitterSum = 0;
    let jitterCount = 0;
    for (let i = 1; i < sortedValids.length; i++) {
      jitterSum += Math.abs(sortedValids[i] - sortedValids[i - 1]);
      jitterCount++;
    }
    const jitter = jitterCount > 0 ? Math.round(jitterSum / jitterCount) : null;

    // 综合网络评级与线路推断
    let rating: 'S' | 'A+' | 'A' | 'B' | 'C' = 'A';
    let ratingLabel = '良好';
    let ratingColor: 'green' | 'blue' | 'amber' | 'red' | 'gray' = 'green';
    let routeFeature = '骨干直连通畅';

    if (peakLossRate === 0 && (avgLatency === null || avgLatency < 90) && (jitter === null || jitter < 8)) {
      rating = 'S';
      ratingLabel = '极速';
      ratingColor = 'green';
      routeFeature = '精品网 · 晚高峰 0 丢包';
    } else if (peakLossRate <= 2 && (avgLatency === null || avgLatency < 160)) {
      rating = 'A+';
      ratingLabel = '优质';
      ratingColor = 'blue';
      routeFeature = '优化直连 · 晚高峰极稳';
    } else if (peakLossRate <= 5) {
      rating = 'A';
      ratingLabel = '通畅';
      ratingColor = 'green';
      routeFeature = '常规直连 · 表现良好';
    } else if (peakLossRate <= 18) {
      rating = 'B';
      ratingLabel = '拥塞';
      ratingColor = 'amber';
      routeFeature = '晚高峰 QoS 轻度拥堵';
    } else {
      rating = 'C';
      ratingLabel = '严重';
      ratingColor = 'red';
      routeFeature = '晚高峰严重丢包';
    }

    return {
      key: cfg.key,
      name: cfg.name,
      enName: cfg.enName,
      brandColor: cfg.brandColor,
      accentColor: cfg.accentColor,
      taskIds,
      taskCount: matchedSeries.length,
      avgLatency,
      peakAvgLatency,
      lossRate,
      peakLossRate,
      jitter,
      rating,
      ratingLabel,
      ratingColor,
      routeFeature,
    };
  });
}
