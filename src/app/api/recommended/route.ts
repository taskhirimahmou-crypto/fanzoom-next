import { NextRequest } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getRecommendedArticles } from '@/lib/articles-server';
import {
  BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
  resolveBaselineFeedId,
} from '@/lib/recommendations/baseline';
import { isPersonalizationEnabled } from '@/lib/personalization/consent';
import { recordServedRecommendationBatchBestEffort } from '@/lib/recommender/trusted-events';
import {
  beginServerRequest,
  logRequestEvent,
  observedJson,
} from '@/lib/observability/request-context';
import { acquireSharedRateLimit, sharedRateLimitResponse } from '@/lib/shared-rate-limit/core';

export async function GET(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/recommended');
  try {
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
    const sharedLimit = await acquireSharedRateLimit(
      req,
      observation,
      ['recommended.visitor', 'recommended.user'],
      { userId: record.id, visitorId: `authenticated:${record.id}` },
    );
    const sharedBlocked = sharedRateLimitResponse(observation, sharedLimit);
    if (sharedBlocked) return sharedBlocked;
    if (!sharedLimit.permit) throw new Error('shared_rate_limit_permit_missing');
    const permit = sharedLimit.permit;

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
        observability: {
          requestId: observation.requestId,
          route: observation.route,
          permit,
        },
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
