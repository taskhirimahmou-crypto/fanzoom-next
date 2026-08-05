import Link from 'next/link';
import { ArticleVisual } from '@/components/ArticleVisual';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { getImageUrl } from '@/lib/articles';

import { SearchBox } from '@/components/SearchBox';
import { allCategories, findCategoryBySlug } from '@/lib/categories';
import { searchArticles, type Article } from '@/lib/articles-server';
import { formatViews, relativeTime } from '@/lib/articles';

type Props = { searchParams: Promise<{ q?: string }> };

const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

const toneStyle = (tone: string) =>
  ({ '--c': `var(--cat-${tone})` }) as CSSProperties;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim();
  const searchUrl = query
    ? `https://fanzoom.ir/search?q=${encodeURIComponent(query)}`
    : 'https://fanzoom.ir/search';
  
  return {
    title: query ? `جستجو برای «${query}» | فن زوم` : 'جستجو | فن زوم',
    description: query
      ? `نتایج جستجو برای «${query}» در پایگاه خبری فن زوم`
      : 'جستجو در مقالات پایگاه خبری فن زوم',
    alternates: { canonical: searchUrl },
    robots: { index: false, follow: true }, // صفحات جستجو ایندکس نشوند (duplicate content)
  };
}

function ResultRow({ article }: { article: Article }) {
  const cat = findCategoryBySlug(article.category) ?? allCategories[0];
  return (
    <Link
      href={`/article/${article.slug}`}
      className="group flex gap-4 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-4 shadow-1 transition-all duration-300 ease-standard hover:-translate-y-0.5 hover:shadow-2"
    >
            <ArticleVisual
        image={getImageUrl(article)}
        title={article.title}
        cat={cat}
        className="h-20 w-20 shrink-0 rounded-xl"
        iconClassName="text-3xl"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="cat-chip rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={toneStyle(cat.tone)}
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
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const results = query ? await searchArticles(query, 30) : [];

  return (
    <main className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[380px] bg-gradient-to-b from-primary-container/20 to-transparent"
      />

      <div className="mx-auto max-w-4xl px-4 py-12 md:px-6">
        {/* جستجو — در مرکز توجه */}
        <Reveal>
          <SearchBox initialQuery={query} />
        </Reveal>

        {query ? (
          results.length > 0 ? (
            <>
              <Reveal delay={100}>
                <p className="mt-8 text-sm text-on-surface-variant">
                  {toPersianDigits(results.length)} نتیجه برای{' '}
                  <span className="font-bold text-on-surface">«{query}»</span>
                </p>
              </Reveal>
              <div className="mt-5 flex flex-col gap-5">
                {results.map((article, i) => (
                  <Reveal key={article.id} delay={i * 60}>
                    <ResultRow article={article} />
                  </Reveal>
                ))}
              </div>
            </>
          ) : (
            <Reveal delay={100}>
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <Icon name="search_off" className="text-6xl text-on-surface/30" />
                <p className="text-lg font-bold text-on-surface">
                  نتیجه‌ای برای «{query}» پیدا نشد
                </p>
                <p className="max-w-md text-sm leading-7 text-on-surface-variant">
                  املای دیگری را امتحان کنید، یا یکی از دسته‌بندی‌های زیر را مرور کنید.
                </p>
              </div>
            </Reveal>
          )
        ) : (
          <Reveal delay={100}>
            <div className="mt-12">
              <p className="text-center text-sm font-bold text-on-surface-variant">
                یا در دسته‌بندی‌ها مرور کنید
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {allCategories.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/category/${cat.slug}`}
                    className="cat-chip group inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-all duration-300 ease-standard hover:-translate-y-0.5 hover:shadow-1 active:scale-95"
                    style={toneStyle(cat.tone)}
                  >
                    <Icon
                      name={cat.symbol}
                      className="text-lg transition-transform duration-300 ease-decelerate group-hover:scale-110"
                    />
                    {cat.name}
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </main>
  );
}