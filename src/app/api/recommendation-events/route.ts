import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, getServerPocketBase } from '@/lib/auth-cookies';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { ingestRecommendationEvent } from '@/lib/recommender/event-service';
import { PocketBaseRecommendationEventRepository } from '@/lib/recommender/pocketbase-repository';
import { readPersonalizationEnabled } from '@/lib/personalization/consent';
import { preAuthRateLimitKey } from '@/lib/request-rate-limit';

const ingestionRateLimiter = new FixedWindowRateLimiter(120, 60_000);
const requestRateLimiter = new FixedWindowRateLimiter(240, 60_000);
const globalRequestRateLimiter = new FixedWindowRateLimiter(10_000, 60_000, 1);

function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export async function POST(req: NextRequest) {
  const globalLimit = globalRequestRateLimiter.consume('recommendation-events-global');
  if (!globalLimit.allowed) return rateLimited(globalLimit.retryAfterSeconds);
  const requestLimit = requestRateLimiter.consume(
    preAuthRateLimitKey('recommendation-events', req.cookies.get(AUTH_COOKIE)?.value),
  );
  if (!requestLimit.allowed) return rateLimited(requestLimit.retryAfterSeconds);

  const userPb = await getServerPocketBase();
  const record = userPb.authStore.record as { id?: string; collectionName?: string } | null;
  if (!record?.id || record.collectionName !== 'users') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  try {
    const result = await ingestRecommendationEvent(body, record.id, {
      rateLimiter: ingestionRateLimiter,
      isPersonalizationEnabled: () => readPersonalizationEnabled(userPb, record.id as string),
      getRepository: async () => {
        const adminPb = await getAdminPocketBase();
        return new PocketBaseRecommendationEventRepository(adminPb);
      },
    });

    if (result.kind === 'invalid') {
      return NextResponse.json({ error: 'invalid_event', details: result.errors }, { status: 400 });
    }
    if (result.kind === 'rate_limited') {
      return rateLimited(result.retryAfterSeconds);
    }
    if (result.kind === 'disabled') {
      return NextResponse.json({ error: 'personalization_disabled' }, { status: 403 });
    }

    return NextResponse.json(
      { ok: true, eventId: result.eventId, duplicate: result.kind === 'duplicate' },
      { status: result.kind === 'created' ? 201 : 200 },
    );
  } catch (error) {
    console.error('recommendation event ingestion failed', error);
    return NextResponse.json({ error: 'event_ingestion_failed' }, { status: 500 });
  }
}
