export const COMMON_CURRENCIES = [
  { symbol: '¥', name: '人民币' },
  { symbol: '$', name: '美元' },
  { symbol: '€', name: '欧元' },
  { symbol: '£', name: '英镑' },
  { symbol: '₩', name: '韩元' },
  { symbol: '₽', name: '卢布' },
  { symbol: '₣', name: '法郎' },
  { symbol: '₹', name: '印度卢比' },
  { symbol: '₫', name: '越南盾' },
  { symbol: '฿', name: '泰铢' },
  { symbol: '₺', name: '土耳其里拉' },
] as const;

export const BILLING_CYCLE_OPTIONS = [
  { label: '天', value: 1 },
  { label: '周', value: 7 },
  { label: '月', value: 30 },
  { label: '季', value: 92 },
  { label: '半年', value: 184 },
  { label: '年', value: 365 },
  { label: '三年', value: 1095 },
  { label: '一次性', value: -1 },
] as const;

export function formatBillingCycle(cycle?: number): string {
  const value = Number(cycle);
  if (!Number.isFinite(value) || value === 0) return '';
  if (value === -1) return '一次性';
  if (value === 1) return '天';
  if (value === 7) return '周';
  if (value >= 27 && value <= 32) return '月';
  if (value >= 87 && value <= 95) return '季';
  if (value >= 175 && value <= 185) return '半年';
  if (value >= 360 && value <= 370) return '年';
  if (value >= 720 && value <= 750) return '两年';
  if (value >= 1080 && value <= 1150) return '三年';
  if (value >= 1800 && value <= 1850) return '五年';
  return `${value}天`;
}

export function getExpiryInfo(expired_at?: string | number, nowMs = Date.now()): { label: string; color: string } {
  if (!expired_at) return { label: '', color: 'gray' };
  const expiredTime = new Date(expired_at).getTime();
  if (!Number.isFinite(expiredTime)) return { label: '', color: 'gray' };

  const diffDays = Math.ceil((expiredTime - nowMs) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { label: '已到期', color: 'red' };
  if (diffDays > 36500) return { label: '长期', color: 'green' };
  if (diffDays > 30) return { label: `剩 ${diffDays}天`, color: 'green' };
  if (diffDays >= 7) return { label: `剩 ${diffDays}天`, color: 'yellow' };
  return { label: `剩 ${diffDays}天`, color: 'red' };
}

export function getLongTermDateValue(): string {
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 200);
  return futureDate.toISOString().slice(0, 10);
}

export function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function isValidDisplayPrice(price: number): boolean {
  return Number.isFinite(price) && (price >= 0 || price === -1);
}

export const EXCHANGE_RATES_TO_USD: Record<string, number> = {
  '$': 1.0,
  'USD': 1.0,
  '¥': 7.20,
  'CNY': 7.20,
  'RMB': 7.20,
  '€': 0.92,
  'EUR': 0.92,
  '£': 0.78,
  'GBP': 0.78,
  'HK$': 7.82,
  'HKD': 7.82,
  '₩': 1380.0,
  'KRW': 1380.0,
  '₽': 92.0,
  'RUB': 92.0,
  '₣': 0.88,
  'CHF': 0.88,
  '₹': 83.5,
  'INR': 83.5,
  '₫': 25400.0,
  'VND': 25400.0,
  '฿': 36.5,
  'THB': 36.5,
  '₺': 34.0,
  'TRY': 34.0,
};

export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const fromClean = (fromCurrency || '$').trim();
  const toClean = (toCurrency || '¥').trim();
  if (fromClean === toClean) return amount;

  const rateFrom = EXCHANGE_RATES_TO_USD[fromClean] || 1.0;
  const rateTo = EXCHANGE_RATES_TO_USD[toClean] || 1.0;

  const usd = amount / rateFrom;
  return usd * rateTo;
}

export function calculateMonthlyCost(price: number, billingCycle: number): number {
  if (!Number.isFinite(price) || price <= 0 || billingCycle <= 0) return 0;
  return price * (30 / billingCycle);
}

export interface ExpiringServerItem {
  uuid: string;
  name: string;
  group: string;
  price: number;
  currency: string;
  billingCycle: number;
  expiredAt: string;
  diffDays: number;
  autoRenewal: boolean;
  monthlyEquivalent: number;
}

export interface BillingSummary {
  monthlyTotal: number;
  annualTotal: number;
  paidCount: number;
  freeCount: number;
  targetCurrency: string;
  expiringSoon: ExpiringServerItem[];
}

export function computeBillingSummary(
  clients: Array<{
    uuid: string;
    name: string;
    group?: string;
    price?: number;
    currency?: string;
    billing_cycle?: number;
    expired_at?: string | null;
    auto_renewal?: boolean | number;
  }>,
  targetCurrency = '¥',
  nowMs = Date.now(),
): BillingSummary {
  let monthlyTotal = 0;
  let paidCount = 0;
  let freeCount = 0;

  const expiringList: ExpiringServerItem[] = [];

  for (const c of clients) {
    const price = Number(c.price) || 0;
    const cycle = Number(c.billing_cycle) || 0;
    const currency = c.currency || '$';
    const autoRenewal = Boolean(c.auto_renewal);

    if (price > 0 && cycle > 0) {
      paidCount++;
      const monthlyCost = calculateMonthlyCost(price, cycle);
      const convertedMonthly = convertCurrency(monthlyCost, currency, targetCurrency);
      monthlyTotal += convertedMonthly;

      if (c.expired_at) {
        const expTime = new Date(c.expired_at).getTime();
        if (Number.isFinite(expTime)) {
          const diffDays = Math.ceil((expTime - nowMs) / (1000 * 60 * 60 * 24));
          if (diffDays <= 36500) {
            expiringList.push({
              uuid: c.uuid,
              name: c.name,
              group: c.group || '默认',
              price,
              currency,
              billingCycle: cycle,
              expiredAt: c.expired_at,
              diffDays,
              autoRenewal,
              monthlyEquivalent: convertedMonthly,
            });
          }
        }
      }
    } else {
      freeCount++;
    }
  }

  expiringList.sort((a, b) => a.diffDays - b.diffDays);

  return {
    monthlyTotal,
    annualTotal: monthlyTotal * 12,
    paidCount,
    freeCount,
    targetCurrency,
    expiringSoon: expiringList,
  };
}
