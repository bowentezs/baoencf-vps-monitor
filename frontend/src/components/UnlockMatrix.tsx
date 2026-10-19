import React from 'react';
import { Flex, Card, Text, Badge, Heading } from '@radix-ui/themes';
import { Sparkles, Film, Bot, ShieldAlert, CheckCircle2 } from 'lucide-react';
import Flag from './Flag';
import type { UnlockItem } from '../contexts/LiveDataContext';

interface UnlockMatrixProps {
  items: UnlockItem[];
  compact?: boolean;
}

// 官方高精度品牌 SVG 矢量图标
const PlatformLogos: Record<string, React.FC<{ size?: number }>> = {
  // OpenAI / ChatGPT 官方经典旋涡花纹
  ChatGPT: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.259 24a6.0557 6.0557 0 0 0 5.7718-4.2057 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7466-7.0732z"
        fill="#10A37F"
      />
      <path
        d="M13.259 22.428a4.5028 4.5028 0 0 1-2.9239-1.0772l.1423-.0807 4.8624-2.808a.784.784 0 0 0 .3944-.684v-6.855l2.062 1.1924a.0665.0665 0 0 1 .038.0522v5.6968a4.517 4.517 0 0 1-4.5752 4.5635zm-8.8687-3.9482a4.4933 4.4933 0 0 1-.5369-3.1027l.1425.0855 4.8624 2.808a.7983.7983 0 0 0 .7887 0l5.9388-3.4283v2.3848a.0665.0665 0 0 1-.0285.057l-4.9337 2.846a4.5123 4.5123 0 0 1-6.2333-1.6503zm-1.8055-9.351a4.5076 4.5076 0 0 1 2.387-2.0255v5.7728a.7793.7793 0 0 0 .3943.684l5.9389 3.4283-2.062 1.1924a.0665.0665 0 0 1-.0665 0l-4.9337-2.846a4.5123 4.5123 0 0 1-1.658-6.206zm13.7986 2.8888-5.9388-3.4283 2.062-1.1924a.0665.0665 0 0 1 .0665 0l4.9337 2.846a4.5123 4.5123 0 0 1 1.658 6.206 4.5076 4.5076 0 0 1-2.387 2.0255v-5.7728a.7793.7793 0 0 0-.3944-.684zm2.7463-3.6967l-.1424-.0855-4.8625-2.808a.7983.7983 0 0 0-.7887 0l-5.9388 3.4283v-2.3848a.0665.0665 0 0 1 .0285-.057l4.9337-2.846a4.5123 4.5123 0 0 1 6.2333 1.6503 4.4933 4.4933 0 0 1 .5369 3.1027zm-11.3934 4.595l-2.062-1.1924a.0665.0665 0 0 1-.038-.0522v-5.6968a4.517 4.517 0 0 1 4.5752-4.5635 4.5028 4.5028 0 0 1 2.9239 1.0772l-.1423.0807-4.8624 2.808a.784.784 0 0 0-.3944.684v6.855zm1.5394-1.3968l2.6037-1.5032 2.6037 1.5032v3.0064l-2.6037 1.5032-2.6037-1.5032z"
        fill="#ffffff"
      />
    </svg>
  ),

  // Anthropic Claude 官方星火火花 (Spark)
  Claude: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#D97757" />
      <path
        d="M12 4.5C12.4 8.5 15.5 11.6 19.5 12C15.5 12.4 12.4 15.5 12 19.5C11.6 15.5 8.5 12.4 4.5 12C8.5 11.6 11.6 8.5 12 4.5Z"
        fill="#FFFFFF"
      />
      <circle cx="12" cy="12" r="1.5" fill="#D97757" />
    </svg>
  ),

  // Google Gemini 官方极光星芒
  Gemini: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="geminiGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1BA1E2" />
          <stop offset="0.5" stopColor="#4285F4" />
          <stop offset="1" stopColor="#9B51E0" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#geminiGrad)" />
      <path
        d="M12 4C12.5 8.2 15.8 11.5 20 12C15.8 12.5 12.5 15.8 12 20C11.5 15.8 8.2 12.5 4 12C8.2 11.5 11.5 8.2 12 4Z"
        fill="#FFFFFF"
      />
    </svg>
  ),

  // Netflix 经典红色 N 飘带
  Netflix: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#141414" />
      <path d="M6.5 4H9.5V20H6.5V4Z" fill="#E50914" />
      <path d="M14.5 4H17.5V20H14.5V4Z" fill="#E50914" />
      <path d="M6.5 4L17.5 20H14.5L6.5 7.5V4Z" fill="#B81D24" />
      <path d="M6.5 4L16.5 20H14.5L6.5 6V4Z" fill="#E50914" opacity="0.9" />
    </svg>
  ),

  // YouTube / YouTube Premium 官方红底播放键
  YouTube: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#FF0000" />
      <path
        d="M20.5 8.8C20.3 8.1 19.7 7.5 19 7.3 17.7 7 12 7 12 7s-5.7 0-7 .3c-.7.2-1.3.8-1.5 1.5C3.2 10.1 3.2 12 3.2 12s0 1.9.3 3.2c.2.7.8 1.3 1.5 1.5 1.3.3 7 .3 7 .3s5.7 0 7-.3c.7-.2 1.3-.8 1.5-1.5.3-1.3.3-3.2.3-3.2s0-1.9-.3-3.2z"
        fill="#FF0000"
      />
      <polygon points="10.2,14.7 15,12 10.2,9.3" fill="#FFFFFF" />
    </svg>
  ),
};

