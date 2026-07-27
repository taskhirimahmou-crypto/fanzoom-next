import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerPocketBase } from '@/lib/auth-cookies';
import type { Article } from '@/lib/articles';
import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { BookmarkRow } from '@/components/BookmarkRow';

export const metadata: Metadata = { title: 'نشان‌شده‌های من' };

const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export default async function BookmarksPage() {
  const pb = await getServerPocketBase();
  const userId = pb.authStore.record?.id;
  if (!userId) redirect('/login');

  // ۱. خواندن bookmarkهای کاربر (بدون sort در query برای جلوگیری از خطای PocketBase)
  const bmItems = await pb.collection('bookmarks').getFullList({
    filter: `user = "${userId}"`,
  });

  // مرتب‌سازی در JavaScript (جدیدترین اول)
  bmItems.sort((a: any, b: any) => 
    new Date(b.created).getTime() - new Date(a.created).getTime()
  );

  // ۲. خواندن مقاله‌ی هر bookmark به‌صورت جداگانه
  const articles: Article[] = [];
  for (const bm of bmItems) {
    // استفاده از any برای دور زدن سخت‌گیری TypeScript روی RecordModel
    const articleId = (bm as any).article;
    if (!articleId) continue;
    
    try {
      const a = await pb.collection('articles').getOne(articleId);
      articles.push(a as unknown as Article);
    } catch {
      // مقاله حذف شده یا در دسترس نیست — رد کن
    }
  }

  return (
    <main className="relative">
      {/* سربرگ */}
      <header className="relative overflow-hidden border-b border-outline-variant/60">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-secondary-container/30 to-transparent"
        />
        <Icon
          name="bookmark"
          aria-hidden
          className="pointer-events-none absolute -left-10 top-1/2 -translate-y-1/2 select-none text-[200px] text-on-surface/5"
        />
        <div className="relative mx-auto max-w-4xl px-4 py-12 md:px-6">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary-container px-4 py-1.5 text-sm font-bold text-on-secondary-container">
              <Icon name="bookmark" fill className="text-lg" />
              {toPersianDigits(articles.length)} مقاله
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-on-surface md:text-5xl">
              نشان‌شده‌های من
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-3 leading-7 text-on-surface-variant">
              مقالاتی که برای خواندن بعدی ذخیره کرده‌ای.
            </p>
          </Reveal>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        {articles.length === 0 ? (
          <Reveal>
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <Icon name="bookmark" className="text-6xl text-on-surface/30" />
              <p className="text-lg font-bold text-on-surface">
                هنوز مقاله‌ای نشان نکرده‌ای
              </p>
              <p className="max-w-md text-sm leading-7 text-on-surface-variant">
                در هر مقاله، روی دکمه‌ی «نشان‌کردن» بزن تا اینجا ذخیره شود و هر وقت
                خواستی بخوانی‌شان.
              </p>
              <Link
                href="/"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-1 transition-all duration-300 ease-standard hover:shadow-2 hover:brightness-110 active:scale-95"
              >
                <Icon name="home" className="text-lg" />
                برو به خانه
              </Link>
            </div>
          </Reveal>
        ) : (
          <div className="flex flex-col gap-5">
            {articles.map((article, i) => (
              <Reveal key={article.id} delay={i * 60}>
                <BookmarkRow article={article} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}