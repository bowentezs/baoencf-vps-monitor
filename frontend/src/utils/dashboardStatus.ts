import { formatBytes, formatSpeed } from './format.ts';

export const defaultStatusCardVisibility = {
  currentOnline: true,
  regionOverview: true,
  trafficOverview: true,
  networkSpeed: true,
} as const;

export type StatusCardKey = keyof typeof defaultStatusCardVisibility;

export interface DashboardStatusInput {
  onlineCount: number;
  totalCount: number;
  regionCount: number;
  totalUp: number;
  totalDown: number;
  totalSpeedUp: number;
  totalSpeedDown: number;
}

export interface DashboardStatusCard {
  key: StatusCardKey;
  title: string;
  value: string;
  detail: string;
  oneLine?: boolean;
  inlineValues?: string[];
}

export function buildDashboardStatusCards(input: DashboardStatusInput, liveAvailable = true): DashboardStatusCard[] {
  const trafficValues = [`↑ ${formatBytes(input.totalUp)}`, `↓ ${formatBytes(input.totalDown)}`];
  const speedValues = [`↑ ${formatSpeed(input.totalSpeedUp)}`, `↓ ${formatSpeed(input.totalSpeedDown)}`];

  return [
    {
      key: 'currentOnline',
      title: '当前在线',
      value: liveAvailable ? `${input.onlineCount} / ${input.totalCount}` : `-- / ${input.totalCount}`,
      detail: liveAvailable ? '在线节点 / 全部节点' : '实时状态暂不可用',
      oneLine: true,
    },
    {
      key: 'regionOverview',
      title: '点亮地区',
      value: liveAvailable ? String(input.regionCount) : '--',
      detail: liveAvailable ? '当前在线地区数' : '实时状态暂不可用',
      oneLine: true,
    },
    {
      key: 'trafficOverview',
      title: '流量概览',
      value: liveAvailable ? trafficValues.join('  ') : '暂不可用',
      detail: liveAvailable ? '累计上传 / 下载' : '实时状态暂不可用',
      inlineValues: liveAvailable ? trafficValues : ['暂不可用'],
      oneLine: true,
    },
    {
      key: 'networkSpeed',
      title: '网络速率',
      value: liveAvailable ? speedValues.join('  ') : '暂不可用',
      detail: liveAvailable ? '实时上传 / 下载' : '实时状态暂不可用',
      inlineValues: liveAvailable ? speedValues : ['暂不可用'],
      oneLine: true,
    },
  ];
}
