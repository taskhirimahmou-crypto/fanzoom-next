import { NextRequest } from 'next/server';
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
import {
  beginServerRequest,
  logRequestEvent,
  observedJson,
  type ServerRequestContext,
} from '@/lib/observability/request-context';

const recommendedRequestRateLimiter = new FixedWindowRateLimiter(60, 60_000);
const globalRecommendedRequestRateLimiter = new FixedWindowRateLimiter(10_000, 60_000, 1);
const recommendedUserRateLimiter = new FixedWindowRateLimiter(30, 60_000);

function rateLimited(context: ServerRequestContext, retryAfterSeconds: number) {
  logRequestEvent(context, 'warn', 'rate_limit_exceeded', 429, {
    errorCode: 'recommended_rate_limited',
  });
  return observedJson(
    context,
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    { errorCode: 'recommended_rate_limited' },
  );
}

export async function GET(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/recommended');
  try {
    const globalLimit = globalRecommendedRequestRateLimiter.consume('recommended-global');
    if (!globalLimit.allowed) return rateLimited(observation, globalLimit.retryAfterSeconds);
    const requestLimit = recommendedRequestRateLimiter.consume(
      preAuthRateLimitKey('recommended', req.cookies.get(AUTH_COOKIE)?.value),
    );
    if (!requestLimit.allowed) return rateLimited(observation, requestLimit.retryAfterSeconds);

    const pb = await getServerPocketBase(observation.requestId);
    const record = pb.authStore.record as { id: string } | null;
    const model = pb.authStore.model as { collectionName?: string } | null;

    if (!record || model?.collectionName !== 'users') {
      return observedJson(
        observation,
        { error: 'ابتدا وارد شوید' },
        { status: 401 },
        { errorCode: 'unauthorized' },
      );
    }
    const userLimit = recommendedUserRateLimiter.consume(record.id);
    if (!userLimit.allowed) return rateLimited(observation, userLimit.retryAfterSeconds);

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
      logRequestEvent(observation, 'warn', 'recommended_feed_empty', 200, {
        feedId,
        algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
        errorCode: 'user_has_no_interests',
      });
      return observedJson(observation, {
        articles: [],
        hasMore: false,
        feedId,
        algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
        personalizationEnabled,
      }, {}, { feedId, algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION });
    }

    const articles = await getRecommendedArticles(fullUser.interests, limit, offset);
    if (articles.length === 0) {
      logRequestEvent(observation, 'warn', 'recommended_feed_empty', 200, {
        feedId,
        algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
        errorCode: 'no_matching_articles',
      });
    }
    if (personalizationEnabled) {
      const served = await recordServedRecommendationBatchBestEffort({
        articles,
        userId: record.id,
        feedId,
        surface: 'for_you',
        algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
        offset,
        observability: { requestId: observation.requestId, route: observation.route },
      });
      if (served.kind === 'partial_failure') {
        logRequestEvent(observation, 'error', 'served_partial_failure', 200, {
          feedId,
          algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
          errorCode: 'served_partial_failure',
        });
      } else if (served.kind === 'failed') {
        logRequestEvent(observation, 'error', 'pocketbase_failure', 200, {
          feedId,
          algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
          errorCode: 'served_write_failed',
        });
      }
    }
    return observedJson(observation, {
      articles,
      hasMore: articles.length === limit,
      feedId,
      algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
      personalizationEnabled,
    }, {}, { feedId, algorithmVersion: BASELINE_RECOMMENDATION_ALGORITHM_VERSION });
  } catch {
    logRequestEvent(observation, 'error', 'pocketbase_failure', 500, {
      errorCode: 'recommended_feed_failed',
    });
    return observedJson(
      observation,
      { error: 'خطا در دریافت پیشنهادات' },
      { status: 500 },
      { errorCode: 'recommended_feed_failed' },
    );
  }
}
