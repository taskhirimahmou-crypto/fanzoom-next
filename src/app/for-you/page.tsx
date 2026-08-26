import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth-cookies';
import { getRecommendedArticles } from '@/lib/articles-server';
import { ForYouClient } from '@/components/ForYouClient';
import { Icon } from '@/components/Icon';
import type { Article } from '@/lib/articles-server';
import {
  BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
  createBaselineFeedId,
} from '@/lib/recommendations/baseline';
import { isPersonalizationEnabled } from '@/lib/personalization/consent';

export const metadata: Metadata = {
  title: 'پیشنهاد برای شما | فن زوم',
  description: 'مقالات پیشنهادی شخصی‌سازی‌شده بر اساس علاقه‌مندی‌های شما',
};

export default async function ForYouPage() {
  const auth = await getCurrentUser();
  if (!auth) redirect('/login');
  const { pb, user: record } = auth;

  const fullUser = (await pb.collection('users').getOne(record.id)) as {
    interests?: string[];
    personalizationEnabled?: boolean;
  };
  const personalizationEnabled = isPersonalizationEnabled(fullUser);

  let articles: Article[] = [];
  if (fullUser.interests && fullUser.interests.length > 0) {
    articles = await getRecommendedArticles(fullUser.interests, 10, 0);
  }

  const feedId = createBaselineFeedId();
  return (
    <main className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[380px] bg-gradient-to-b from-primary-container/20 to-transparent"
      />

      <section className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-container text-on-primary-container">
            <Icon name="auto_awesome" className="text-xl" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-on-surface md:text-3xl">
              پیشنهاد برای شما
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              مقالات شخصی‌سازی‌شده بر اساس علاقه‌مندی‌های شما
            </p>
          </div>
          <span className="h-px flex-1 bg-outline-variant/60" />
        </div>

        {articles.length > 0 ? (
          <div className="mt-8">
            <ForYouClient
              initialArticles={articles}
              initialFeedId={feedId}
              algorithmVersion={BASELINE_RECOMMENDATION_ALGORITHM_VERSION}
              personalizationEnabled={personalizationEnabled}
            />
          </div>
        ) : (
          <div className="mt-16 text-center">
            <Icon
              name="auto_awesome"
              className="mx-auto text-6xl text-on-surface/20"
            />
            <p className="mt-4 text-lg font-bold text-on-surface">
              هنوز علاقه‌مندی انتخاب نکرده‌اید
            </p>
            <p className="mt-2 text-sm text-on-surface-variant">
              ابتدا در صفحه پروفایل، دسته‌بندی‌های مورد علاقه‌تان را انتخاب کنید.
            </p>
            <a
              href="/profile"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-1 transition-all hover:shadow-2 hover:brightness-110 active:scale-95"
            >
              <Icon name="tune" className="text-lg" />
              انتخاب علاقه‌مندی‌ها
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
