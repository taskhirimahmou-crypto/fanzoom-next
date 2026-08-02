import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { safeRelativeTime } from '@/lib/articles';
import type { Article } from '@/lib/articles-server';
import { Reveal } from '@/components/Reveal';
import { HistoryRow } from '@/components/HistoryRow';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = { title: 'تاریخچه‌ی مطالعه' };

type HistoryEntry = { article: Article; lastRead: string };

const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export default async function HistoryPage() {
  const pb = await getServerPocketBase();
  const userId = pb.authStore.record?.id;
  if (!userId) redirect('/login');

  // ۱. خواندن رکوردهای تاریخچه (بدون sort/expand در query برای جلوگیری از خطا)
  let entries: HistoryEntry[] = [];
  try {
    const res = await pb.collection('history').getFullList({
      filter: pb.filter('user = {:uid}', { uid: userId }),
    });

    // ۲. خواندن مقاله‌ی هر رکورد و مرتب‌سازی در سرور
    const loaded = await Promise.all(
      res.map(async (h: any) => {
        const articleId = h.article;
        const lastRead = h.last_read;
        if (!articleId) return null;
        try {
          const a = await pb.collection('articles').getOne(articleId);
          return { article: a as unknown as Article, lastRead } as HistoryEntry;
        } catch {
          return null; // مقاله حذف شده
        }
      }),
    );

    entries = loaded
      .filter((e): e is HistoryEntry => Boolean(e))
      .sort((a, b) => (a.lastRead < b.lastRead ? 1 : -1)); // جدیدترین مطالعه اول
  } catch {
    entries = [];
  }

  const lastEntry = entries[0];
  const lastWhen = lastEntry ? safeRelativeTime(lastEntry.lastRead) : null;

  return (
    <main className="relative">
      {/* سربرگ */}
      <header className="relative overflow-hidden border-b border-outline-variant/60">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-tertiary-container/30 to-transparent"
        />
        <Icon
          name="history"
          aria-hidden
          className="pointer-events-none absolute -left-10 top-1/2 -translate-y-1/2 select-none text-[200px] text-on-surface/5"
        />
        <div className="relative mx-auto max-w-4xl px-4 py-12 md:px-6">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-tertiary-container px-4 py-1.5 text-sm font-bold text-on-tertiary-container">
              <Icon name="history" className="text-lg" />
              {toPersianDigits(entries.length)} مقاله
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-on-surface md:text-5xl">
              تاریخچه‌ی مطالعه
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-3 leading-7 text-on-surface-variant">
              ردپای مطالعه‌ات — مقاله‌هایی که خوانده‌ای، به ترتیب آخرین بازدید.
            </p>
          </Reveal>
          {/* جزئیات زنده: آخرین مطالعه */}
          {lastEntry && lastWhen && (
            <Reveal delay={200}>
              <div className="mt-5 inline-flex max-w-full items-center gap-2.5 rounded-full border border-outline-variant/60 bg-surface-container-low px-4 py-2 text-sm shadow-1">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tertiary text-on-tertiary">
                  <Icon name="auto_stories" className="text-sm" />
                </span>
                <span className="truncate text-on-surface-variant">
                  آخرین مطالعه‌ات:{' '}
                  <span className="font-bold text-on-surface">{lastEntry.article.title}</span>
                  <span className="mx-1 text-on-surface-variant/50">·</span>
                  {lastWhen}
                </span>
              </div>
            </Reveal>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        {entries.length === 0 ? (
          <Reveal>
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <Icon name="history" className="text-6xl text-on-surface/30" />
              <p className="text-lg font-bold text-on-surface">هنوز مقاله‌ای نخوانده‌ای</p>
              <p className="max-w-md text-sm leading-7 text-on-surface-variant">
                هر مقاله‌ای که باز کنی، اینجا ثبت می‌شود تا بعداً بتوانی به خوانده‌هایت
                برگردی.
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
            {entries.map((entry, i) => (
              <Reveal key={entry.article.id} delay={i * 60}>
                <HistoryRow article={entry.article} lastRead={entry.lastRead} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}