import Link from 'next/link';
import { ArticleVisual } from '@/components/ArticleVisual';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { BookmarkButton } from '@/components/BookmarkButton';
import type { CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { ReadingTracker } from '@/components/ReadingTracker';
import { Reveal } from '@/components/Reveal';
import type { CommentsResponse, UsersResponse } from '@/lib/pb-types';
import { getImageUrl } from '@/lib/articles';
import { CommentsSection, type CommentView } from '@/components/CommentsSection';
import { ShareButton } from '@/components/ShareButton';
import { allCategories, findCategoryBySlug } from '@/lib/categories';
import { getArticleBySlug, getRelatedArticles } from '@/lib/articles-server';
import { formatViews, relativeTime } from '@/lib/articles';
import { ViewTracker } from '@/components/ViewTracker';
import { JsonLd } from '@/components/JsonLd';
import { Breadcrumbs, breadcrumbJsonLd } from '@/components/Breadcrumbs';
import { sanitizeContent } from '@/lib/sanitize';

type Props = { params: Promise<{ slug: string }> };

const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

const toneStyle = (tone: string) =>
  ({ '--c': `var(--cat-${tone})` }) as CSSProperties;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: 'مقاله پیدا نشد' };

  const articleUrl = `https://fanzoom.ir/article/${article.slug}`;
  const imageUrl = getImageUrl(article);
  const cat = findCategoryBySlug(article.category) ?? allCategories[0];

  return {
    title: article.title,
    description: article.excerpt,
    
    // canonical مخصوص این مقاله
    alternates: { canonical: articleUrl },
    
    // Open Graph داینامیک (برای تلگرام، لینکدین، فیسبوک)
    openGraph: {
      type: 'article',
      locale: 'fa_IR',
      url: articleUrl,
      siteName: 'فن زوم',
      title: article.title,
      description: article.excerpt,
      ...(imageUrl ? { images: [{ url: imageUrl, width: 1200, height: 630, alt: article.title }] } : {}),
      publishedTime: article.publishedAt,
      modifiedTime: article.updated ?? article.publishedAt,
      authors: [article.author || 'تحریریه فن زوم'],
      section: cat.name,
      tags: [cat.name, 'فناوری'],
    },
    
    // Twitter Card
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title: article.title,
      description: article.excerpt,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const cat = findCategoryBySlug(article.category) ?? allCategories[0];
  const related = await getRelatedArticles(article.category, article.id, 3);
    // آیا کاربر لاگین این مقاله را نشان کرده است؟
  const pb = await getServerPocketBase();
  const userId = pb.authStore.record?.id ?? null;
  let bookmarked = false;
  if (userId) {
    try {
      await pb.collection('bookmarks').getFirstListItem(
        pb.filter('user = {:uid} && article = {:aid}', {
          uid: userId,
          aid: article.id,
        }),
      );
      bookmarked = true;
    } catch {
      bookmarked = false;
    }
  }


     // کامنت‌های تأییدشده‌ی این مقاله
  let comments: CommentView[] = [];
  try {
    const cRes = await pb.collection('comments').getList<CommentsResponse<{ user: UsersResponse }>>(1, 100, {
      filter: pb.filter('article = {:aid} && status = "approved"', { aid: article.id }),
      expand: 'user',
    });

    comments = cRes.items
      .map((c) => {
        const u = c.expand?.user;
        const name = u?.displayName || u?.email || 'کاربر';
        const initial = name[0] || 'ک';

        return {
          id: c.id,
          body: c.content || '',
          created: c.created || (c as unknown as { autodate?: string }).autodate || c.updated || '',
          authorName: name,
          authorInitial: initial,
        };
      })
      .sort((a, b) => (a.created < b.created ? 1 : -1)); // جدیدترین اول
  } catch {
    comments = [];
  }
  // ── پایان تست تشخیصی ──



  return (
    <main className="relative">
      {/* Structured Data برای Google News و rich results */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: article.title,
          description: article.excerpt,
          ...(getImageUrl(article) ? { image: getImageUrl(article) } : {}),
          datePublished: article.publishedAt,
          dateModified: article.updated ?? article.publishedAt,
          author: {
            '@type': 'Person',
            name: article.author || 'تحریریه فن زوم',
          },
          publisher: {
            '@type': 'Organization',
            name: 'فن زوم',
            logo: {
              '@type': 'ImageObject',
              url: 'https://fanzoom.ir/og-default.jpg',
            },
          },
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `https://fanzoom.ir/article/${article.slug}`,
          },
        }}
      />

      {/* ViewTracker - فقط وقتی صفحه واقعاً باز شد ویو رو زیاد می‌کنه */}
      <ViewTracker articleId={article.id} />

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
        <Breadcrumbs
          items={[
            { name: 'خانه', href: '/' },
            { name: cat.name, href: `/category/${cat.slug}` },
            { name: article.title },
          ]}
        />
        <JsonLd
          data={breadcrumbJsonLd([
            { name: 'خانه', href: '/' },
            { name: cat.name, href: `/category/${cat.slug}` },
            { name: article.title },
          ])}
        />
        <Reveal>
          <div className="mt-5 flex items-center justify-end gap-4">
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
                {article.author || 'تحریریه فن زوم'}
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
            <span className="ms-auto flex items-center gap-2">
              <BookmarkButton
                articleId={article.id}
                initialBookmarked={bookmarked}
                signedIn={!!userId}
              />
              <ShareButton />
            </span>
          </div>
        </Reveal>

        {/* hero tonal با آیکون دسته */}
                <Reveal delay={260}>
          <ArticleVisual
            image={getImageUrl(article)}
            title={article.title}
            cat={cat}
            className="mt-8 h-64 rounded-2xl border border-outline-variant/60 md:h-80"
            iconClassName="text-9xl animate-float-soft"
            priority
          />
        </Reveal>

        {/* محتوای مقاله */}
        <Reveal delay={320}>
          <div
            className="article-content mt-10"
            dangerouslySetInnerHTML={{ __html: sanitizeContent(article.content) }}
          />
                  <ReadingTracker articleId={article.id} signedIn={!!userId} />
                  <CommentsSection
          articleId={article.id}
          signedIn={!!userId}
          comments={comments}
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