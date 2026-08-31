'use client';

import { useState, useCallback } from 'react';
import { SecondaryCard } from '@/components/SecondaryCard';
import { Icon } from '@/components/Icon';
import type { Article } from '@/lib/articles-server';
import { RecommendationImpressionBoundary } from '@/components/RecommendationImpressionBoundary';
import { RecommendationServedReporter } from '@/components/RecommendationServedReporter';
import { BASELINE_RECOMMENDATION_ALGORITHM_VERSION } from '@/lib/recommendations/baseline';

interface Props {
  initialArticles: Article[];
  initialFeedId: string;
  algorithmVersion: typeof BASELINE_RECOMMENDATION_ALGORITHM_VERSION;
  personalizationEnabled: boolean;
}

export function ForYouClient({
  initialArticles,
  initialFeedId,
  algorithmVersion,
  personalizationEnabled,
}: Props) {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialArticles.length >= 10);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/recommended?offset=${articles.length}&limit=10&feedId=${encodeURIComponent(initialFeedId)}`
      );
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setArticles((prev) => [...prev, ...data.articles]);
      setHasMore(data.hasMore);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [articles.length, initialFeedId, loading, hasMore]);

  return (
    <div data-feed-id={initialFeedId} data-algorithm-version={algorithmVersion}>
      <RecommendationServedReporter
        feedId={initialFeedId}
        surface="for_you"
        algorithmVersion={algorithmVersion}
        offset={0}
        articleIds={initialArticles.map((article) => article.id)}
        enabled={personalizationEnabled}
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {articles.map((article, index) => {
          const attribution = {
            feedId: initialFeedId,
            rank: index + 1,
            surface: 'for_you' as const,
            algorithmVersion,
          };
          return (
            <RecommendationImpressionBoundary
              key={article.id}
              articleId={article.id}
              attribution={attribution}
              enabled={personalizationEnabled}
            >
              <SecondaryCard article={article} attribution={attribution} />
            </RecommendationImpressionBoundary>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-on-primary shadow-1 transition-all hover:shadow-2 hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
                در حال بارگذاری...
              </>
            ) : (
              <>
                <Icon name="refresh" className="text-lg" />
                مشاهده موارد بیشتر
              </>
            )}
          </button>
        </div>
      )}

      {!hasMore && articles.length > 0 && (
        <p className="mt-10 text-center text-sm text-on-surface-variant">
          همه مقالات پیشنهادی نمایش داده شد ✨
        </p>
      )}
    </div>
  );
}