const RegionNameMap: Record<string, string> = {
  US: '美国',
  SG: '新加坡',
  JP: '日本',
  HK: '中国香港',
  TW: '中国台湾',
  GB: '英国',
  DE: '德国',
  FR: '法国',
  KR: '韩国',
  NL: '荷兰',
  CA: '加拿大',
  AU: '澳大利亚',
  IN: '印度',
  MY: '马来西亚',
  TH: '泰国',
  VN: '越南',
  ID: '印尼',
  PH: '菲律宾',
  TR: '土耳其',
  AR: '阿根廷',
};

const AI_PLATFORMS = new Set(['ChatGPT', 'Claude', 'Gemini', 'OpenAI', 'Copilot', 'Midjourney']);

export default function UnlockMatrix({ items, compact = false }: UnlockMatrixProps) {
  if (!items || items.length === 0) return null;

  const totalCount = items.length;
  const unlockedCount = items.filter((i) => i.status === 'yes' || i.status === 'full').length;
  const originalOnlyCount = items.filter((i) => i.status === 'original_only').length;
  const isAllUnlocked = unlockedCount === totalCount;
  const unlockRate = Math.round((unlockedCount / totalCount) * 100);

  // 区分 AI 专区 与 流媒体影音专区
  const aiItems = items.filter((i) => AI_PLATFORMS.has(i.platform));
  const mediaItems = items.filter((i) => !AI_PLATFORMS.has(i.platform));

  // 顶部精简摘要条（用于卡片上方或头部紧凑位置）
  if (compact) {
    return (
      <Flex align="center" gap="2" wrap="wrap">
        {items.map((item) => {
          const isYes = item.status === 'yes' || item.status === 'full';
          const isOrig = item.status === 'original_only';
          const badgeColor = isYes ? 'green' : isOrig ? 'amber' : 'gray';
          const LogoComponent = PlatformLogos[item.platform];

          return (
            <Badge
              key={item.platform}
              size="1"
              variant={isYes ? 'surface' : 'soft'}
              color={badgeColor}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 99,
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {LogoComponent ? (
                <LogoComponent size={13} />
              ) : (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isYes ? 'var(--green-9)' : isOrig ? 'var(--amber-9)' : 'var(--gray-8)',
                  }}
                />
              )}
              <span>{item.platform}</span>
              {item.region && <Flag region={item.region} size={13} />}
              <span>
                {isOrig ? '自制' : isYes ? (item.status === 'full' ? '完全' : '支持') : '阻断'}
              </span>
            </Badge>
          );
        })}
      </Flex>
    );
  }

  // 完整渲染大卡片
  return (
    <Card className="instance-unlock-card" mb="4">
      {/* 标题栏与综合评级胶囊 */}
      <Flex justify="between" align="center" mb="3" wrap="wrap" gap="2" style={{ minWidth: 0, width: '100%' }}>
        <Flex align="center" gap="2" wrap="wrap" style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              boxShadow: '0 0 10px rgba(168, 85, 247, 0.25)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={16} color="var(--purple-9)" />
          </div>
          <Heading size="3" weight="bold" style={{ wordBreak: 'break-word' }}>
            AI 与全球流媒体原生解锁矩阵
          </Heading>
          <Badge
            size="2"
            color={isAllUnlocked ? 'green' : originalOnlyCount > 0 ? 'amber' : 'purple'}
            variant="surface"
            style={{
              borderRadius: 99,
              padding: '2px 10px',
              fontWeight: 700,
              boxShadow: isAllUnlocked ? '0 0 10px rgba(16, 185, 129, 0.25)' : undefined,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isAllUnlocked ? '#10B981' : '#A855F7',
                marginRight: 4,
                boxShadow: isAllUnlocked ? '0 0 6px #10B981' : undefined,
              }}
            />
            {unlockedCount} / {totalCount} 项点亮 ({unlockRate}%)
          </Badge>
        </Flex>

        <Flex align="center" gap="2" style={{ flexShrink: 0 }}>
          <Badge size="1" color="gray" variant="soft" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            出口网络纯净度检测 · 每 30 分钟轮询
          </Badge>
        </Flex>
      </Flex>

      {/* 专区分类排列 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, width: '100%' }}>
        {/* 1. 前沿大模型生态专区 */}
        {aiItems.length > 0 && (
          <div style={{ minWidth: 0, width: '100%' }}>
            <Flex align="center" gap="2" mb="2" wrap="wrap">
              <Bot size={14} color="var(--purple-9)" />
              <Text size="1" weight="bold" color="gray" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                前沿 AI 大模型原生接入
              </Text>
            </Flex>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                gap: 10,
                minWidth: 0,
                width: '100%',
              }}
            >
              {aiItems.map((item) => renderUnlockTile(item))}
            </div>
          </div>
        )}

        {/* 2. 全球顶级流媒体影音专区 */}
        {mediaItems.length > 0 && (
          <div style={{ minWidth: 0, width: '100%' }}>
            <Flex align="center" gap="2" mb="2" wrap="wrap">
              <Film size={14} color="var(--red-9)" />
              <Text size="1" weight="bold" color="gray" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                全球影音流媒体矩阵
              </Text>
            </Flex>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                gap: 10,
                minWidth: 0,
                width: '100%',
              }}
            >
              {mediaItems.map((item) => renderUnlockTile(item))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// 渲染单个微晶毛玻璃卡片
function renderUnlockTile(item: UnlockItem) {
  const isYes = item.status === 'yes' || item.status === 'full';
  const isOrig = item.status === 'original_only';
  const isBlocked = !isYes && !isOrig;

  const statusColor: 'green' | 'amber' | 'red' | 'gray' = isYes ? 'green' : isOrig ? 'amber' : 'red';
  const Logo = PlatformLogos[item.platform];
  const regionCn = item.region ? RegionNameMap[item.region.toUpperCase()] : '';

  // 状态胶囊主副标题
  const statusBadge = isOrig
    ? '仅自制剧'
    : isYes
      ? item.status === 'full'
        ? '原生完整解锁'
        : '原生直通'
      : '访问受限 / 阻断';

  // 状态发光点样式
  const dotColor = isYes ? '#10B981' : isOrig ? '#F59E0B' : '#EF4444';
  const dotGlow = isYes
    ? '0 0 8px rgba(16, 185, 129, 0.7)'
    : isOrig
      ? '0 0 8px rgba(245, 158, 11, 0.7)'
      : 'none';

  return (
    <div
      key={item.platform}
      className="instance-unlock-tile"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 82,
        minWidth: 0,
        maxWidth: '100%',
        padding: '12px 14px',
        borderRadius: 12,
        boxSizing: 'border-box',
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* 顶部：品牌 Logo + 平台名 + 状态 Badge */}
      <Flex justify="between" align="center" mb="2" wrap="wrap" gap="2" style={{ minWidth: 0, width: '100%' }}>
        <Flex align="center" gap="2" style={{ minWidth: 0, flex: '1 1 auto' }}>
          {Logo ? (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              <Logo size={22} />
            </div>
          ) : (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: 'var(--gray-4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Sparkles size={14} color="var(--gray-11)" />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <Text size="2" weight="bold" style={{ letterSpacing: -0.2, lineHeight: 1.2, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.platform}
            </Text>
            {item.platform === 'ChatGPT' && (
              <Text size="1" color="gray" style={{ fontSize: 10, display: 'block', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                OpenAI GPT-4o / O1
              </Text>
            )}
            {item.platform === 'Claude' && (
              <Text size="1" color="gray" style={{ fontSize: 10, display: 'block', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Claude 3.5 Sonnet
              </Text>
            )}
            {item.platform === 'Gemini' && (
              <Text size="1" color="gray" style={{ fontSize: 10, display: 'block', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Google 1.5 Pro
              </Text>
            )}
            {item.platform === 'Netflix' && (
              <Text size="1" color="gray" style={{ fontSize: 10, display: 'block', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                全球电影 / 电视剧集
              </Text>
            )}
            {item.platform === 'YouTube' && (
              <Text size="1" color="gray" style={{ fontSize: 10, display: 'block', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                YouTube Premium
              </Text>
            )}
          </div>
        </Flex>

        <Badge
          size="1"
          color={statusColor}
          variant="surface"
          style={{
            fontWeight: 700,
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dotColor,
              display: 'inline-block',
              marginRight: 5,
              boxShadow: dotGlow,
            }}
          />
          {statusBadge}
        </Badge>
      </Flex>

      {/* 底部：属地国旗与详细说明 */}
      <Flex justify="between" align="center" pt="1" wrap="wrap" gap="1" style={{ borderTop: '1px solid var(--gray-a3)', minWidth: 0, width: '100%' }}>
        <Flex align="center" gap="1" style={{ minWidth: 0 }}>
          {item.region ? (
            <>
              <Flag region={item.region} size={15} />
              <Text size="1" weight="medium" style={{ fontSize: 11, color: 'var(--gray-11)', whiteSpace: 'nowrap' }}>
                {regionCn ? `${regionCn} (${item.region.toUpperCase()})` : item.region.toUpperCase()}
              </Text>
            </>
          ) : isYes ? (
            <Flex align="center" gap="1">
              <CheckCircle2 size={12} color="var(--green-9)" style={{ flexShrink: 0 }} />
              <Text size="1" color="gray" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                原生直连支持
              </Text>
            </Flex>
          ) : (
            <Flex align="center" gap="1">
              <ShieldAlert size={12} color="var(--red-9)" style={{ flexShrink: 0 }} />
              <Text size="1" color="gray" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                出口受限
              </Text>
            </Flex>
          )}
        </Flex>

        {item.detail ? (
          <Text
            size="1"
            color="gray"
            style={{
              fontSize: 10,
              maxWidth: 130,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'monospace',
              opacity: 0.85,
            }}
            title={item.detail}
          >
            {item.detail}
          </Text>
        ) : isBlocked ? (
          <Text size="1" color="red" style={{ fontSize: 10, opacity: 0.85, whiteSpace: 'nowrap' }}>
            WAF / 地区未开放
          </Text>
        ) : (
          <Text size="1" color="gray" style={{ fontSize: 10, opacity: 0.7, whiteSpace: 'nowrap' }}>
            已就绪
          </Text>
        )}
      </Flex>
    </div>
  );
}
