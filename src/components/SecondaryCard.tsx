import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArticleVisual } from '@/components/ArticleVisual';
import { Icon } from '@/components/Icon';
import { allCategories, findCategoryBySlug } from '@/lib/categories';
import { getImageUrl, relativeTime } from '@/lib/articles';
import type { Article } from '@/lib/articles-server';

const toneStyle = (tone: string) =>
  ({ '--c': `var(--cat-${tone})` }) as CSSProperties;

const catOf = (slug: string) => findCategoryBySlug(slug) ?? allCategories[0];
const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export function SecondaryCard({ article }: { article: Article }) {
  const cat = catOf(article.category);
  return (
    <Link
      href={`/article/${article.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-low shadow-1 transition-all duration-300 ease-standard hover:-translate-y-1 hover:shadow-3"
    >
      <ArticleVisual
        image={getImageUrl(article)}
        title={article.title}
        cat={cat}
        className="h-28"
        iconClassName="text-5xl"
      />
      <div className="flex flex-1 flex-col p-5">
        <span
          className="cat-chip self-start rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          style={toneStyle(cat.tone)}
        >
          {cat.name}
        </span>
        <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-7 text-on-surface transition-colors group-hover:text-primary">
          {article.title}
        </h3>
        <div className="mt-auto flex items-center gap-3 pt-3 text-[11px] text-on-surface-variant">
          <span>{relativeTime(article.publishedAt)}</span>
          <span className="flex items-center gap-1">
            <Icon name="schedule" className="text-sm" />
            {toPersianDigits(article.readTime)} دقیقه
          </span>
        </div>
      </div>
    </Link>
  );
}