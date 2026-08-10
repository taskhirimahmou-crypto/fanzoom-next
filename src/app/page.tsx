import Link from 'next/link';
import { ArticleVisual } from '@/components/ArticleVisual';
import type { CSSProperties } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { cache } from 'react';
import { getRecommendedArticles } from '@/lib/articles-server';
import { allCategories, findCategoryBySlug } from '@/lib/categories';
import { getHomePageData, type Article } from '@/lib/articles-server';
import { formatViews, relativeTime } from '@/lib/articles';
import { getImageUrl } from '@/lib/articles';

const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://fanzoom.ir/#website',
      url: 'https://fanzoom.ir',
      name: 'فن زوم',
      description: 'پایگاه خبری فناوری ایران',
      inLanguage: 'fa-IR',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://fanzoom.ir/search?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      '@id': 'https://fanzoom.ir/#organization',
      name: 'فن زوم',
      url: 'https://fanzoom.ir',
      logo: {
        '@type': 'ImageObject',
        url: 'https://fanzoom.ir/logo.webp',
      },
    },
  ],
};

const getCurrentUser = cache(async () => {
  const pb = await getServerPocketBase();
  const record = pb.authStore.record as
    | { id: string; email: string; displayName?: string }
    | null;
  return record
    ? { id: record.id, email: record.email, displayName: record.displayName }
    : null;
});

export const dynamic = 'force-dynamic';

const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

const toneStyle = (tone: string) =>
  ({ '--c': `var(--cat-${tone})` }) as CSSProperties;

const catOf = (slug: string) => findCategoryBySlug(slug) ?? allCategories[0];

function SectionTitle({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-container text-on-primary-container">
        <Icon name={icon} className="text-xl" />
      </span>
      <h2 className="text-xl font-black text-on-surface md:text-2xl">{title}</h2>
      <span className="h-px flex-1 bg-outline-variant/60" />
    </div>
  );
}

