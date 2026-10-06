import { useEffect, useMemo, useState } from 'react';
import {
  Flex,
  Card,
  Text,
  Heading,
  Badge,
  Table,
  TextField,
  Select,
  Button,
  Dialog,
} from '@radix-ui/themes';
import { Users, Search, RefreshCw, Globe, Clock3, Laptop, Info } from 'lucide-react';
import Loading from '../../components/Loading';
import { useApi } from '../../contexts/AuthContext';

export interface VisitorLogEntry {
  id: number;
  time: string;
  ip: string;
  country: string;
  city: string;
  path: string;
  user_agent: string;
}

export interface FormattedPathInfo {
  label: string;
  subtext?: string;
  badgeColor: 'blue' | 'purple' | 'green' | 'amber' | 'gray';
  fullTitle: string;
}

// 格式化并中文化页面访问路径
function parsePathDisplay(
  rawPath: string,
  clientNames: Record<string, string> = {}
): FormattedPathInfo {
  const path = (rawPath || '/').trim();

  // 1. 首页 / 前台大盘
  if (!path || path === '/' || path === '/index.html') {
    return {
      label: '前台大盘首页',
      badgeColor: 'blue',
      fullTitle: path,
    };
  }

  // 2. 节点详情页 /instance/:id
  const instanceMatch = path.match(/^\/instance\/([a-zA-Z0-9_-]+)/i);
  if (instanceMatch) {
    const id = instanceMatch[1];
    const serverName = clientNames[id];
    const shortId = id.length > 8 ? id.substring(0, 8) : id;

    if (serverName) {
      return {
        label: `节点: ${serverName}`,
        subtext: shortId,
        badgeColor: 'purple',
        fullTitle: `${serverName} (${id})`,
      };
    }
    return {
      label: '节点详情',
      subtext: shortId,
      badgeColor: 'purple',
      fullTitle: `节点: ${id}`,
    };
  }

  // 3. 登录页
  if (path === '/login' || path.startsWith('/login/')) {
    return {
      label: '管理员登录',
      badgeColor: 'amber',
      fullTitle: path,
    };
  }

  // 4. 管理后台
  if (path === '/admin' || path.startsWith('/admin/')) {
    let sub = '';
    if (path.includes('/visitor-logs')) sub = '访客日志';
    else if (path.includes('/clients')) sub = '节点管理';
    else if (path.includes('/settings')) sub = '系统设置';
    else if (path.includes('/notifications')) sub = '告警通知';
    return {
      label: sub ? `后台: ${sub}` : '管理后台',
      badgeColor: 'gray',
      fullTitle: path,
    };
  }

  // 5. 其他常规路径兜底
  return {
    label: path.length > 24 ? `${path.substring(0, 24)}...` : path,
    badgeColor: 'gray',
    fullTitle: path,
  };
}

