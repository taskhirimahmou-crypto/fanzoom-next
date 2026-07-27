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
/** نمایش امن زمان — هرگز «Invalid Date» برنمی‌گرداند؛ اگر تاریخ نبود null می‌دهد */
export const safeRelativeTime = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const fixed = iso.includes('T') ? iso : iso.replace(' ', 'T');
  const d = new Date(fixed);
  if (isNaN(d.getTime())) {
    const only = new Date(fixed.slice(0, 10));
    return isNaN(only.getTime()) ? null : only.toLocaleDateString('fa-IR');
  }
  return relativeTime(fixed);
};
/* ── توابع فاز ۴: صفحه‌ی مقاله، دسته، جستجو ── */

/** یک مقاله بر اساس slug (برای صفحه‌ی مقاله) */
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const pb = getPocketBase();
  try {
    return await pb
      .collection('articles')
      .getFirstListItem<Article>(pb.filter('slug = {:slug}', { slug }));
  } catch {
    return null;
  }
}

/** مقالات یک دسته */
export async function getArticlesByCategory(
  categorySlug: string,
  limit = 20,
): Promise<Article[]> {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList<Article>(1, limit, {
    filter: pb.filter(`${PUBLISHED} && category = {:cat}`, { cat: categorySlug }),
    sort: '-publishedAt',
    skipTotal: true,
  });
  return items;
}

/** جستجو در عنوان و خلاصه */
export async function searchArticles(
  query: string,
  limit = 20,
): Promise<Article[]> {
  const q = query.trim();
  if (!q) return [];
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList<Article>(1, limit, {
    filter: pb.filter(`${PUBLISHED} && (title ~ {:q} || excerpt ~ {:q})`, { q }),
    sort: '-publishedAt',
    skipTotal: true,
  });
  return items;
}

/** مقالات مرتبط (همان دسته، به جز خود مقاله) */
export async function getRelatedArticles(
  article: Article,
  limit = 3,
): Promise<Article[]> {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList<Article>(1, limit, {
    filter: pb.filter(
      `${PUBLISHED} && category = {:cat} && id != {:id}`,
      { cat: article.category, id: article.id },
    ),
    sort: '-publishedAt',
    skipTotal: true,
  });
  return items;
}
/** مقالات نشان‌شده‌ی یک کاربر */
/** مقالات نشان‌شده‌ی یک کاربر */
/** مقالات نشان‌شده‌ی یک کاربر */
export async function getBookmarkedArticles(userId: string): Promise<Article[]> {
  const pb = await getServerPocketBase(); // ← با auth (از کوکی کاربر)
  const items = await pb.collection('bookmarks').getFullList({
    filter: pb.filter('user = {:uid}', { uid: userId }),
    expand: 'article',
    sort: '-created',
  });
  return items
    .map((b) => (b.expand as { article?: Article })?.article)
    .filter((a): a is Article => Boolean(a));
}