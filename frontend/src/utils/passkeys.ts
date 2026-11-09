import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn();
}

export function passkeyErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '已取消或验证超时';
    if (error.name === 'SecurityError') return '当前域名不允许使用通行密钥';
    if (error.name === 'InvalidStateError') return '该通行密钥已经绑定';
  }
  return error instanceof Error ? error.message : '通行密钥操作失败';
}

export { startAuthentication, startRegistration };
