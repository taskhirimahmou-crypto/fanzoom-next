'use client';

import { useState, useCallback } from 'react';
import { SecondaryCard } from '@/components/SecondaryCard';
import { Icon } from '@/components/Icon';
import type { Article } from '@/lib/articles-server';

interface Props {
  initialArticles: Article[];
}

export function ForYouClient({ initialArticles }: Props) {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialArticles.length >= 10);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/recommended?offset=${articles.length}&limit=10`
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
  }, [articles.length, loading, hasMore]);

  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {articles.map((article) => (
          <SecondaryCard key={article.id} article={article} />
        ))}
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