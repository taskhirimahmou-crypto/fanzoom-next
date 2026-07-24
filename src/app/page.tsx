import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { allCategories, findCategory } from '@/lib/categories';

/* ─────────── داده‌ی نمونه ───────────
   PLACEHOLDER — در فاز ۳ با داده‌ی واقعی PocketBase جایگزین می‌شود. */
type Article = {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: number;
  views: string;
  time: string;
};

const breakingNews = [
  'نسل جدید پردازنده‌های پرچمدار با جهش ۴۰ درصدی عملکرد رونمایی شد',
  'هشدار امنیتی جدید برای میلیاردها دستگاه اندرویدی منتشر شد',
  'کنسول نسل بعدی سونی زودتر از انتظار به بازار می‌آید',
  'به‌روزرسانی بزرگ اندروید ۱۶ با قابلیت‌های هوش مصنوعی منتشر شد',
];

const featured: Article = {
  id: 'ai-phones-revolution',
  title: 'هوش مصنوعی مولد به گوشی‌های میان‌رده می‌آید؛ انقلابی در راه است',
  excerpt:
    'سازندگان بزرگ تراشه از نسل جدید پردازنده‌های خود رونمایی کردند که قابلیت اجرای مدل‌های زبانی بزرگ را به‌صورت آفلاین و روی دستگاه فراهم می‌کند؛ قابلیتی که تا پیش از این تنها در پرچمداران گران‌قیمت دیده می‌شد.',
  category: 'هوش مصنوعی و رباتیک',
  readTime: 8,
  views: '۱۲.۴ هزار',
  time: '۲ ساعت پیش',
};

const secondary: Article[] = [
  {
    id: 'flagship-review',
    title: 'بررسی کامل پرچمدار جدید؛ قدرت مطلق در دستان شما',
    excerpt: 'یک ماه با پرچمدار جدید زندگی کردیم؛ نتیجه چیزی فراتر از انتظار بود.',
    category: 'موبایل و تبلت',
    readTime: 12,
    views: '۸.۲ هزار',
    time: '۴ ساعت پیش',
  },
  {
    id: 'gpu-launch',
    title: 'نسل جدید کارت‌های گرافیک رونمایی شد؛ جهشی ۴۰ درصدی در عملکرد',
    excerpt: 'رقابت در بازار گرافیک داغ‌تر از همیشه؛ نگاهی به مشخصات و قیمت‌ها.',
    category: 'سخت‌افزار و قطعات کامپیوتر',
    readTime: 6,
    views: '۹.۷ هزار',
    time: '۶ ساعت پیش',
  },
];

const latest: Article[] = [
  {
    id: 'security-alert',
    title: 'هشدار امنیتی جدید؛ میلیاردها دستگاه در معرض خطر',
    excerpt: 'یک آسیب‌پذری بحرانی کشف شده که میلیون‌ها کاربر را تحت تأثیر قرار می‌دهد.',
    category: 'امنیت سایبری و حریم خصوصی',
    readTime: 4,
    views: '۱۵.۱ هزار',
    time: '۱ ساعت پیش',
  },
  {
    id: 'ps6-rumor',
    title: 'کنسول نسل بعدی سونی زودتر از انتظار می‌آید',
    excerpt: 'گزارش‌های جدید از عرضه‌ی زودهنگام کنسول نسل بعدی حکایت دارند.',
    category: 'گیمینگ و کنسول‌ها',
    readTime: 5,
    views: '۱۱.۳ هزار',
    time: '۳ ساعت پیش',
  },
  {
    id: 'smartwatch-health',
    title: 'ساعت هوشمند جدید با سنسورهای پیشرفته‌ی پایش سلامت',
    excerpt: 'پایش فشار خون و قند خون بدون نیاز به تجهیزات جانبی.',
    category: 'گجت‌های پوشیدنی و سلامت',
    readTime: 7,
    views: '۶.۸ هزار',
    time: '۵ ساعت پیش',
  },
  {
    id: 'android-16',
    title: 'به‌روزرسانی بزرگ اندروید ۱۶ با قابلیت‌های هوش مصنوعی منتشر شد',
    excerpt: 'نگاهی به مهم‌ترین تغییرات و دستگاه‌های واجد شرایط دریافت به‌روزرسانی.',
    category: 'نرم‌افزار و سیستم‌عامل',
    readTime: 6,
    views: '۱۰.۵ هزار',
    time: '۷ ساعت پیش',
  },
  {
    id: 'ev-iran',
    title: 'خودروهای برقی خودران به جاده‌های ایران می‌آیند؟',
    excerpt: 'زیرساخت‌های شارژ و چالش‌های پیش‌روی خودروهای برقی در کشور.',
    category: 'حمل‌ونقل و وسایل نقلیه هوشمند',
    readTime: 9,
    views: '۷.۹ هزار',
    time: '۹ ساعت پیش',
  },
];

