export const EMAIL_MESSAGE_MAX_CHARS = 4096;
export const EMAIL_SUBJECT_MAX_CHARS = 120;
export const SMTP_FETCH_TIMEOUT_MS = 8000;

export type SmtpSecurity = 'tls' | 'starttls';
export type SmtpAuthMethod = 'plain' | 'login';

export type SmtpConfig = {
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  recipients: string[];
  authMethod: SmtpAuthMethod;
};

export type SmtpResult = { ok: true } | { ok: false; error: string };

export type SmtpIo = {
  readLine: () => Promise<string>;
  writeLine: (line: string) => Promise<void>;
  writeData: (data: string) => Promise<void>;
  startTls?: () => Promise<void> | void;
};

const EMAIL_PATTERN = /^[^\s@<>\r\n\x00]+@[^\s@<>\r\n\x00]+\.[^\s@<>\r\n\x00]+$/;

function parseIPv4(host: string): number[] | null {
  if (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(host)) return null;
  const parts = host.split('.').map(part => Number(part));
  return parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isAmbiguousNumericHost(host: string): boolean {
  if (host.includes(':')) return false;
  const parts = host.split('.');
  if (parts.length < 1 || parts.length > 4) return false;
  if (!parts.every(part => /^(0x[0-9a-f]+|\d+)$/i.test(part))) return false;
  if (parts.length !== 4) return true;
  return parts.some(part => /^0x/i.test(part) || (part.length > 1 && part.startsWith('0'))) || !parseIPv4(host);
}

function isBlockedIpv6Literal(host: string): boolean {
  if (!host.includes(':')) return false;
  try {
    const canonical = new URL(`http://[${host}]`).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return (
      canonical === '::' ||
      canonical === '::1' ||
      canonical.startsWith('::ffff:') ||
      /^::[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(canonical) ||
      canonical.startsWith('64:ff9b:') ||
      canonical.startsWith('2002:') ||
      canonical.startsWith('2001:db8:') ||
      canonical.startsWith('100:') ||
      /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(canonical)
    );
  } catch {
    return true;
  }
}

function isUnsafeHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (
    !normalized ||
    /[\r\n\x00\s/@]/.test(normalized) ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.home.arpa') ||
    normalized === 'metadata.google.internal' ||
    normalized === 'metadata.aws.internal' ||
    isAmbiguousNumericHost(normalized)
  ) {
    return true;
  }
  const ipv4 = parseIPv4(normalized);
  if (ipv4) {
    const [a, b, c] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  return isBlockedIpv6Literal(normalized);
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function quoteDisplayName(value: string): string {
  const safe = value.replace(/[\r\n\x00]+/g, ' ').trim();
  return `"${safe.replace(/["\\]/g, '\\$&')}"`;
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${utf8Base64(value.slice(0, EMAIL_SUBJECT_MAX_CHARS))}?=`;
}

export function normalizeRecipients(value: string): string[] {
  const recipients = value
    .split(/[;,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
  if (recipients.length === 0) throw new Error('请填写至少一个收件地址');
  if (recipients.length > 20) throw new Error('收件地址不能超过 20 个');
  for (const recipient of recipients) {
    if (recipient.length > 254 || !EMAIL_PATTERN.test(recipient)) {
      throw new Error(`收件地址无效: ${recipient}`);
    }
  }
  return [...new Set(recipients)];
}

export function validateSmtpConfig(input: Pick<SmtpConfig, 'host' | 'port' | 'security'>): void {
  if (isUnsafeHost(input.host)) throw new Error('SMTP Host 无效');
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error('SMTP Port 无效');
  }
  if (input.port === 25) throw new Error('SMTP 端口 25 不可用，请使用 465 或 587');
  if (input.security !== 'tls' && input.security !== 'starttls') {
    throw new Error('SMTP 安全模式无效');
  }
}

export function buildEmailMessage(input: {
  fromAddress: string;
  fromName: string;
  recipients: string[];
  subject: string;
  body: string;
  host: string;
}): string {
  const safeFromAddress = input.fromAddress.trim();
  if (!EMAIL_PATTERN.test(safeFromAddress)) {
    throw new Error('发件人地址无效');
  }
  const safeHost = input.host.trim();
  if (isUnsafeHost(safeHost)) {
    throw new Error('SMTP Host 无效');
  }
  const subject = input.subject.replace(/[\r\n\x00]+/g, ' ').slice(0, EMAIL_SUBJECT_MAX_CHARS);
  const body = input.body.slice(0, EMAIL_MESSAGE_MAX_CHARS).replace(/\r\n|\r|\n/g, '\r\n');
  const from = input.fromName.trim()
    ? `${quoteDisplayName(input.fromName.trim())} <${safeFromAddress}>`
    : safeFromAddress;
  const headers = [
    `From: ${from}`,
    `To: ${input.recipients.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${safeHost}>`,
  ];
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

function smtpSuccess(line: string): boolean {
  return /^[23]\d\d/.test(line);
}

function dotStuff(data: string): string {
  return data.replace(/\r\n|\r|\n/g, '\r\n').replace(/(^|\r\n)\./g, '$1..');
}

export async function sendSmtpCommands(
  io: SmtpIo,
  config: SmtpConfig,
  subject: string,
  body: string,
): Promise<SmtpResult> {
  if (!EMAIL_PATTERN.test(config.fromAddress.trim())) {
    return { ok: false, error: '发件人地址无效' };
  }
  if (/[\r\n\x00]/.test(config.fromName || '')) {
    return { ok: false, error: '发件人名称包含无效字符' };
  }
  for (const recipient of config.recipients) {
    if (!EMAIL_PATTERN.test(recipient.trim())) {
      return { ok: false, error: '收件地址无效' };
    }
  }

  const greeting = await io.readLine();
  if (!smtpSuccess(greeting)) return { ok: false, error: 'SMTP 服务不可用' };

  await io.writeLine(`EHLO ${config.host}`);
  if (!smtpSuccess(await io.readLine())) return { ok: false, error: 'SMTP EHLO 失败' };

  if (config.security === 'starttls') {
    if (!io.startTls) {
      return { ok: false, error: 'SMTP STARTTLS 升级不可用' };
    }
    await io.writeLine('STARTTLS');
    const startTlsResp = await io.readLine();
    if (!/^220\b/.test(startTlsResp)) {
      return { ok: false, error: 'SMTP STARTTLS 协商失败' };
    }
    await io.startTls();
    await io.writeLine(`EHLO ${config.host}`);
    if (!smtpSuccess(await io.readLine())) return { ok: false, error: 'SMTP TLS EHLO 失败' };
  }

  if (config.authMethod === 'login') {
    await io.writeLine('AUTH LOGIN');
    await io.readLine();
    await io.writeLine(utf8Base64(config.username));
    await io.readLine();
    await io.writeLine(utf8Base64(config.password));
    if (!smtpSuccess(await io.readLine())) return { ok: false, error: 'SMTP 认证失败' };
  } else {
    await io.writeLine(`AUTH PLAIN ${utf8Base64(`\0${config.username}\0${config.password}`)}`);
    if (!smtpSuccess(await io.readLine())) return { ok: false, error: 'SMTP 认证失败' };
  }

  await io.writeLine(`MAIL FROM:<${config.fromAddress.trim()}>`);
  if (!smtpSuccess(await io.readLine())) return { ok: false, error: 'SMTP 发件人被拒绝' };

  for (const recipient of config.recipients) {
    await io.writeLine(`RCPT TO:<${recipient.trim()}>`);
    if (!smtpSuccess(await io.readLine())) return { ok: false, error: 'SMTP 收件人被拒绝' };
  }

  await io.writeLine('DATA');
  if (!smtpSuccess(await io.readLine())) return { ok: false, error: 'SMTP DATA 失败' };
  await io.writeData(`${dotStuff(buildEmailMessage({
    fromAddress: config.fromAddress.trim(),
    fromName: config.fromName,
    recipients: config.recipients.map(item => item.trim()),
    subject,
    body,
    host: config.host.trim(),
  }))}\r\n.`);
  if (!smtpSuccess(await io.readLine())) return { ok: false, error: 'SMTP 邮件内容被拒绝' };

  await io.writeLine('QUIT');
  return { ok: true };
}

async function readSmtpResponse(
  getReader: () => ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): Promise<string> {
  let buffer = '';
  let lastLine = '';
  while (true) {
    const nlIndex = buffer.indexOf('\n');
    if (nlIndex >= 0) {
      const line = buffer.slice(0, nlIndex).replace(/\r$/, '');
      buffer = buffer.slice(nlIndex + 1);
      lastLine = line;
      // SMTP 多行响应形如 "250-..."，末行形如 "250 ..."
      if (/^\d{3}(?: |$)/.test(line)) {
        return line;
      }
      continue;
    }
    const chunk = await getReader().read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    if (buffer.length > 16384) break;
  }
  return lastLine || buffer.split(/\r?\n/)[0] || '';
}

export async function sendSmtpEmail(config: SmtpConfig, subject: string, body: string): Promise<SmtpResult> {
  validateSmtpConfig(config);
  if (!config.username || !config.password) return { ok: false, error: 'SMTP 用户名或密码未配置' };
  if (!config.fromAddress || !EMAIL_PATTERN.test(config.fromAddress.trim())) return { ok: false, error: '发件人未配置或格式无效' };
  if (config.recipients.length === 0) return { ok: false, error: '收件地址未配置' };

  const { connect } = await import('cloudflare:sockets');
  let activeSocket = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: config.security === 'tls' ? 'on' : 'starttls', allowHalfOpen: false },
  );
  let reader = activeSocket.readable.getReader();
  let writer = activeSocket.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<SmtpResult>((resolve) => {
    timeoutId = setTimeout(() => {
      try { activeSocket.close(); } catch {}
      resolve({ ok: false, error: 'SMTP 连接超时' });
    }, SMTP_FETCH_TIMEOUT_MS);
  });

  const send = (async () => {
    try {
      return await sendSmtpCommands({
        readLine: () => readSmtpResponse(() => reader, decoder),
        writeLine: line => writer.write(encoder.encode(`${line}\r\n`)),
        writeData: data => writer.write(encoder.encode(`${data}\r\n`)),
        startTls: async () => {
          reader.releaseLock();
          writer.releaseLock();
          activeSocket = activeSocket.startTls();
          reader = activeSocket.readable.getReader();
          writer = activeSocket.writable.getWriter();
        },
      }, config, subject, body);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      try { await writer.close(); } catch {}
      try { activeSocket.close(); } catch {}
    }
  })();

  return Promise.race([send, timeout]);
}
