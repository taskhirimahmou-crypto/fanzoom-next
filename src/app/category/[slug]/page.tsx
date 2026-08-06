import Link from 'next/link';
import { ArticleVisual } from '@/components/ArticleVisual';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { getImageUrl } from '@/lib/articles';
import { findCategoryBySlug, type Category } from '@/lib/categories';
import { getArticlesByCategory, type Article } from '@/lib/articles-server';
import { formatViews, relativeTime } from '@/lib/articles';
import { Breadcrumbs, breadcrumbJsonLd } from '@/components/Breadcrumbs';
import { JsonLd } from '@/components/JsonLd';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

const toneStyle = (tone: string) =>
  ({ '--c': `var(--cat-${tone})` }) as CSSProperties;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = findCategoryBySlug(slug);
  if (!cat) return { title: 'دسته پیدا نشد' };
  
  const categoryUrl = `https://fanzoom.ir/category/${cat.slug}`;
  
  return {
    title: `${cat.name} | فن زوم`,
    description: cat.description,
    alternates: { canonical: categoryUrl },
    openGraph: {
      type: 'website',
      locale: 'fa_IR',
      url: categoryUrl,
      siteName: 'فن زوم',
      title: `${cat.name} | فن زوم`,
      description: cat.description,
      images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: cat.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${cat.name} | فن زوم`,
      description: cat.description,
      images: ['/og-default.jpg'],
    },
  };
}

/* مقاله‌ی اول دسته — کارت بزرگِ افقی */
function LeadCard({ article, cat }: { article: Article; cat: Category }) {
  return (
    <Link
      href={`/article/${article.slug}`}
      className="group grid overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-low shadow-1 transition-all duration-300 ease-standard hover:-translate-y-1 hover:shadow-3 md:grid-cols-[280px_1fr]"
    >
            <ArticleVisual
        image={getImageUrl(article)}
        title={article.title}
        cat={cat}
        className="h-48 md:h-full"
        iconClassName="text-7xl"
      />
      <div className="p-6 md:p-8">
        <h2 className="text-2xl font-black leading-snug text-on-surface transition-colors group-hover:text-primary md:text-3xl">
          {article.title}
        </h2>
        <p className="mt-3 line-clamp-2 text-base leading-8 text-on-surface-variant">
          {article.excerpt}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <Icon name="schedule" className="text-base" />
            {toPersianDigits(article.readTime)} دقیقه مطالعه
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="visibility" className="text-base" />
            {formatViews(article.views)} بازدید
          </span>
          <span>{relativeTime(article.publishedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

/* بقیه‌ی مقالات — ردیف‌های فشرده */
function RowCard({ article, cat }: { article: Article; cat: Category }) {
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
        <span className="text-[11px] text-on-surface-variant">
          {relativeTime(article.publishedAt)}
        </span>
        <h3 className="mt-1.5 line-clamp-1 text-base font-bold text-on-surface transition-colors group-hover:text-primary">
          {article.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-sm text-on-surface-variant">
          {article.excerpt}
        </p>
      </div>
    </Link>
  );
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const cat = findCategoryBySlug(slug);
  if (!cat) notFound();

  const articles = await getArticlesByCategory(slug, 20);
  const [lead, ...rest] = articles;

  return (
    <main className="relative">
      {/* سربرگ دسته با پس‌زمینه‌ی tonal و آیکون ambient */}
      <header
        className="relative overflow-hidden border-b border-outline-variant/60"
        style={{
          backgroundColor: `color-mix(in srgb, var(--cat-${cat.tone}) 12%, var(--color-surface))`,
        }}
      >
        <Icon
          name={cat.symbol}
          aria-hidden
          className="pointer-events-none absolute -left-8 top-1/2 -translate-y-1/2 select-none text-[180px] text-on-surface/10 md:text-[260px]"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
          <Breadcrumbs items={[{ name: 'خانه', href: '/' }, { name: cat.name }]} />
          <JsonLd data={breadcrumbJsonLd([{ name: 'خانه', href: '/' }, { name: cat.name }])} />
          <Reveal>
            <span
              className="cat-chip inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold"
              style={toneStyle(cat.tone)}
            >
              <Icon name={cat.symbol} className="text-lg" />
              دسته‌بندی
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-on-surface md:text-6xl">
              {cat.name}
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-4 max-w-2xl text-base leading-8 text-on-surface-variant md:text-lg">
              {cat.description}
            </p>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-6 flex items-center gap-2 text-sm font-medium text-on-surface-variant">
              <Icon name="newspaper" className="text-lg" />
              {toPersianDigits(articles.length)} مقاله در این دسته
            </p>
          </Reveal>
        </div>
      </header>

      {/* فهرست مقالات */}
      <section className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        {articles.length === 0 ? (
          <Reveal>
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <Icon name="search_off" className="text-6xl text-on-surface/30" />
              <p className="text-lg font-bold text-on-surface">
                هنوز مقاله‌ای در این دسته منتشر نشده
              </p>
              <Link
                href="/"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-1 transition-all duration-300 ease-standard hover:shadow-2 hover:brightness-110 active:scale-95"
              >
                <Icon name="home" className="text-lg" />
                بازگشت به خانه
              </Link>
            </div>
          </Reveal>
        ) : (
          <>
            {lead && (
              <Reveal>
                <LeadCard article={lead} cat={cat} />
              </Reveal>
            )}
            <div className="mt-8 flex flex-col gap-5">
              {rest.map((article, i) => (
                <Reveal key={article.id} delay={i * 70}>
                  <RowCard article={article} cat={cat} />
                </Reveal>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}