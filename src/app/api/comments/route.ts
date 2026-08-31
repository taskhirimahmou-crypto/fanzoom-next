// src/app/api/comments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, requireUser } from '@/lib/auth-cookies';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { isPocketBaseRecordId } from '@/lib/pocketbase-id';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { preAuthRateLimitKey } from '@/lib/request-rate-limit';
import { recordTrustedRecommendationEventBestEffort } from '@/lib/recommender/trusted-events';

const commentRequestRateLimiter = new FixedWindowRateLimiter(20, 60_000);
const globalCommentRequestRateLimiter = new FixedWindowRateLimiter(10_000, 60_000, 1);
const commentUserRateLimiter = new FixedWindowRateLimiter(10, 60_000);

function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export async function POST(req: NextRequest) {
  const globalLimit = globalCommentRequestRateLimiter.consume('comments-global');
  if (!globalLimit.allowed) return rateLimited(globalLimit.retryAfterSeconds);
  const requestLimit = commentRequestRateLimiter.consume(
    preAuthRateLimitKey('comments', req.cookies.get(AUTH_COOKIE)?.value),
  );
  if (!requestLimit.allowed) return rateLimited(requestLimit.retryAfterSeconds);

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const userLimit = commentUserRateLimiter.consume(auth.user.id);
  if (!userLimit.allowed) return rateLimited(userLimit.retryAfterSeconds);

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'درخواست نامعتبر است' }, { status: 400 });
  }
  const input = payload as Record<string, unknown>;
  const unexpected = Object.keys(input).filter((key) => key !== 'articleId' && key !== 'body');
  if (unexpected.length > 0) {
    return NextResponse.json({ error: 'فیلد غیرمجاز در درخواست نظر' }, { status: 400 });
  }
  const articleId = input.articleId;
  const text = typeof input.body === 'string' ? input.body.trim() : '';

  if (!isPocketBaseRecordId(articleId)) {
    return NextResponse.json({ error: 'مقاله مشخص نشده' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: 'متن نظر خالی است' }, { status: 400 });
  if (text.length > 1000)
    return NextResponse.json({ error: 'نظر حداکثر ۱۰۰۰ کاراکتر باشد' }, { status: 400 });

  const now = new Date().toISOString();

  try {
    const adminPb = await getAdminPocketBase();
    const comment = await adminPb.collection('comments').create({
      user: auth.user.id,
      article: articleId,
      content: text,
      status: 'pending',
      autodate: now, // فیلد تاریخِ واقعیِ این collection
    });
    await recordTrustedRecommendationEventBestEffort(
      {
        idempotencyKey: `comment:${comment.id}`,
        articleId,
        eventType: 'comment',
        surface: 'article',
        occurredAt: now,
      },
      auth.user.id,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = (e as { response?: { data?: unknown } })?.response?.data;
    console.error('🔴 Comments create error:', JSON.stringify(resp, null, 2));
    return NextResponse.json({ error: 'ثبت نظر انجام نشد' }, { status: 400 });
  }
}
