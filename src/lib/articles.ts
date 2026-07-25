// src/lib/articles.ts
import { getPocketBase } from '@/lib/pocketbase';
import type { ArticlesResponse } from '@/lib/pb-types';

/** یک مقاله (تایپ تولیدشده از schema) */
export type Article = ArticlesResponse;

const PUBLISHED = 'status = "published"';

/** مقاله‌ی ویژه‌ی صفحه‌ی خانه */
export async function getFeaturedArticle(): Promise<Article | null> {
  const pb = getPocketBase();
  try {
    return await pb
      .collection('articles')
      .getFirstListItem<Article>(`${PUBLISHED} && featured = true`, {
        sort: '-publishedAt',
      });
  } catch {
    return null;
  }
}

/** چند مقاله‌ی غیرِ‌ویژه برای ستون کناری */
export async function getSecondaryArticles(limit = 2): Promise<Article[]> {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList<Article>(1, limit, {
    filter: `${PUBLISHED} && featured = false`,
    sort: '-publishedAt',
    skipTotal: true,
  });
  return items;
}

/** آخرین مقالات */
export async function getLatestArticles(limit = 5): Promise<Article[]> {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList<Article>(1, limit, {
    filter: PUBLISHED,
    sort: '-publishedAt',
    skipTotal: true,
  });
  return items;
}

/** داغ‌ترین مقالات (بر اساس بازدید) */
export async function getTrendingArticles(limit = 5): Promise<Article[]> {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList<Article>(1, limit, {
    filter: PUBLISHED,
    sort: '-views',
    skipTotal: true,
  });
  return items;
}

/** همه‌ی داده‌ی صفحه‌ی خانه در یک صدا (موازی، سریع) */
export async function getHomePageData() {
  const [featured, secondary, latest, trending] = await Promise.all([
    getFeaturedArticle(),
    getSecondaryArticles(2),
    getLatestArticles(5),
    getTrendingArticles(5),
  ]);
  return { featured, secondary, latest, trending };
}

/* ── helperهای نمایش فارسی ── */

/** ۱۲۴۰۰ → «۱۲٫۴ هزار» */
export function formatViews(n: number): string {
  if (n >= 1000) {
    const k = (n / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 });
    return `${k} هزار`;
  }
  return n.toLocaleString('fa-IR');
}

/** تاریخ ISO → «۲ ساعت پیش» */
export function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'همین حالا';
  if (min < 60) return `${min.toLocaleString('fa-IR')} دقیقه پیش`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour.toLocaleString('fa-IR')} ساعت پیش`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day.toLocaleString('fa-IR')} روز پیش`;
  return new Date(dateStr).toLocaleDateString('fa-IR');
}