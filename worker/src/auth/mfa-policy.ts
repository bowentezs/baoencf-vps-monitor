// 默认拦截所有管理端写操作，仅显式豁免 MFA Step-Up 验证接口自身，避免新增写路由遗漏保护。
const EXEMPT_ADMIN_WRITE_PATHS = new Set([
  '/api/admin/account/mfa/step-up',
]);

const PROTECTED_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMfaStepUpProtectedRequest(method: string, pathname: string): boolean {
  const upperMethod = method.toUpperCase();
  if (!PROTECTED_WRITE_METHODS.has(upperMethod)) return false;

  let normalizedPath = pathname;
  try {
    normalizedPath = decodeURI(pathname);
  } catch {
    // 保留原始路径；畸形编码交给路由层处理。
  }
  if (normalizedPath.length > 1) {
    normalizedPath = normalizedPath.replace(/\/+$/, '');
  }

  if (!normalizedPath.startsWith('/api/admin/')) return false;
  if (EXEMPT_ADMIN_WRITE_PATHS.has(normalizedPath)) return false;
  return true;
}