// 简易解析 User-Agent 呈现友好标签
function parseUserAgent(ua: string): { browser: string; os: string } {
  if (!ua) return { browser: '未知浏览器', os: '未知系统' };

  let os = '其他系统';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = '其他';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/curl/i.test(ua)) browser = 'curl';

  return { browser, os };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function VisitorLogs() {
  const apiFetch = useApi();
  const [logs, setLogs] = useState<VisitorLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('50');
  const [selectedLog, setSelectedLog] = useState<VisitorLogEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});

  // 异步获取探针节点名称对照表，供路径中文化呈现
  useEffect(() => {
    apiFetch('/admin/clients')
      .then(res => {
        const items = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
        const map: Record<string, string> = {};
        for (const item of items) {
          if (item?.uuid && item?.name) {
            map[item.uuid] = item.name;
          }
        }
        setClientNames(map);
      })
      .catch(() => {});
  }, [apiFetch]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLogs = () => {
    setLoading(true);
    setError(null);
    const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '';
    apiFetch(`/admin/visitor-logs?limit=${pageSize}&page=${page}${searchParam}`)
      .then(res => {
        const items = Array.isArray(res?.data) ? res.data : [];
        setLogs(items);
        setTotal(Number(res?.total || items.length));
        if (res?.today_total !== undefined) {
          setTodayTotal(Number(res.today_total));
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '获取访客记录失败');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, debouncedSearch]);

  // 统计概览（本页维度）
  const stats = useMemo(() => {
    const uniqueIps = new Set(logs.map(l => l.ip).filter(Boolean)).size;
    const uniqueCountries = new Set(logs.map(l => l.country).filter(Boolean)).size;
    return { uniqueIps, uniqueCountries };
  }, [logs]);

  const totalPages = Math.max(1, Math.ceil(total / Number(pageSize)));

  return (
    <div className="admin-page-container">
      <Flex direction="column" gap="4">
        {/* 顶部标题区 */}
        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Flex align="center" gap="2">
            <Users size={22} className="text-blue-500" />
            <Heading size="5">访客记录</Heading>
          </Flex>
          <Button variant="soft" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            刷新记录
          </Button>
        </Flex>

        {/* 统计指标卡片 */}
        <div className="audit-summary-strip">
          <div className="audit-summary-item">
            <span className="audit-summary-icon" style={{ color: 'var(--blue-9)' }}>
              <Clock3 size={16} />
            </span>
            <Text className="audit-summary-label" size="1" color="gray">今日访客</Text>
            <Text className="audit-summary-value" size="3" weight="bold">{todayTotal}</Text>
          </div>
          <div className="audit-summary-item">
            <span className="audit-summary-icon" style={{ color: 'var(--cyan-9)' }}>
              <Users size={16} />
            </span>
            <Text className="audit-summary-label" size="1" color="gray">本页独立 IP</Text>
            <Text className="audit-summary-value" size="3" weight="bold">{stats.uniqueIps}</Text>
          </div>
          <div className="audit-summary-item">
            <span className="audit-summary-icon" style={{ color: 'var(--green-9)' }}>
              <Globe size={16} />
            </span>
            <Text className="audit-summary-label" size="1" color="gray">来源地区数</Text>
            <Text className="audit-summary-value" size="3" weight="bold">{stats.uniqueCountries}</Text>
          </div>
          <div className="audit-summary-item">
            <span className="audit-summary-icon" style={{ color: 'var(--purple-9)' }}>
              <Info size={16} />
            </span>
            <Text className="audit-summary-label" size="1" color="gray">总记录数</Text>
            <Text className="audit-summary-value" size="3" weight="bold">{total}</Text>
          </div>
        </div>

        {error && (
          <Card className="admin-error-card">
            <Text size="2" color="red" weight="bold">访客日志加载失败</Text>
            <Text size="1" color="gray" style={{ display: 'block', marginTop: 4 }}>{error}</Text>
          </Card>
        )}

        {/* 主数据卡片 */}
        <Card>
          <div className="audit-filter-toolbar">
            <div className="audit-filter-top-row">
              <TextField.Root
                className="audit-filter-search"
                placeholder="搜索 IP、国家、城市、路径、UA..."
                value={search}
                onChange={e => setSearch((e.target as HTMLInputElement).value)}
              >
                <TextField.Slot><Search size={14} /></TextField.Slot>
              </TextField.Root>

              <Select.Root value={pageSize} onValueChange={(value) => { setPage(1); setPageSize(value); }}>
                <Select.Trigger className="audit-page-size-select" />
                <Select.Content>
                  <Select.Item value="20">每页 20 条</Select.Item>
                  <Select.Item value="50">每页 50 条</Select.Item>
                  <Select.Item value="100">每页 100 条</Select.Item>
                </Select.Content>
              </Select.Root>

              <Flex className="audit-filter-result-row" align="center" gap="2">
                <Badge variant="soft" color="blue">当前展示 {logs.length} 条</Badge>
              </Flex>
            </div>
          </div>

          {loading ? (
            <Flex justify="center" align="center" py="8">
              <Loading />
            </Flex>
          ) : logs.length === 0 ? (
            <Flex justify="center" align="center" py="8" direction="column" gap="2">
              <Users size={32} color="gray" />
              <Text size="2" color="gray">{search.trim() ? '未检索到匹配的访客记录' : '暂无访客记录'}</Text>
            </Flex>
          ) : (
            <Table.Root variant="surface">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>访问时间</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>访客 IP</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>归属地</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>访问路径</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>客户端 / 浏览器</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>操作</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {logs.map(item => {
                  const uaInfo = parseUserAgent(item.user_agent);
                  return (
                    <Table.Row key={item.id}>
                      <Table.Cell>
                        <Text size="2" style={{ fontFamily: 'monospace' }}>
                          {formatDate(item.time)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" weight="bold" style={{ fontFamily: 'monospace' }}>
                          {item.ip}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex gap="1" align="center">
                          {item.country ? (
                            <Badge variant="soft" color="indigo">{item.country}</Badge>
                          ) : (
                            <Badge variant="outline" color="gray">-</Badge>
                          )}
                          {item.city && (
                            <Text size="1" color="gray">{item.city}</Text>
                          )}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        {(() => {
                          const info = parsePathDisplay(item.path, clientNames);
                          return (
                            <Flex align="center" gap="1" wrap="wrap">
                              <Badge variant="soft" color={info.badgeColor} title={info.fullTitle}>
                                {info.label}
                              </Badge>
                              {info.subtext && (
                                <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                                  ({info.subtext})
                                </Text>
                              )}
                            </Flex>
                          );
                        })()}
                      </Table.Cell>
                      <Table.Cell>
                        <Flex align="center" gap="1">
                          <Laptop size={14} className="text-gray-400" />
                          <Text size="2">{uaInfo.browser}</Text>
                          <Text size="1" color="gray">({uaInfo.os})</Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={() => setSelectedLog(item)}
                        >
                          查看明细
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          )}

          {/* 分页导航 */}
          <Flex justify="between" align="center" mt="4" wrap="wrap" gap="2">
            <Text size="1" color="gray">
              第 {page} 页 / 共 {totalPages} 页（总计 {total} 条记录）
            </Text>
            <Flex gap="2">
              <Button
                size="1"
                variant="soft"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <Button
                size="1"
                variant="soft"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => p + 1)}
              >
                下一页
              </Button>
            </Flex>
          </Flex>
        </Card>

        {/* 详情弹窗 */}
        <Dialog.Root open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <Dialog.Content style={{ maxWidth: 520 }}>
            <Dialog.Title>访客记录详情</Dialog.Title>
            <Dialog.Description size="2" mb="4">
              ID: {selectedLog?.id}
            </Dialog.Description>
            {selectedLog && (
              <Flex direction="column" gap="3">
                <Flex justify="between">
                  <Text size="2" color="gray">访问时间：</Text>
                  <Text size="2" weight="bold">{formatDate(selectedLog.time)}</Text>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">访客 IP：</Text>
                  <Text size="2" weight="bold" style={{ fontFamily: 'monospace' }}>{selectedLog.ip}</Text>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">国家/地区：</Text>
                  <Text size="2">{selectedLog.country || '未知'} {selectedLog.city}</Text>
                </Flex>
                {(() => {
                  const info = parsePathDisplay(selectedLog.path, clientNames);
                  return (
                    <>
                      <Flex justify="between">
                        <Text size="2" color="gray">访问页面：</Text>
                        <Badge variant="soft" color={info.badgeColor}>{info.label}</Badge>
                      </Flex>
                      <Flex justify="between">
                        <Text size="2" color="gray">原始 URL 路径：</Text>
                        <Text size="2" style={{ fontFamily: 'monospace' }}>{selectedLog.path || '/'}</Text>
                      </Flex>
                    </>
                  );
                })()}
                <Flex direction="column" gap="1">
                  <Text size="2" color="gray">完整 User-Agent：</Text>
                  <Card style={{ background: 'var(--gray-2)', wordBreak: 'break-all' }}>
                    <Text size="1" style={{ fontFamily: 'monospace' }}>
                      {selectedLog.user_agent || '无'}
                    </Text>
                  </Card>
                </Flex>
              </Flex>
            )}
            <Flex justify="end" mt="4">
              <Button variant="soft" onClick={() => setSelectedLog(null)}>
                关闭
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
    </div>
  );
}