const trending = [featured, ...secondary, ...latest].slice(0, 5);

/* ─────────── ابزارها ─────────── */
const catOf = (name: string) => findCategory(name) ?? allCategories[0];
const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const toneStyle = (tone: string) =>
  ({ '--c': `var(--cat-${tone})` }) as CSSProperties;

/* ─────────── اجزای صفحه ─────────── */
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
      href={`/article/${article.id}`}
      className="group block h-full overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-low shadow-1 transition-all duration-300 ease-standard hover:-translate-y-1 hover:shadow-3"
    >
      <div
        className="relative flex h-56 items-center justify-center overflow-hidden md:h-72"
        style={{
          backgroundColor: `color-mix(in srgb, var(--cat-${cat.tone}) 16%, var(--color-surface-container))`,
        }}
      >
        <Icon
          name={cat.symbol}
          className="text-8xl text-on-surface/25 transition-transform duration-500 ease-decelerate group-hover:scale-110"
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
            {article.views} بازدید
          </span>
          <span>{article.time}</span>
        </div>
      </div>
    </Link>
  );
}

function SecondaryCard({ article }: { article: Article }) {
  const cat = catOf(article.category);
  return (
    <Link
      href={`/article/${article.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-low shadow-1 transition-all duration-300 ease-standard hover:-translate-y-1 hover:shadow-3"
    >
      <div
        className="flex h-28 items-center justify-center"
        style={{
          backgroundColor: `color-mix(in srgb, var(--cat-${cat.tone}) 16%, var(--color-surface-container))`,
        }}
      >
        <Icon
          name={cat.symbol}
          className="text-5xl text-on-surface/25 transition-transform duration-500 ease-decelerate group-hover:scale-110"
        />
      </div>
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
          <span>{article.time}</span>
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
      href={`/article/${article.id}`}
      className="group flex gap-4 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-4 shadow-1 transition-all duration-300 ease-standard hover:-translate-y-0.5 hover:shadow-2"
    >
      <div
        className="grid h-20 w-20 shrink-0 place-items-center rounded-xl"
        style={{
          backgroundColor: `color-mix(in srgb, var(--cat-${cat.tone}) 16%, var(--color-surface-container))`,
        }}
      >
        <Icon name={cat.symbol} className="text-3xl text-on-surface/30" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="cat-chip rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={toneStyle(cat.tone)}
          >
            {cat.name}
          </span>
          <span className="text-[11px] text-on-surface-variant">{article.time}</span>
        </div>
        <h3 className="mt-2 line-clamp-1 text-base font-bold text-on-surface transition-colors group-hover:text-primary">
          {article.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-sm text-on-surface-variant">{article.excerpt}</p>
      </div>
    </Link>
  );
}

function TrendingItem({ article, rank }: { article: Article; rank: number }) {
  const cat = catOf(article.category);
  return (
    <Link
      href={`/article/${article.id}`}
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
          {cat.name} · {article.views} بازدید
        </span>
      </div>
    </Link>
  );
}

/* ─────────── صفحه اصلی ─────────── */
export default function HomePage() {
  return (
    <main className="relative">
      {/* لایه‌ی ambient ملایم در بالای صفحه */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-b from-primary-container/20 to-transparent"
      />

      {/* نوار خبر فوری */}
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

      {/* بخش ویژه — چیدمان editorial */}
      <section className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Reveal className="h-full lg:col-span-2">
            <FeaturedCard article={featured} />
          </Reveal>
          <div className="grid gap-6 lg:grid-rows-2">
            {secondary.map((article, i) => (
              <Reveal key={article.id} delay={120 + i * 120} className="h-full">
                <SecondaryCard article={article} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

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