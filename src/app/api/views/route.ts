// src/app/api/views/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { isPocketBaseRecordId } from '@/lib/pocketbase-id';
import {
  countArticleView,
  PocketBaseAtomicViewCounter,
  requireViewRateLimitSecret,
  resolveViewVisitorIdentity,
  VIEW_VISITOR_COOKIE,
} from '@/lib/views/view-service';

const burstLimiter = new FixedWindowRateLimiter(60, 60_000);
// These windows are per Next.js process. Move them to shared storage when horizontal
// enforcement is required; the atomic PocketBase increment remains correct either way.
const viewDedupeLimiter = new FixedWindowRateLimiter(1, 10 * 60_000);

type PocketBaseError = { status?: number };

function withVisitorCookie(response: NextResponse, value: string | undefined): NextResponse {
  if (!value) return response;
  response.cookies.set(VIEW_VISITOR_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = body?.id;
    if (!isPocketBaseRecordId(id)) {
      return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
    }
    const secret = requireViewRateLimitSecret(process.env.VIEW_RATE_LIMIT_SECRET);
    const visitor = resolveViewVisitorIdentity({
      headers: req.headers,
      cookieValue: req.cookies.get(VIEW_VISITOR_COOKIE)?.value,
      secret,
      trustedProxyHeader: process.env.VIEW_TRUSTED_PROXY_IP_HEADER,
    });

    const result = await countArticleView(id, visitor.visitorKey, {
      burstLimiter,
      dedupeLimiter: viewDedupeLimiter,
      counter: {
        async increment(articleId) {
          const pb = await getAdminPocketBase();
          return new PocketBaseAtomicViewCounter(pb).increment(articleId);
        },
      },
    });

    if (result.kind === 'invalid') {
      return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
    }
    if (result.kind === 'rate_limited') {
      return withVisitorCookie(NextResponse.json(
        { ok: false, error: 'rate limited', retryAfterSeconds: result.retryAfterSeconds },
        {
          status: 429,
          headers: { 'Retry-After': String(result.retryAfterSeconds) },
        },
      ), visitor.setCookieValue);
    }
    if (result.kind === 'duplicate') {
      return withVisitorCookie(
        NextResponse.json({ ok: true, counted: false }),
        visitor.setCookieValue,
      );
    }

    return withVisitorCookie(
      NextResponse.json({ ok: true, counted: true, views: result.views }),
      visitor.setCookieValue,
    );
  } catch (error) {
    const status = (error as PocketBaseError).status === 404 ? 404 : 500;
    console.error('view counter failed', error);
    return NextResponse.json(
      { ok: false, error: status === 404 ? 'article not found' : 'view update failed' },
      { status },
    );
  }
}