function FeaturedCard({ article }: { article: Article }) {
  const cat = catOf(article.category);
  return (
    <Link
      href={`/article/${article.slug}`}
      className="group block h-full overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-low shadow-1 transition-all duration-300 ease-standard hover:-translate-y-1 hover:shadow-3"
    >
      <div className="relative">
        <ArticleVisual
          image={getImageUrl(article)}
          title={article.title}
          cat={cat}
          className="h-56 md:h-72"
          iconClassName="text-8xl"
          priority={true}
        />
        <span
          className="cat-chip absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold"
          style={toneStyle(cat.tone)}
        >
          {cat.name}
        </span>
      </div>
      <div className="p-6 md:p-8">
        <h2 className="text-2xl font-black leading-snug text-on-surface transition-colors group-hover:text-primary md:text-4xl md:leading-tight">
          {article.title}
        </h2>
        <p className="mt-4 line-clamp-2 text-base leading-8 text-on-surface-variant">
          {article.excerpt}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-on-surface-variant">
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

function SecondaryCard({ article }: { article: Article }) {
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

function LatestRow({ article }: { article: Article }) {
  const cat = catOf(article.category);
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

function TrendingItem({ article, rank }: { article: Article; rank: number }) {
  const cat = catOf(article.category);
  return (
    <Link
      href={`/article/${article.slug}`}
      className="group flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-on-surface/8"
    >
      <span className="text-3xl font-black text-outline-variant/60 transition-colors group-hover:text-primary">
        {toPersianDigits(rank)}
      </span>
      <div className="min-w-0">
        <h4 className="line-clamp-2 text-sm font-bold leading-6 text-on-surface transition-colors group-hover:text-primary">
          {article.title}
        </h4>
        <span className="mt-1 block text-[11px] text-on-surface-variant">
          {cat.name} · {formatViews(article.views)} بازدید
        </span>
      </div>
    </Link>
  );
}
export const metadata = {
  title: 'فن زوم | اخبار فناوری، هوش مصنوعی و نوآوری',
  description: 'فن زوم - رسانه خبری فناوری با پوشش آخرین اخبار موبایل، سخت‌افزار، هوش مصنوعی، امنیت سایبری، گیمینگ و نوآوری‌های تکنولوژی',
  openGraph: {
    title: 'فن زوم | اخبار فناوری',
    description: 'رسانه خبری فناوری با پوشش آخرین اخبار و تحلیل‌ها',
    type: 'website',
    url: 'https://fanzoom.ir',
    siteName: 'فن زوم',
    locale: 'fa_IR',
    images: [
      {
        url: '/og-default.jpg',
        width: 1200,
        height: 630,
        alt: 'فن زوم - اخبار فناوری',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'فن زوم | اخبار فناوری',
    description: 'رسانه خبری فناوری با پوشش آخرین اخبار و تحلیل‌ها',
    images: ['/og-default.jpg'],
  },
  alternates: {
    canonical: 'https://fanzoom.ir',
  },
};
export default async function HomePage() {
  const { featured, secondary, latest, trending } = await getHomePageData();

  // ── مقالات پیشنهادی بر اساس علاقه‌مندی‌ها ──
// ── مقالات پیشنهادی بر اساس علاقه‌مندی‌ها ──
let recommended: Article[] = [];
let debugInfo = { user: null as string | null, interests: [] as string[], count: 0 };

const user = await getCurrentUser();
debugInfo.user = user?.id || null;

if (user) {
  try {
    const pb = await getServerPocketBase();
    const fullUser = (await pb.collection('users').getOne(user.id)) as {
      interests?: string[];
    };
    debugInfo.interests = fullUser.interests || [];
    
    if (fullUser.interests && fullUser.interests.length > 0) {
      recommended = await getRecommendedArticles(fullUser.interests, 4);
      debugInfo.count = recommended.length;
    }
    
    console.error('🟢 HomePage debug:', JSON.stringify(debugInfo));
  } catch (err) {
    console.error('🔴 HomePage error:', err);
    recommended = [];
  }
} else {
  console.error('🟡 HomePage: user not logged in');
}
  

  const featuredArticle = featured ?? latest[0] ?? null;
  const secondaryArticles = featured ? secondary : latest.slice(1, 3);
  const breakingNews = latest.map((a) => a.title);

  return (
    
    <main className="relative pcb-bg">
      <script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
/>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-b from-primary-container/20 to-transparent"
      />

      {/* نوار خبر فوری (از آخرین مقالات) */}
      {breakingNews.length > 0 && (
        <div className="border-b border-outline-variant/60 bg-surface-container">
          <div className="mx-auto flex h-11 max-w-7xl items-center gap-4 px-4 md:px-6">
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-error px-3 py-1 text-xs font-bold text-on-error">
              <Icon name="bolt" fill className="text-sm" />
              فوری
            </span>
            <div className="flex-1 overflow-hidden" dir="ltr">
              <div className="flex w-max animate-[marquee_45s_linear_infinite] gap-14 whitespace-nowrap">
                {[...breakingNews, ...breakingNews].map((news, i) => (
                  <span
                    key={i}
                    dir="rtl"
                    className="flex items-center gap-2 text-sm text-on-surface-variant"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {news}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* بخش ویژه */}
 {featuredArticle && (
  <section className="mx-auto max-w-7xl px-4 py-10 md:px-6">
    <div className="grid gap-6 lg:grid-cols-3">
      {/* FeaturedCard بدون Reveal — LCP element نباید انیمیشن داشته باشد */}
      <div className="h-full lg:col-span-2">
        <FeaturedCard article={featuredArticle} />
      </div>
      <div className="grid gap-6 lg:grid-rows-2">
        {secondaryArticles.slice(0, 2).map((article, i) => (
          <Reveal key={article.id} delay={120 + i * 120} className="h-full">
            <SecondaryCard article={article} />
          </Reveal>
        ))}
      </div>
    </div>
  </section>
)}

{/* پیشنهاد برای شما — فقط برای کاربر لاگین‌شده با علاقه‌مندی */}
{/* DEBUG - بعد از تست حذف شود */}
{user && (
  <div className="mx-auto max-w-7xl px-4 py-4 md:px-6">
    <div className="rounded-xl border border-warning bg-warning-container p-4 text-xs">
      <strong>DEBUG:</strong> user: {debugInfo.user?.slice(0, 8)}... | 
      interests: [{debugInfo.interests.join(', ')}] | 
      recommended count: {debugInfo.count}
    </div>
  </div>
)}
{recommended.length > 0 && (
  <section className="mx-auto max-w-7xl px-4 py-6 md:px-6">
    <SectionTitle icon="auto_awesome" title="پیشنهاد برای شما" />
    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {recommended.map((article) => (
        <SecondaryCard key={article.id} article={article} />
      ))}
    </div>
  </section>
)}

      {/* آخرین اخبار + داغ‌ترین‌ها */}
      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="grid gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SectionTitle icon="newspaper" title="آخرین اخبار" />
            <div className="mt-6 flex flex-col gap-5">
              {latest.map((article, i) => (
                <Reveal key={article.id} delay={i * 80}>
                  <LatestRow article={article} />
                </Reveal>
              ))}
            </div>
          </div>
          <aside>
            <SectionTitle icon="trending_up" title="داغ‌ترین‌ها" />
            <div className="mt-4 flex flex-col gap-1">
              {trending.map((article, i) => (
                <Reveal key={article.id} delay={i * 80}>
                  <TrendingItem article={article} rank={i + 1} />
                </Reveal>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {/* کاوش دسته‌بندی‌ها */}
      <section className="mx-auto max-w-7xl px-4 py-10 pb-20 md:px-6">
        <SectionTitle icon="bolt" title="کاوش در دسته‌بندی‌ها" />
        <div className="mt-6 flex flex-wrap gap-3">
          {allCategories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              className="cat-chip group inline-flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-bold transition-all duration-300 ease-standard hover:-translate-y-0.5 hover:shadow-1 active:scale-95"
              style={toneStyle(cat.tone)}
            >
              <Icon
                name={cat.symbol}
                className="text-xl transition-transform duration-300 ease-decelerate group-hover:scale-110"
              />
              {cat.name}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}