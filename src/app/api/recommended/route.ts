import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getRecommendedArticles } from '@/lib/articles-server';
import {
  BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
  resolveBaselineFeedId,
} from '@/lib/recommendations/baseline';
import { isPersonalizationEnabled } from '@/lib/personalization/consent';
import { recordServedRecommendationBatchBestEffort } from '@/lib/recommender/trusted-events';

export async function GET(req: NextRequest) {
  try {
    const pb = await getServerPocketBase();
    const record = pb.authStore.record as { id: string } | null;
    const model = pb.authStore.model as { collectionName?: string } | null;

    if (!record || model?.collectionName !== 'users') {
      return NextResponse.json(
        { error: 'ابتدا وارد شوید' },
        { status: 401 }
      );
    }

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
