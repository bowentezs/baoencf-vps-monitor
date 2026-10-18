import { Badge, Box, Button, Card, Flex, SegmentedControl, Separator, Text } from '@radix-ui/themes';
import { CalendarClock, Wallet, X } from 'lucide-react';
import { BillingSummary, formatBillingCycle } from '../../utils/billing';

interface BillingOverviewCardProps {
  summary: BillingSummary;
  currency: string;
  onCurrencyChange: (c: string) => void;
  onClose: () => void;
}

const SUPPORTED_CURRENCIES = [
  { label: '¥ 人民币', value: '¥' },
  { label: '$ 美元', value: '$' },
  { label: '€ 欧元', value: '€' },
  { label: '£ 英镑', value: '£' },
  { label: 'HK$ 港币', value: 'HK$' },
];

export default function BillingOverviewCard({
  summary,
  currency,
  onCurrencyChange,
  onClose,
}: BillingOverviewCardProps) {
  const { monthlyTotal, annualTotal, paidCount, freeCount, expiringSoon } = summary;

  return (
    <Card className="billing-overview-card" style={{ marginBottom: 12, padding: 16 }}>
      {/* Top Header */}
      <Flex justify="between" align="center" wrap="wrap" gap="2" mb="3">
        <Flex align="center" gap="2">
          <Wallet size={20} color="var(--accent-9)" />
          <Text size="3" weight="bold">财务开销总盘与续费日历</Text>
          <Badge variant="soft" color="blue">
            {paidCount} 台计费 · {freeCount} 台免费/长期
          </Badge>
        </Flex>

        <Flex align="center" gap="2">
          <SegmentedControl.Root size="1" value={currency} onValueChange={onCurrencyChange}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <SegmentedControl.Item key={c.value} value={c.value}>
                {c.label}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
          <Button variant="ghost" size="1" color="gray" onClick={onClose} title="收起开销看板">
            <X size={16} />
          </Button>
        </Flex>
      </Flex>

      {/* Metric Tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Box style={{ background: 'var(--gray-a2)', padding: '12px 16px', borderRadius: 8 }}>
          <Text size="1" color="gray" as="p">月度均摊支出 (折算)</Text>
          <Text size="5" weight="bold" style={{ color: 'var(--accent-9)' }}>
            {currency} {monthlyTotal.toFixed(2)}
            <Text size="2" weight="regular" color="gray"> / 月</Text>
          </Text>
          <Text size="1" color="gray" as="p" mt="1">
            平摊所有月/季/年/三年付小鸡
          </Text>
        </Box>

        <Box style={{ background: 'var(--gray-a2)', padding: '12px 16px', borderRadius: 8 }}>
          <Text size="1" color="gray" as="p">年度总开销预计</Text>
          <Text size="5" weight="bold" style={{ color: 'var(--green-9)' }}>
            {currency} {annualTotal.toFixed(2)}
            <Text size="2" weight="regular" color="gray"> / 年</Text>
          </Text>
          <Text size="1" color="gray" as="p" mt="1">
            按当前计费周期折算 12 个月
          </Text>
        </Box>

        <Box style={{ background: 'var(--gray-a2)', padding: '12px 16px', borderRadius: 8 }}>
          <Text size="1" color="gray" as="p">即将到期服务器 (90天内)</Text>
          <Text size="5" weight="bold" style={{ color: expiringSoon.filter(s => s.diffDays <= 30).length > 0 ? 'var(--amber-9)' : 'var(--gray-12)' }}>
            {expiringSoon.filter(s => s.diffDays <= 90).length}
            <Text size="2" weight="regular" color="gray"> 台</Text>
          </Text>
          <Text size="1" color="gray" as="p" mt="1">
            其中 30 天内到期: {expiringSoon.filter(s => s.diffDays <= 30).length} 台
          </Text>
        </Box>
      </div>

      <Separator size="4" mb="3" />

      {/* Renewal Timeline Section */}
      <Flex align="center" gap="2" mb="2">
        <CalendarClock size={16} color="var(--accent-9)" />
        <Text size="2" weight="bold">续费倒计时时间线 (按到期日升序)</Text>
      </Flex>

      {expiringSoon.length === 0 ? (
        <Flex justify="center" align="center" py="4">
          <Text size="2" color="gray">当前暂无设置到期时间的付费服务器</Text>
        </Flex>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {expiringSoon.map((item) => {
            const isExpired = item.diffDays <= 0;
            const isUrgent = item.diffDays > 0 && item.diffDays <= 7;
            const isSoon = item.diffDays > 7 && item.diffDays <= 30;

            const badgeColor = isExpired ? 'red' : isUrgent ? 'red' : isSoon ? 'amber' : 'green';
            const badgeVariant = isExpired || isUrgent ? 'solid' : 'soft';

            const cycleLabel = formatBillingCycle(item.billingCycle);

            return (
              <Flex
                key={item.uuid}
                align="center"
                justify="between"
                wrap="wrap"
                gap="2"
                style={{
                  background: isUrgent ? 'var(--red-a2)' : 'var(--gray-a2)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: isUrgent ? '1px solid var(--red-6)' : '1px solid var(--gray-4)',
                }}
              >
                <Flex align="center" gap="2" style={{ minWidth: 160 }}>
                  <Text size="2" weight="bold">{item.name}</Text>
                  <Badge size="1" variant="outline" color="gray">{item.group}</Badge>
                </Flex>

                <Flex align="center" gap="3" wrap="wrap">
                  <Text size="1" color="gray">
                    到期日: {item.expiredAt.slice(0, 10)}
                  </Text>

                  <Badge size="1" color={badgeColor} variant={badgeVariant}>
                    {isExpired ? '已到期' : `剩 ${item.diffDays} 天`}
                  </Badge>

                  <Text size="2" weight="medium">
                    {item.currency} {item.price}
                    {cycleLabel ? ` / ${cycleLabel}` : ''}
                  </Text>

                  <Text size="1" color="gray">
                    (约 {currency} {item.monthlyEquivalent.toFixed(1)}/月)
                  </Text>

                  {item.autoRenewal ? (
                    <Badge size="1" color="green" variant="soft">自动续费</Badge>
                  ) : (
                    <Badge size="1" color="gray" variant="soft">手动续费</Badge>
                  )}
                </Flex>
              </Flex>
            );
          })}
        </div>
      )}
    </Card>
  );
}
