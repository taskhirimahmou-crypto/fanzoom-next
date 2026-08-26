import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, getServerPocketBase } from '@/lib/auth-cookies';
import { getRecommendedArticles } from '@/lib/articles-server';
import {
  BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
  resolveBaselineFeedId,
} from '@/lib/recommendations/baseline';
import { isPersonalizationEnabled } from '@/lib/personalization/consent';
import { recordServedRecommendationBatchBestEffort } from '@/lib/recommender/trusted-events';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { preAuthRateLimitKey } from '@/lib/request-rate-limit';

const recommendedRequestRateLimiter = new FixedWindowRateLimiter(60, 60_000);
const globalRecommendedRequestRateLimiter = new FixedWindowRateLimiter(10_000, 60_000, 1);
const recommendedUserRateLimiter = new FixedWindowRateLimiter(30, 60_000);

function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export async function GET(req: NextRequest) {
  try {
    const globalLimit = globalRecommendedRequestRateLimiter.consume('recommended-global');
    if (!globalLimit.allowed) return rateLimited(globalLimit.retryAfterSeconds);
    const requestLimit = recommendedRequestRateLimiter.consume(
      preAuthRateLimitKey('recommended', req.cookies.get(AUTH_COOKIE)?.value),
    );
    if (!requestLimit.allowed) return rateLimited(requestLimit.retryAfterSeconds);

    const pb = await getServerPocketBase();
    const record = pb.authStore.record as { id: string } | null;
    const model = pb.authStore.model as { collectionName?: string } | null;

    if (!record || model?.collectionName !== 'users') {
      return NextResponse.json(
        { error: 'ابتدا وارد شوید' },
        { status: 401 }
      );
    }
    const userLimit = recommendedUserRateLimiter.consume(record.id);
    if (!userLimit.allowed) return rateLimited(userLimit.retryAfterSeconds);

    const requestedOffset = Number(req.nextUrl.searchParams.get('offset') || 0);
    const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(50, Math.max(1, requestedLimit))
      : 10;
    const feedId = resolveBaselineFeedId(req.nextUrl.searchParams.get('feedId'));

    const fullUser = (await pb.collection('users').getOne(record.id)) as {
      interests?: string[];
      personalizationEnabled?: boolean;
    };
    const personalizationEnabled = isPersonalizationEnabled(fullUser);

    if (!fullUser.interests || fullUser.interests.length === 0) {
      return NextResponse.json({
        articles: [],
        hasMore: false,
        feedId,
        algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
        personalizationEnabled,
      });
    }

    const articles = await getRecommendedArticles(fullUser.interests, limit, offset);
    if (personalizationEnabled) {
      await recordServedRecommendationBatchBestEffort({
        articles,
        userId: record.id,
        feedId,
        surface: 'for_you',
        algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
        offset,
      });
    }
    return NextResponse.json({
      articles,
      hasMore: articles.length === limit,
      feedId,
      algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
      personalizationEnabled,
    });
  } catch (error) {
    console.error('🔴 Recommended API error:', error);
    return NextResponse.json(
      { error: 'خطا در دریافت پیشنهادات' },
      { status: 500 }
    );
  }
}
