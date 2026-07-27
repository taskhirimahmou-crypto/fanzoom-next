'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ArticleVisual } from '@/components/ArticleVisual';
import { findCategoryBySlug, allCategories } from '@/lib/categories';
import { formatViews, relativeTime } from '@/lib/articles';
import type { Article } from '@/lib/articles-server';

export function BookmarkRow({ article }: { article: Article }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [gone, setGone] = useState(false);
  const cat = findCategoryBySlug(article.category) ?? allCategories[0];

  const remove = async () => {
    setRemoving(true);
    const res = await fetch('/api/bookmarks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: article.id }),
    });
    if (res.ok) {
      setGone(true);
      setTimeout(() => router.refresh(), 250);
    } else {
      setRemoving(false);
    }
  };

  return (
    <div
      className={`group relative flex items-center gap-2 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-4 shadow-1 transition-all duration-300 ease-standard hover:-translate-y-0.5 hover:shadow-2 ${
        gone ? 'scale-95 opacity-0' : ''
      }`}
    >
      <Link href={`/article/${article.slug}`} className="flex min-w-0 flex-1 gap-4">
        <ArticleVisual
          image={article.image}
          title={article.title}
          cat={cat}
          className="h-20 w-20 shrink-0 rounded-xl"
          iconClassName="text-3xl"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="cat-chip rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ '--c': `var(--cat-${cat.tone})` } as CSSProperties}
            >
              {cat.name}
            </span>
            <span className="text-[11px] text-on-surface-variant">
              {relativeTime(article.publishedAt)}
            </span>
          </div>
          <h3 className="mt-2 line-clamp-1 text-base font-bold text-on-surface transition-colors group-hover:text-primary">
            {article.title}
          </h3>
          <p className="mt-1 line-clamp-1 text-sm text-on-surface-variant">
            {article.excerpt}
          </p>
        </div>
      </Link>

      {/* حذف از نشان‌شده‌ها */}
      <button
        type="button"
        onClick={remove}
        disabled={removing}
        aria-label="حذف از نشان‌شده‌ها"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant transition-all duration-200 ease-standard hover:bg-error/10 hover:text-error active:scale-90 disabled:opacity-50"
      >
        <Icon
          name={removing ? 'progress_activity' : 'bookmark'}
          fill={!removing}
          className={`text-xl ${removing ? 'animate-spin' : ''}`}
        />
      </button>
    </div>
  );
}