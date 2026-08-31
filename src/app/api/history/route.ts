// src/app/api/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, requireUser } from '@/lib/auth-cookies';
import { deleteReadingHistory, upsertReadingHistory } from '@/lib/history/history-service';
import { isPocketBaseRecordId } from '@/lib/pocketbase-id';
import {
  openEventIdempotencyKey,
  recordTrustedRecommendationEventBestEffort,
} from '@/lib/recommender/trusted-events';
import { parseRecommendationAttribution } from '@/lib/recommender/attribution';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import {
  PocketBaseServedAttributionRepository,
  validateTrustedOpenAttribution,
} from '@/lib/recommender/trusted-attribution';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { preAuthRateLimitKey } from '@/lib/request-rate-limit';

const historyRequestRateLimiter = new FixedWindowRateLimiter(120, 60_000);
const globalHistoryRequestRateLimiter = new FixedWindowRateLimiter(10_000, 60_000, 1);
const historyUserRateLimiter = new FixedWindowRateLimiter(60, 60_000);

function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

// ثبت یا به‌روزرسانی «آخرین مطالعه» (upsert دستی)
export async function POST(req: NextRequest) {
  const globalLimit = globalHistoryRequestRateLimiter.consume('history-post-global');
  if (!globalLimit.allowed) return rateLimited(globalLimit.retryAfterSeconds);
  const requestLimit = historyRequestRateLimiter.consume(
    preAuthRateLimitKey('history-post', req.cookies.get(AUTH_COOKIE)?.value),
  );
  if (!requestLimit.allowed) return rateLimited(requestLimit.retryAfterSeconds);

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { pb } = auth;
  const uid = auth.user.id;
  const userLimit = historyUserRateLimiter.consume(uid);
  if (!userLimit.allowed) return rateLimited(userLimit.retryAfterSeconds);

  const body = (await req.json().catch(() => null)) as {
    articleId?: unknown;
    attribution?: unknown;
  } | null;
  const articleId = body?.articleId;
  if (!isPocketBaseRecordId(articleId)) {
    return NextResponse.json({ error: 'invalid article' }, { status: 400 });
  }
  const candidateAttribution = parseRecommendationAttribution(body?.attribution);

  const now = new Date().toISOString();
  try {
    await upsertReadingHistory(pb, uid, articleId, now);
    let attribution;
    if (candidateAttribution) {
      try {
        const adminPb = await getAdminPocketBase();
        attribution = await validateTrustedOpenAttribution(
          candidateAttribution,
          uid,
          articleId,
          new PocketBaseServedAttributionRepository(adminPb),
        );
      } catch (error) {
        // Attribution is analytics metadata: fail closed to direct traffic if its
        // trusted served evidence cannot be checked, without breaking history.
        console.error('recommendation open attribution validation failed', error);
      }
    }
    const openBucket = Math.floor(Date.now() / 300_000);
    const openRecorded = await recordTrustedRecommendationEventBestEffort(
      {
        idempotencyKey: openEventIdempotencyKey(articleId, attribution, openBucket),
        articleId,
        eventType: 'open',
        surface: attribution?.surface ?? 'direct',
        ...attribution,
        occurredAt: now,
      },
      uid,
      {
        legacyIdempotencyKeys: attribution
          ? [`open:${attribution.feedId}:${articleId}:${openBucket}`]
          : [],
      },
    );
    return NextResponse.json({
      ok: true,
      openRecorded,
      attribution: openRecorded ? (attribution ?? null) : null,
    });
  } catch (e) {
    console.error('🔴 history upsert error:', JSON.stringify((e as { response?: { data?: unknown } })?.response?.data, null, 2));
    return NextResponse.json({ error: 'failed' }, { status: 400 });
  }
}

// حذف یک مقاله از تاریخچه
export async function DELETE(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { pb } = auth;
  const uid = auth.user.id;

  const body = (await req.json().catch(() => null)) as { articleId?: unknown } | null;
  const articleId = body?.articleId;
  if (!isPocketBaseRecordId(articleId)) {
    return NextResponse.json({ error: 'invalid article' }, { status: 400 });
  }

  try {
    await deleteReadingHistory(pb, uid, articleId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('🔴 history delete error:', JSON.stringify((e as { response?: { data?: unknown } })?.response?.data, null, 2));
    return NextResponse.json({ error: 'failed' }, { status: 400 });
  }
}
