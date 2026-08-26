import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { ingestRecommendationEvent } from '@/lib/recommender/event-service';
import { PocketBaseRecommendationEventRepository } from '@/lib/recommender/pocketbase-repository';
import { readPersonalizationEnabled } from '@/lib/personalization/consent';

const ingestionRateLimiter = new FixedWindowRateLimiter(120, 60_000);

export async function POST(req: NextRequest) {
  const userPb = await getServerPocketBase();
  const record = userPb.authStore.record as { id?: string; collectionName?: string } | null;
  if (!record?.id || record.collectionName !== 'users') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!(await readPersonalizationEnabled(userPb, record.id))) {
    return NextResponse.json({ error: 'personalization_disabled' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  try {
    const adminPb = await getAdminPocketBase();
    const result = await ingestRecommendationEvent(body, record.id, {
      repository: new PocketBaseRecommendationEventRepository(adminPb),
      rateLimiter: ingestionRateLimiter,
    });

    if (result.kind === 'invalid') {
      return NextResponse.json({ error: 'invalid_event', details: result.errors }, { status: 400 });
    }
    if (result.kind === 'rate_limited') {
      return NextResponse.json(
        { error: 'rate_limited', retryAfterSeconds: result.retryAfterSeconds },
        {
          status: 429,
          headers: { 'Retry-After': String(result.retryAfterSeconds) },
        },
      );
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
