const EXACT_PROTECTED_PATHS = new Set([
  '/api/admin/account/username',
  '/api/admin/account/chpasswd',
  '/api/admin/clients/batch-remove',
  '/api/admin/record/clear',
  '/api/admin/record/clear/all',
  '/api/admin/download/backup',
  '/api/admin/upload/backup',
  '/api/admin/account/mfa/setup',
  '/api/admin/account/mfa/enable',
  '/api/admin/account/mfa/recovery-codes',
  '/api/admin/account/mfa/disable',
  '/api/admin/account/passkeys/options',
  '/api/admin/account/passkeys',
  '/api/admin/account/passkeys/delete',
  // 手动触发维护任务会立即清理历史记录，同样需要 MFA step-up，防止被劫持会话绕过 record/clear 的保护。
  '/api/admin/cron/run',
  '/api/admin/maintenance/cleanup',
  '/api/admin/Settings/visitor-logs/clear',
  '/api/admin/visitor-logs/clear',
  '/api/admin/site-logo',
  '/api/admin/site-logo/reset',
  '/api/admin/test/sendMessage',
]);

const CLIENT_SECRET_PATH = /^\/api\/admin\/clients\/[^/]+\/(?:remove|token(?:\/install|\/rotate)?)$/;
const THEME_WRITE_PATH = /^\/api\/admin\/themes\/(?:upload|set|settings|delete)$/;

// 配置类写操作（系统设置、监控任务、通知渠道）同样要求 MFA step-up，防止会话被劫持后静默篡改。
const CONFIG_WRITE_PATH = /^\/api\/admin\/(?:settings|ping\/|websites\/|notification\/)/;

export function isMfaStepUpProtectedRequest(method: string, pathname: string): boolean {
  const upperMethod = method.toUpperCase();
  if (upperMethod !== 'POST' && upperMethod !== 'DELETE') return false;
  let normalizedPath = pathname;
  try {
    normalizedPath = decodeURI(pathname);
  } catch {
    // 保留原始路径；畸形编码交给路由层处理。
  }
  if (normalizedPath.length > 1) {
    normalizedPath = normalizedPath.replace(/\/+$/, '');
  }
  if (upperMethod === 'DELETE') {
    return CONFIG_WRITE_PATH.test(normalizedPath) || CLIENT_SECRET_PATH.test(normalizedPath) || THEME_WRITE_PATH.test(normalizedPath);
  }
  return (
    EXACT_PROTECTED_PATHS.has(normalizedPath) ||
    CLIENT_SECRET_PATH.test(normalizedPath) ||
    THEME_WRITE_PATH.test(normalizedPath) ||
    CONFIG_WRITE_PATH.test(normalizedPath)
  );
}