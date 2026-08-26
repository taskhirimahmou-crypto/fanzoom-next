import { createHash } from 'node:crypto';

export function preAuthRateLimitKey(scope: string, authCookie: string | undefined): string {
  if (!authCookie) return `${scope}:anonymous`;
  const fingerprint = createHash('sha256').update(authCookie).digest('hex').slice(0, 24);
  return `${scope}:session:${fingerprint}`;
}
