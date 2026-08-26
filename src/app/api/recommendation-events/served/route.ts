import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getRecommendedArticles } from '@/lib/articles-server';
import { readPersonalizationEnabled } from '@/lib/personalization/consent';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { validateServedBatchRequest } from '@/lib/recommender/served-batch';
import { recordServedRecommendationBatch } from '@/lib/recommender/trusted-events';

const servedRateLimiter = new FixedWindowRateLimiter(30, 60_000);

export async function POST(req: NextRequest) {
  const pb = await getServerPocketBase();
  const record = pb.authStore.record as { id?: string; collectionName?: string } | null;
  if (!record?.id || record.collectionName !== 'users') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await readPersonalizationEnabled(pb, record.id))) {
    return NextResponse.json({ error: 'personalization_disabled' }, { status: 403 });
  }

  const parsed = validateServedBatchRequest(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_batch' }, { status: 400 });

  const rateLimit = servedRateLimiter.consume(record.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    );
  }

  const user = (await pb.collection('users').getOne(record.id, {
    fields: 'interests',
  })) as { interests?: string[] };
  if (!user.interests?.length) {
    return NextResponse.json({
      ok: true,
      total: 0,
      created: 0,
      duplicates: 0,
      failures: [],
    });
  }

  // Client submits only feed coordinates. The authenticated server reconstructs
  // the canonical baseline articles, article IDs, and ranks.
  const articles = await getRecommendedArticles(
    user.interests,
    parsed.value.articleIds.length,
    parsed.value.offset,
  );
  if (
    articles.length !== parsed.value.articleIds.length ||
    !articles.every((article, index) => article.id === parsed.value.articleIds[index])
  ) {
    return NextResponse.json({ error: 'feed_changed' }, { status: 409 });
  }
  try {
    const result = await recordServedRecommendationBatch({
      articles,
      userId: record.id,
      feedId: parsed.value.feedId,
      surface: parsed.value.surface,
      algorithmVersion: parsed.value.algorithmVersion,
      offset: parsed.value.offset,
    });
    if (result.kind === 'disabled') {
      return NextResponse.json({ error: 'personalization_disabled' }, { status: 403 });
    }
    if (result.kind === 'partial_failure') {
      return NextResponse.json(
        {
          ok: false,
          partial: result.created + result.duplicates > 0,
          total: result.total,
          created: result.created,
          duplicates: result.duplicates,
          failures: result.failures,
        },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      total: result.total,
      created: result.created,
      duplicates: result.duplicates,
      failures: [],
    });
  } catch (error) {
    console.error('served recommendation batch failed', error);
    return NextResponse.json({ error: 'served_batch_failed' }, { status: 500 });
  }
}
