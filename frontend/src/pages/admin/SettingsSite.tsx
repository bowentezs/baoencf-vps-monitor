import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Button, Flex, SegmentedControl, Slider, Text } from '@radix-ui/themes';
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
  const [previewDark, setPreviewDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme-appearance') === 'dark';
    }
    return false;
  });
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
              {Number(settings.theme_card_opacity || 70) <= 25
                ? '极透水膜（底色极薄穿透）'
                : Number(settings.theme_card_opacity || 70) >= 85
                  ? '实心面板（遮挡背景高对比）'
                  : '微晶半透（通透与阅读平衡）'}
            </Text>
          </Flex>
          <Slider
            style={{ maxWidth: 420 }}
            value={[Number(settings.theme_card_opacity || 70)]}
            min={10}
            max={100}
            step={5}
            onValueChange={(vals) => updateSetting('theme_card_opacity', String(vals[0]))}
          />
          <Text size="1" color="gray" style={{ display: 'block', marginTop: 4 }}>
            纯粹控制卡片底色颜料薄厚。10% 极透穿透背景，100% 纯实心面板完全遮挡背景，绝不影响模糊散焦。
          </Text>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Flex justify="between" align="center" style={{ marginBottom: 6, maxWidth: 420 }}>
            <Text size="2" weight="medium">毛玻璃磨砂度 ({settings.theme_card_blur || '16'}px)</Text>
            <Text size="1" color="gray">
              {Number(settings.theme_card_blur || 16) === 0
                ? '纯透水晶（背景原图100%清晰）'
                : Number(settings.theme_card_blur || 16) >= 28
                  ? '重度雾化（背景化为梦幻极光）'
                  : '微晶磨砂（苹果液态温润散焦）'}
            </Text>
          </Flex>
          <Slider
            style={{ maxWidth: 420 }}
            value={[Number(settings.theme_card_blur || 16)]}
            min={0}
            max={60}
            step={2}
            onValueChange={(vals) => updateSetting('theme_card_blur', String(vals[0]))}
          />
          <Text size="1" color="gray" style={{ display: 'block', marginTop: 4 }}>
            纯粹控制背景散焦模糊程度。0px 原图高清无虚化，60px 深度雾化散焦，绝不影响卡片底色深浅。
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

        <div style={{ maxWidth: 420, marginBottom: 16 }}>
          <Text size="2" weight="medium" style={{ display: 'block', marginBottom: 6 }}>卡片材质质感体系</Text>
          <SegmentedControl.Root
            value={settings.theme_card_material === 'liquid' ? 'liquid' : 'frosted'}
            onValueChange={(val) => updateSetting('theme_card_material', val)}
            size="2"
          >
            <SegmentedControl.Item value="frosted">经典毛玻璃 (哑光温润)</SegmentedControl.Item>
            <SegmentedControl.Item value="liquid">苹果液态玻璃 (水润晶莹)</SegmentedControl.Item>
          </SegmentedControl.Root>
          <Text size="1" color="gray" style={{ display: 'block', marginTop: 5 }}>
            {settings.theme_card_material === 'liquid'
              ? '✨ 苹果液态玻璃：激活水滴表面张力倒角、双层折射高光切线、微凸水润透镜反光与凝胶水珠质感。'
              : '🌫️ 经典毛玻璃：呈现优雅平滑、极简温润、高遮光不透字的经典磨砂质感。'}
          </Text>
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
          {(() => {
            const rawBg = safeBackgroundUrl(settings.theme_bg_desktop) || safeBackgroundUrl(settings.theme_bg_mobile) || '';
            const hasCustomBg = Boolean(rawBg);
            const bgUrl = hasCustomBg
              ? (!previewDark && rawBg === '/images/gloria/dark-bg.webp' ? '/images/gloria/light-bg.png' : rawBg)
              : '';
            return (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: previewDark ? '#0b0f19' : '#f1f5f9',
                  backgroundImage: bgUrl ? `url(${JSON.stringify(bgUrl)})` : 'none',
                  backgroundPosition: 'center center',
                  backgroundSize: 'cover',
                  backgroundRepeat: 'no-repeat',
                  filter: previewDark ? 'brightness(0.95)' : 'brightness(1.05)',
                  transition: 'background-image 0.25s ease, background-color 0.25s ease',
                }}
              />
            );
          })()}

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
              {!safeBackgroundUrl(settings.theme_bg_desktop) && !safeBackgroundUrl(settings.theme_bg_mobile) && (
                <span style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 6px', borderRadius: 4 }}>
                  无背景图（前台展示系统纯色）
                </span>
              )}
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
            {(() => {
              const rawBg = safeBackgroundUrl(settings.theme_bg_desktop) || safeBackgroundUrl(settings.theme_bg_mobile) || '';
              const hasCustomBg = Boolean(rawBg);
              const isLiquid = settings.theme_card_material === 'liquid';
              const cardOpacityNum = Math.min(100, Math.max(10, Number(settings.theme_card_opacity || 70))) / 100;
              const cardBlurNum = Math.min(60, Math.max(0, Number(settings.theme_card_blur ?? 16)));
              const blurProgress = cardBlurNum / 60;
              const glassSaturate = Math.round(110 + blurProgress * 110);
              const glassContrast = Math.round(100 + blurProgress * 15);

              // 区分材质视觉体系：苹果液态玻璃 vs 经典哑光毛玻璃
              const cardBgImage = hasCustomBg
                ? (isLiquid
                    ? (previewDark
                        ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.01) 100%), radial-gradient(circle at 10% 10%, rgba(139, 92, 246, 0.22), transparent 45%), radial-gradient(circle at 90% 90%, rgba(56, 189, 248, 0.18), transparent 45%)'
                        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.20) 0%, rgba(255, 255, 255, 0.03) 100%), radial-gradient(circle at 15% 15%, rgba(224, 242, 254, 0.35), transparent 50%), radial-gradient(circle at 85% 85%, rgba(250, 232, 255, 0.30), transparent 50%)')
                    : 'none')
                : 'none';

              const cardBorder = hasCustomBg
                ? (isLiquid
                    ? (previewDark ? '1.5px solid rgba(255, 255, 255, 0.36)' : '1.5px solid rgba(255, 255, 255, 0.90)')
                    : (previewDark ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid rgba(0, 0, 0, 0.10)'))
                : (previewDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.08)');

              const cardBoxShadow = hasCustomBg
                ? (isLiquid
                    ? (previewDark
                        ? '0 0 0 1px rgba(0, 0, 0, 0.40), inset 0 1.5px 2px 0 rgba(255, 255, 255, 0.95), inset 1px 0 2px 0 rgba(56, 189, 248, 0.34), inset -1px -1.5px 2.5px 0 rgba(192, 132, 252, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.14), 0 20px 48px -6px rgba(0, 0, 0, 0.65)'
                        : '0 0 0 1px rgba(255, 255, 255, 0.85), inset 0 1.5px 2px 0 #ffffff, inset 1px 0 2px 0 rgba(56, 189, 248, 0.28), inset -1px -1.5px 2px 0 rgba(236, 72, 153, 0.20), inset 0 0 0 1px rgba(255, 255, 255, 0.45), 0 12px 32px -4px rgba(100, 116, 139, 0.12)')
                    : (previewDark ? '0 12px 36px rgba(0, 0, 0, 0.40)' : '0 8px 24px rgba(0, 0, 0, 0.06)'))
                : (previewDark ? '0 4px 20px rgba(0, 0, 0, 0.35)' : '0 4px 20px rgba(0, 0, 0, 0.06)');

              return (
                <div
                  style={{
                    position: 'relative',
                    borderRadius: 16,
                    overflow: 'hidden',
                    backdropFilter: hasCustomBg ? `blur(${cardBlurNum}px) saturate(${glassSaturate}%) contrast(${glassContrast}%)` : 'none',
                    WebkitBackdropFilter: hasCustomBg ? `blur(${cardBlurNum}px) saturate(${glassSaturate}%) contrast(${glassContrast}%)` : 'none',
                    backgroundColor: hasCustomBg
                      ? (previewDark ? `rgba(12, 16, 28, ${cardOpacityNum})` : `rgba(255, 255, 255, ${cardOpacityNum})`)
                      : (previewDark ? '#111827' : '#ffffff'),
                    backgroundImage: cardBgImage,
                    border: cardBorder,
                    boxShadow: cardBoxShadow,
                    color: previewDark ? '#f8fafc' : '#0f172a',
                    padding: '16px 18px',
                    transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  {/* 顶沿流光彩虹条 (仅在启用背景壁纸且开启了光晕时展示) */}
                  {hasCustomBg && settings.theme_card_glow !== 'false' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: isLiquid ? 2.5 : 1.5,
                        background: isLiquid
                          ? 'linear-gradient(90deg, transparent, #38bdf8 25%, #8b5cf6 50%, #ec4899 75%, transparent)'
                          : 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4) 50%, transparent)',
                        backgroundSize: isLiquid ? '200% 100%' : '100% 100%',
                        animation: isLiquid ? 'liquidGlassGlowFlow 8s ease-in-out infinite alternate' : 'none',
                        opacity: isLiquid ? 1 : 0.75,
                        boxShadow: isLiquid ? '0 0 14px rgba(139, 92, 246, 0.9), 0 0 5px #38bdf8' : '0 0 6px rgba(255, 255, 255, 0.25)',
                        zIndex: 2,
                      }}
                    />
                  )}

                  {/* 仿真节点标题栏 */}
                  <Flex justify="between" align="center" style={{ marginBottom: 12 }}>
                    <Flex align="center" gap="2">
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>US-LAX · 洛杉矶 BGP 高防</span>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: isLiquid ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.12)',
                        color: isLiquid ? '#38bdf8' : (previewDark ? '#94a3b8' : '#64748b'),
                        border: isLiquid ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.15)',
                        fontWeight: 600,
                      }}>
                        {isLiquid ? '✨ 水润晶体' : '🌫️ 哑光磨砂'}
                      </span>
                    </Flex>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: previewDark ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.22)', color: '#22c55e', fontWeight: 600 }}>
                      在线 99.98%
                    </span>
                  </Flex>

                  {/* 仿真指标进度条 (微晶体透光面板) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div style={{
                      background: previewDark
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(255, 255, 255, 0.35)',
                      border: previewDark
                        ? '1px solid rgba(255, 255, 255, 0.12)'
                        : '1px solid rgba(255, 255, 255, 0.65)',
                      borderRadius: 8,
                      padding: '7px 9px',
                      boxShadow: isLiquid
                        ? (previewDark
                            ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                            : 'inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 0.8), 0 2px 8px rgba(0, 0, 0, 0.03)')
                        : 'none',
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
                      background: previewDark
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(255, 255, 255, 0.35)',
                      border: previewDark
                        ? '1px solid rgba(255, 255, 255, 0.12)'
                        : '1px solid rgba(255, 255, 255, 0.65)',
                      borderRadius: 8,
                      padding: '7px 9px',
                      boxShadow: isLiquid
                        ? (previewDark
                            ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                            : 'inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 0.8), 0 2px 8px rgba(0, 0, 0, 0.03)')
                        : 'none',
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

                  {/* 实时正交解耦状态提示 */}
                  <Flex justify="between" align="center" style={{ fontSize: 10, opacity: 0.7, marginTop: 8, paddingTop: 6, borderTop: previewDark ? '1px dashed rgba(255,255,255,0.12)' : '1px dashed rgba(0,0,0,0.1)' }}>
                    {hasCustomBg ? (
                      <>
                        <span>底色浓度: {Math.round(cardOpacityNum * 100)}% ({cardOpacityNum >= 0.85 ? '实心遮挡' : cardOpacityNum <= 0.25 ? '极薄透水膜' : '微晶半透'})</span>
                        <span>质感体系: {isLiquid ? '苹果液态玻璃 (棱镜高光 · 水润流光)' : '经典毛玻璃 (纯净哑光 · 极简平整)'}</span>
                      </>
                    ) : (
                      <>
                        <span>当前状态: 系统纯色默认卡片</span>
                        <span>壁纸状态: 留空（未启用背景图层）</span>
                      </>
                    )}
                  </Flex>
                </div>
              );
            })()}
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
              updateSetting('theme_card_material', 'liquid');
              toast.success('已填入 Gloria 极光星空与液态水晶预设，点击右上角保存即可生效');
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
              updateSetting('theme_card_material', 'frosted');
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
