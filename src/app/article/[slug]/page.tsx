import Link from 'next/link';
import { ArticleVisual } from '@/components/ArticleVisual';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { ShareButton } from '@/components/ShareButton';
import { allCategories, findCategoryBySlug } from '@/lib/categories';
import {
  getArticleBySlug,
  getRelatedArticles,
  formatViews,
  relativeTime,
} from '@/lib/articles';

type Props = { params: Promise<{ slug: string }> };

const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

const toneStyle = (tone: string) =>
  ({ '--c': `var(--cat-${tone})` }) as CSSProperties;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: 'مقاله پیدا نشد' };
  return {
    title: article.title,
    description: article.excerpt,
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: 'article',
      ...(article.image ? { images: [{ url: article.image }] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const cat = findCategoryBySlug(article.category) ?? allCategories[0];
  const related = await getRelatedArticles(article, 3);

  return (
    <main className="relative">
      {/* لایه‌ی ambient tonal بر اساس رنگ دسته */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px]"
        style={{
          background: `linear-gradient(to bottom, color-mix(in srgb, var(--cat-${cat.tone}) 14%, var(--color-surface)), transparent)`,
        }}
      />

      <article className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        {/* بازگشت + دسته */}
        <Reveal>
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-on-surface/8 hover:text-on-surface"
            >
              <Icon
                name="arrow_back"
                mirror
                className="text-lg transition-transform duration-300 ease-standard group-hover:translate-x-0.5"
              />
              بازگشت به خانه
            </Link>
            <Link
              href={`/category/${cat.slug}`}
              className="cat-chip rounded-full px-4 py-1.5 text-sm font-bold transition-transform duration-300 ease-standard hover:scale-105 active:scale-95"
              style={toneStyle(cat.tone)}
            >
              {cat.name}
            </Link>
          </div>
        </Reveal>

        {/* تیتر */}
        <Reveal delay={80}>
          <h1 className="mt-8 text-3xl font-black leading-[1.35] tracking-tight text-on-surface md:text-5xl md:leading-[1.3]">
            {article.title}
          </h1>
        </Reveal>

        {/* خلاصه */}
        {article.excerpt && (
          <Reveal delay={140}>
            <p className="mt-5 text-lg leading-9 text-on-surface-variant md:text-xl md:leading-10">
              {article.excerpt}
            </p>
          </Reveal>
        )}

        {/* نوار meta */}
        <Reveal delay={200}>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-outline-variant/60 py-4 text-sm text-on-surface-variant">
            <span className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-container text-sm font-black text-on-primary-container">
                {(article.author || 'ف')[0]}
              </span>
              <span className="font-medium text-on-surface">
                {article.author || 'تحریریه فنزوم'}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="schedule" className="text-lg" />
              {toPersianDigits(article.readTime)} دقیقه مطالعه
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="visibility" className="text-lg" />
              {formatViews(article.views)} بازدید
            </span>
            <span>{relativeTime(article.publishedAt)}</span>
            <span className="ms-auto">
              <ShareButton />
            </span>
          </div>
        </Reveal>

        {/* hero tonal با آیکون دسته */}
                <Reveal delay={260}>
          <ArticleVisual
            image={article.image}
            title={article.title}
            cat={cat}
            className="mt-8 h-64 rounded-2xl border border-outline-variant/60 md:h-80"
            iconClassName="text-9xl animate-float-soft"
          />
        </Reveal>

        {/* محتوای مقاله */}
        <Reveal delay={320}>
          <div
            className="article-content mt-10"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </Reveal>

        {/* مقالات مرتبط */}
        {related.length > 0 && (
          <Reveal delay={100}>
            <aside className="mt-14 border-t border-outline-variant/60 pt-8">
              <h2 className="flex items-center gap-2.5 text-xl font-black text-on-surface">
                <Icon name="newspaper" className="text-2xl text-primary" />
                مقالات مرتبط
              </h2>
              <div className="mt-5 flex flex-col gap-3">
                {related.map((rel) => {
                  const relCat = findCategoryBySlug(rel.category) ?? allCategories[0];
                  return (
                    <Link
                      key={rel.id}
                      href={`/article/${rel.slug}`}
                      className="group flex items-center gap-4 rounded-xl border border-outline-variant/60 bg-surface-container-low p-3.5 shadow-1 transition-all duration-300 ease-standard hover:-translate-y-0.5 hover:shadow-2"
                    >
                      <ArticleVisual
                        image={rel.image}
                        title={rel.title}
                        cat={relCat}
                        className="h-14 w-14 shrink-0 rounded-lg"
                        iconClassName="text-2xl"
                      />
                      <span className="min-w-0">
                        <span className="line-clamp-1 block text-sm font-bold text-on-surface transition-colors group-hover:text-primary">
                          {rel.title}
                        </span>
                        <span className="mt-1 block text-xs text-on-surface-variant">
                          {relativeTime(rel.publishedAt)} · {formatViews(rel.views)} بازدید
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </aside>
          </Reveal>
        )}
      </article>
    </main>
  );
}