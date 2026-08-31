import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const TARGET_REF_TTL_MS = 10 * 60 * 1000;
const RECORD_ID = /^[a-z0-9]{15}$/i;

function secretKey(): Buffer {
  const secret = process.env.RATE_LIMIT_KEY_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('admin_access_secret_unavailable');
  }
  return createHash('sha256')
    .update('fanzoom-admin-access-target-ref-v1\0')
    .update(secret)
    .digest();
}

export function createAdminTargetRef(
  userId: string,
  options: { now?: number; ttlMs?: number } = {},
): string {
  if (!RECORD_ID.test(userId)) throw new Error('invalid_admin_target');
  const now = options.now ?? Date.now();
  const expiresAt = now + (options.ttlMs ?? TARGET_REF_TTL_MS);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  cipher.setAAD(Buffer.from('fanzoom-admin-target-ref-v1'));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ userId, expiresAt }), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function readAdminTargetRef(
  value: unknown,
  options: { now?: number } = {},
): { userId: string; expiresAt: number } | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  const [version, ivText, tagText, encryptedText, extra] = value.split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText || extra) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAAD(Buffer.from('fanzoom-admin-target-ref-v1'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const parsed = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]).toString('utf8')) as Record<string, unknown>;
    if (
      Object.keys(parsed).length !== 2 ||
      !RECORD_ID.test(String(parsed.userId ?? '')) ||
      !Number.isSafeInteger(parsed.expiresAt) ||
      Number(parsed.expiresAt) <= (options.now ?? Date.now())
    ) return null;
    return { userId: String(parsed.userId), expiresAt: Number(parsed.expiresAt) };
  } catch {
    return null;
  }
}

export function createAdminCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function equalAdminCsrfToken(headerValue: string | null, cookieValue: string | undefined): boolean {
  if (!headerValue || !cookieValue || headerValue.length > 128 || cookieValue.length > 128) return false;
  const left = Buffer.from(headerValue);
  const right = Buffer.from(cookieValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isSameOriginAdminMutation(request: {
  nextUrl: URL;
  headers: { get(name: string): string | null };
}): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && parsed.protocol === request.nextUrl.protocol;
  } catch {
    return false;
  }
}
