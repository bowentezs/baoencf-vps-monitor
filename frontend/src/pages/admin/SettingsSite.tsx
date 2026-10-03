import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Button, Flex, Slider, Text } from '@radix-ui/themes';
import { Download, RotateCcw, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import Loading from '../../components/Loading';
import { useApi } from '../../contexts/AuthContext';
import { SettingCard, SettingInput, SettingToggle } from '../../components/admin/SettingCard';
import { getChangedSettings, type SettingsMap } from '../../utils/settingsDiff';
import { requestPassword } from '../../utils/reauth';
import { notifyPublicDataUpdated } from '../../utils/publicDataEvents';
import { buildApiRequest } from '../../utils/api';
import type { SettingsLayoutOutletContext } from './SettingsLayout';

const MIN_BACKUP_PASSWORD_LENGTH = 6;
const MAX_LOGO_BYTES = 1024 * 1024;

function backupEncryptPasswordError(password: string): string | null {
  if (Array.from(password).length < MIN_BACKUP_PASSWORD_LENGTH) return `备份密码至少需要 ${MIN_BACKUP_PASSWORD_LENGTH} 位`;
  return null;
}

function safeBackgroundUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (/[\r\n\0"'\\]/.test(trimmed)) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (/^https:\/\/[^\s"']+/i.test(trimmed)) return trimmed;
  return '';
}

export default function SettingsSite() {
  const apiFetch = useApi();
  const { setAction, settingsCache, loadSettingsScope, setSettingsScope } = useOutletContext<SettingsLayoutOutletContext>();
  const [settings, setSettings] = useState<SettingsMap>(() => settingsCache.site || {});
  const [originalSettings, setOriginalSettings] = useState<SettingsMap>(() => settingsCache.site || {});
  const [loading, setLoading] = useState(!settingsCache.site);
  const [saving, setSaving] = useState(false);
  const [logoSaving, setLogoSaving] = useState(false);
  const [previewDark, setPreviewDark] = useState(true);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadSettingsScope('site')
      .then((nextSettings) => {
        setSettings(nextSettings);
        setOriginalSettings(nextSettings);
      })
      .finally(() => setLoading(false));
  }, [loadSettingsScope]);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = useCallback(async () => {
    const changedSettings = getChangedSettings(settings, originalSettings);
    if (Object.keys(changedSettings).length === 0) {
      toast.info('没有需要保存的改动');
      return;
    }

    setSaving(true);
    try {
      const result = await apiFetch('/admin/settings', {
        method: 'POST',
        body: JSON.stringify(changedSettings),
      });
      if (result.success) {
        setOriginalSettings((prev) => ({ ...prev, ...changedSettings }));
        setSettingsScope('site', { ...settings, ...changedSettings });
        notifyPublicDataUpdated();
        toast.success('设置已保存');
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [apiFetch, originalSettings, setSettingsScope, settings]);

  const headerAction = useMemo(() => (
    <Button onClick={handleSave} disabled={loading || saving}>
      <Save size={16} /> {saving ? '保存中…' : '保存'}
    </Button>
  ), [handleSave, loading, saving]);

  useEffect(() => {
    setAction(headerAction);
    return () => setAction(null);
  }, [headerAction, setAction]);

  const downloadBackupFile = async (filename: string, backupPassword: string) => {
    const { url: requestUrl, init } = buildApiRequest('/admin/download/backup', {
      method: 'POST',
      body: JSON.stringify({ backup_password: backupPassword }),
    });
    const response = await fetch(requestUrl, init);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || '下载失败');
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(blobUrl);
  };

  const handleDownloadBackup = async () => {
    const password = await requestPassword(
      '请设置备份文件密码，不是管理员登录密码。至少 6 位。',
      {
        autocomplete: 'new-password',
        validate: backupEncryptPasswordError,
      },
    );
    if (!password) return;

    try {
      await downloadBackupFile(`cf-monitor-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`, password);
      toast.success('加密完整备份已下载，请保存好备份密码');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '备份下载失败');
    }
  };

  const handleUploadBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const password = await requestPassword('请输入该备份文件的加密密码', {
        autocomplete: 'off',
      });
      if (!password) return;
      const beforeRestorePassword = await requestPassword(
        '恢复前会自动下载当前配置的加密备份。请设置临时备份文件密码，至少 6 位。',
        {
          autocomplete: 'new-password',
          validate: backupEncryptPasswordError,
        },
      );
      if (!beforeRestorePassword) return;
      await downloadBackupFile(`cf-monitor-before-restore-${new Date().toISOString().slice(0, 10)}.json`, beforeRestorePassword);
      const result = await apiFetch('/admin/upload/backup?confirm_restore=true&acknowledge_overwrite=true', {
        method: 'POST',
        body: JSON.stringify({
          backup: data,
          backup_password: password,
          confirm_restore: true,
          acknowledge_overwrite: true,
        }),
      });

      if (!result.success) {
        toast.error(result.error || '恢复失败');
        return;
      }

      toast.success('备份已恢复');
      const nextSettings = await apiFetch('/admin/settings?scope=site');
      if (nextSettings && typeof nextSettings === 'object') {
        setSettings(nextSettings as SettingsMap);
        setOriginalSettings(nextSettings as SettingsMap);
        setSettingsScope('site', nextSettings as SettingsMap);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '备份文件格式错误');
    } finally {
      event.target.value = '';
    }
  };

  const handleUploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Logo 只支持 PNG、JPG、WebP');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo 不能超过 1MB');
      event.target.value = '';
      return;
    }

    const form = new FormData();
    form.append('file', file);
    setLogoSaving(true);
    try {
      const result = await apiFetch('/admin/site-logo', { method: 'POST', body: form });
      const siteLogoUrl = typeof result.site_logo_url === 'string' ? result.site_logo_url : '';
      setSettings((prev) => ({ ...prev, site_logo_url: siteLogoUrl }));
      setOriginalSettings((prev) => ({ ...prev, site_logo_url: siteLogoUrl }));
      setSettingsScope('site', { ...settings, site_logo_url: siteLogoUrl });
      notifyPublicDataUpdated();
      toast.success('Logo 已上传');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Logo 上传失败');
    } finally {
      setLogoSaving(false);
      event.target.value = '';
    }
  };

  const handleResetLogo = async () => {
    setLogoSaving(true);
    try {
      await apiFetch('/admin/site-logo/reset', { method: 'POST' });
      setSettings((prev) => ({ ...prev, site_logo_url: '' }));
      setOriginalSettings((prev) => ({ ...prev, site_logo_url: '' }));
      setSettingsScope('site', { ...settings, site_logo_url: '' });
      notifyPublicDataUpdated();
      toast.success('已恢复默认 Logo');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '恢复默认 Logo 失败');
    } finally {
      setLogoSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <Flex direction="column" gap="4">
      <SettingCard title="基本信息" description="站点名称、描述、语言与安装脚本域名" defaultOpen>
        <Box style={{ marginBottom: 16 }}>
          <Text size="2" weight="medium" style={{ display: 'block', marginBottom: 4 }}>站点 Logo</Text>
          <Text size="1" color="gray" style={{ display: 'block', marginBottom: 8 }}>
            显示在前台导航栏和后台登录页，支持 PNG、JPG、WebP，最大 1MB。
          </Text>
          <Flex align="center" gap="3" wrap="wrap">
            <Box className="site-logo-preview">
              <img src={settings.site_logo_url || '/app-icon.png'} alt="" />
            </Box>
            <Flex gap="2" wrap="wrap">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleUploadLogo}
              />
              <Button variant="soft" disabled={logoSaving} onClick={() => logoInputRef.current?.click()}>
                <Upload size={16} /> {logoSaving ? '处理中...' : '上传 Logo'}
              </Button>
              <Button variant="soft" color="gray" disabled={logoSaving || !settings.site_logo_url} onClick={handleResetLogo}>
                <RotateCcw size={16} /> 恢复默认
              </Button>
            </Flex>
          </Flex>
        </Box>
        <SettingInput
          label="站点标题"
          description="显示在导航栏和浏览器标签页"
          value={settings.site_title || ''}
          onChange={(value) => updateSetting('site_title', value)}
          placeholder="CF VPS Monitor"
        />
        <SettingInput
          label="站点副标题"
          description="显示在首页标题区"
          value={settings.site_subtitle || ''}
          onChange={(value) => updateSetting('site_subtitle', value)}
          placeholder="Cloudflare server monitor"
        />
        <SettingInput
          label="站点描述"
          description="用于页脚与元信息"
          value={settings.site_description || ''}
          onChange={(value) => updateSetting('site_description', value)}
          placeholder="服务器监控探针"
        />
        <SettingInput
          label="语言"
          description="界面语言设置"
          value={settings.language || 'zh-CN'}
          onChange={(value) => updateSetting('language', value)}
          placeholder="zh-CN"
        />
        <SettingInput
          label="脚本域名"
          description="生成安装命令时使用的站点地址；留空则使用当前域名"
          value={settings.script_domain || ''}
          onChange={(value) => updateSetting('script_domain', value)}
          placeholder={window.location.origin}
        />
      </SettingCard>

      <SettingCard title="外观与背景壁纸" description="前台桌面端与移动端背景图，支持外链或内置星空预设" defaultOpen>
        <SettingInput
          label="桌面端背景图 URL"
          description="用于 PC 和宽屏设备。支持 HTTPS 外链或站内相对路径（如 /images/gloria/dark-bg.webp）"
          value={settings.theme_bg_desktop || ''}
          onChange={(value) => updateSetting('theme_bg_desktop', value)}
          placeholder="https://... 或 /images/gloria/dark-bg.webp"
        />
        <SettingInput
          label="移动端背景图 URL"
          description="用于手机竖屏（≤768px），留空则自适应跟随桌面端壁纸"
          value={settings.theme_bg_mobile || ''}
          onChange={(value) => updateSetting('theme_bg_mobile', value)}
          placeholder="可选，留空跟随桌面端"
        />
        <SettingInput
          label="内容区宽度 (%)"
          description="前台主面板宽度比例，范围 60 到 100，默认 100"
          value={settings.theme_content_width || '100'}
          onChange={(value) => updateSetting('theme_content_width', value)}
          placeholder="100"
        />

        <div style={{ marginBottom: 16 }}>
          <Flex justify="between" align="center" style={{ marginBottom: 6, maxWidth: 420 }}>
            <Text size="2" weight="medium">卡片透明度 ({settings.theme_card_opacity || '70'}%)</Text>
            <Text size="1" color="gray">
              {Number(settings.theme_card_opacity || 70) <= 30 ? '极高透光' : Number(settings.theme_card_opacity || 70) >= 85 ? '深邃高对比' : '标准极光'}
            </Text>
          </Flex>
          <Slider
            style={{ maxWidth: 420 }}
            value={[Number(settings.theme_card_opacity || 70)]}
            min={20}
            max={100}
            step={5}
            onValueChange={(vals) => updateSetting('theme_card_opacity', String(vals[0]))}
          />
          <Text size="1" color="gray" style={{ display: 'block', marginTop: 4 }}>
            范围 20% ~ 100%。数值越小越透光凸显背景，数值越大文字对比度越高
          </Text>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Flex justify="between" align="center" style={{ marginBottom: 6, maxWidth: 420 }}>
            <Text size="2" weight="medium">毛玻璃磨砂度 ({settings.theme_card_blur || '16'}px)</Text>
            <Text size="1" color="gray">
              {Number(settings.theme_card_blur || 16) === 0 ? '纯透无模糊' : Number(settings.theme_card_blur || 16) >= 24 ? '重度磨砂' : '柔和磨砂'}
            </Text>
          </Flex>
          <Slider
            style={{ maxWidth: 420 }}
            value={[Number(settings.theme_card_blur || 16)]}
            min={0}
            max={40}
            step={2}
            onValueChange={(vals) => updateSetting('theme_card_blur', String(vals[0]))}
          />
          <Text size="1" color="gray" style={{ display: 'block', marginTop: 4 }}>
            范围 0px ~ 40px。0px 为晶莹纯透明，数值越大毛玻璃弥散磨砂感越强
          </Text>
        </div>

        <div style={{ maxWidth: 420, marginBottom: 16 }}>
          <SettingToggle
            label="卡片顶沿流光彩虹条"
            description="开启后在卡片顶部呈现 2px 极光流光霓虹线；关闭则为纯净极简边框"
            checked={settings.theme_card_glow !== 'false'}
            onCheckedChange={(checked) => updateSetting('theme_card_glow', String(checked))}
          />
        </div>

        {/* 🎨 实时所见即所得效果预览沙盒 */}
        <Box
          style={{
            marginTop: 8,
            marginBottom: 20,
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid var(--gray-a6)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            position: 'relative',
            maxWidth: 520,
            background: '#050816',
          }}
        >
          {/* 背景图层 */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${JSON.stringify(safeBackgroundUrl(settings.theme_bg_desktop) || '/images/gloria/dark-bg.webp')})`,
              backgroundPosition: 'center center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              filter: previewDark ? 'brightness(0.95)' : 'brightness(1.05)',
              transition: 'background-image 0.25s ease',
            }}
          />

          {/* 顶部工具栏 */}
          <Flex
            justify="between"
            align="center"
            style={{
              position: 'relative',
              zIndex: 2,
              padding: '10px 14px',
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderBottom: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <Flex align="center" gap="2">
              <span style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>🎨 实时所见即所得效果预览</span>
              <span style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(255,255,255,0.12)', padding: '1px 6px', borderRadius: 4 }}>
                {previewDark ? '深色模式' : '浅色模式'}
              </span>
            </Flex>
            <Button
              size="1"
              variant="soft"
              type="button"
              style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.18)', color: '#fff' }}
              onClick={() => setPreviewDark(!previewDark)}
            >
              切至{previewDark ? '浅色' : '深色'}预览
            </Button>
          </Flex>

          {/* 沙盒卡片展示区 */}
          <div style={{ position: 'relative', zIndex: 1, padding: '20px 16px' }}>
            <div
              style={{
                position: 'relative',
                borderRadius: 16,
                overflow: 'hidden',
                backdropFilter: `blur(${Math.min(40, Math.max(0, Number(settings.theme_card_blur ?? 16)))}px) saturate(190%) contrast(105%)`,
                WebkitBackdropFilter: `blur(${Math.min(40, Math.max(0, Number(settings.theme_card_blur ?? 16)))}px) saturate(190%) contrast(105%)`,
                background: previewDark
                  ? `linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.01) 100%), rgba(12, 16, 28, ${(Math.min(100, Math.max(20, Number(settings.theme_card_opacity || 70))) / 100) * 0.75 + 0.05})`
                  : `linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.50) 100%), rgba(255, 255, 255, ${Math.min(100, Math.max(20, Number(settings.theme_card_opacity || 70))) / 100})`,
                border: previewDark
                  ? '1.5px solid rgba(255, 255, 255, 0.30)'
                  : '1.5px solid rgba(255, 255, 255, 0.95)',
                boxShadow: previewDark
                  ? '0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 0.85), inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 20px 48px -6px rgba(0, 0, 0, 0.65)'
                  : '0 0 0 1px rgba(0, 0, 0, 0.12), inset 0 2px 2px 0 #ffffff, inset 0 0 0 1px rgba(255, 255, 255, 0.55), 0 16px 36px -6px rgba(0, 0, 0, 0.15)',
                color: previewDark ? '#f8fafc' : '#0f172a',
                padding: '16px 18px',
                transition: 'backdrop-filter 0.12s ease, background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease',
              }}
            >
              {/* 顶沿流光彩虹条 */}
              {settings.theme_card_glow !== 'false' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: 'linear-gradient(90deg, transparent, #38bdf8, #8b5cf6, #ec4899, #f59e0b, transparent)',
                    opacity: 0.95,
                    boxShadow: '0 0 12px rgba(139, 92, 246, 0.85), 0 0 4px #38bdf8',
                  }}
                />
              )}

              {/* 仿真节点标题栏 */}
              <Flex justify="between" align="center" style={{ marginBottom: 12 }}>
                <Flex align="center" gap="2">
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>US-LAX · 洛杉矶 BGP 高防</span>
                </Flex>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: previewDark ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.22)', color: '#22c55e', fontWeight: 600 }}>
                  在线 99.98%
                </span>
              </Flex>

              {/* 仿真指标进度条 (微晶体透光面板) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{
                  background: previewDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.5)',
                  border: previewDark ? '1px solid rgba(255, 255, 255, 0.09)' : '1px solid rgba(255, 255, 255, 0.7)',
                  borderRadius: 8,
                  padding: '7px 9px',
                  boxShadow: previewDark ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08)' : 'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                }}>
                  <Flex justify="between" style={{ fontSize: 11, marginBottom: 5, opacity: 0.85 }}>
                    <span>CPU 负载</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>18%</span>
                  </Flex>
                  <div style={{ height: 5, borderRadius: 999, background: previewDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <div style={{ width: '18%', height: '100%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
                  </div>
                </div>
                <div style={{
                  background: previewDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.5)',
                  border: previewDark ? '1px solid rgba(255, 255, 255, 0.09)' : '1px solid rgba(255, 255, 255, 0.7)',
                  borderRadius: 8,
                  padding: '7px 9px',
                  boxShadow: previewDark ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08)' : 'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                }}>
                  <Flex justify="between" style={{ fontSize: 11, marginBottom: 5, opacity: 0.85 }}>
                    <span>内存占用</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>42%</span>
                  </Flex>
                  <div style={{ height: 5, borderRadius: 999, background: previewDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <div style={{ width: '42%', height: '100%', background: '#a855f7', boxShadow: '0 0 8px #a855f7' }} />
                  </div>
                </div>
              </div>

              {/* 底部网络速率 */}
              <Flex justify="between" style={{ fontSize: 11, opacity: 0.75, paddingTop: 6, borderTop: previewDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
                <span>↓ 18.4 MB/s · ↑ 4.2 MB/s</span>
                <span>月流量: 1.2 / 5.0 TB</span>
              </Flex>
            </div>
          </div>
        </Box>

        <Flex gap="2" wrap="wrap" mt="1">
          <Button
            size="2"
            variant="soft"
            type="button"
            onClick={() => {
              updateSetting('theme_bg_desktop', '/images/gloria/dark-bg.webp');
              updateSetting('theme_bg_mobile', '/images/gloria/dark-bg.webp');
              updateSetting('theme_content_width', '92');
              updateSetting('theme_card_opacity', '70');
              updateSetting('theme_card_blur', '16');
              updateSetting('theme_card_glow', 'true');
              toast.success('已填入 Gloria 极光星空与最佳毛玻璃预设，点击右上角保存即可生效');
            }}
          >
            一键填入 Gloria 极光星空预设
          </Button>
          <Button
            size="2"
            variant="soft"
            color="gray"
            type="button"
            onClick={() => {
              updateSetting('theme_bg_desktop', '');
              updateSetting('theme_bg_mobile', '');
              updateSetting('theme_content_width', '100');
              updateSetting('theme_card_opacity', '70');
              updateSetting('theme_card_blur', '16');
              updateSetting('theme_card_glow', 'true');
              toast.info('已恢复默认外观设置');
            }}
          >
            清空背景图
          </Button>
        </Flex>
      </SettingCard>

      <SettingCard title="备份与恢复" description="导出或导入系统配置" defaultOpen>
        <Flex direction="column" gap="3">
          <Box style={{ border: '1px solid var(--amber-6)', background: 'var(--amber-2)', borderRadius: 8, padding: 12 }}>
            <Text size="2" weight="bold" color="amber">备份包含完整敏感配置，但文件会加密</Text>
            <Text size="1" color="gray" style={{ display: 'block', marginTop: 4 }}>
              备份会包含节点 token、AutoDiscovery Key、Telegram 凭据和通知配置，但导出的 JSON 只保存 AES-GCM 密文。恢复时必须输入导出时设置的备份密码。
            </Text>
          </Box>
          <Text size="1" color="gray">
            导出内容包含服务器列表、系统设置、Ping 任务、离线通知和负载通知；不包含管理员账户、审计日志和历史监控数据。恢复会覆盖对应配置，并清理不存在服务器的历史记录。
          </Text>
          <Flex gap="3" wrap="wrap" mt="2">
            <Button variant="soft" onClick={handleDownloadBackup}>
              <Download size={16} /> 导出加密完整备份
            </Button>
            <div>
              <input
                type="file"
                id="backup-upload-site"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleUploadBackup}
              />
              <Button variant="soft" onClick={() => document.getElementById('backup-upload-site')?.click()}>
                <Upload size={16} /> 导入备份
              </Button>
            </div>
          </Flex>
        </Flex>
      </SettingCard>
    </Flex>
  );
}
