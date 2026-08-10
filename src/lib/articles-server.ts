// src/lib/articles-server.ts
import { unstable_cache } from 'next/cache';
import { getPocketBase } from '@/lib/pocketbase';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getImageUrl } from '@/lib/articles';
import type { ArticlesResponse } from '@/lib/pb-types';

export type Article = ArticlesResponse;
const PUBLISHED = 'status = "published"';

// ✅ تبدیلِ یک‌باره: نامِ فایلِ PB → URL کاملِ لیارا (برای داده‌های قدیمیِ URLدار هم امن است)
export function resolveImage<T extends { id: string; image?: string | null }>(article: T): T {
  return { ...article, image: getImageUrl(article) };
}

// Retry wrapper برای درخواست‌های PocketBase
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && (error as any)?.code === 'UND_ERR_CONNECT_TIMEOUT') {
      console.warn(`🔴 Timeout, retrying... (${retries} left)`);
      await new Promise(r => setTimeout(r, 1000)); // 1s delay
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}

export async function getFeaturedArticle(): Promise<Article | null> {
  return withRetry(async () => {
    const pb = getPocketBase();
    try {
      const item = await pb.collection('articles').getFirstListItem(`${PUBLISHED} && featured = true`, {
        sort: '-publishedAt',
      }) as unknown as Article;
      return resolveImage(item);
    } catch {
      return null;
    }
  });
}

export async function getSecondaryArticles(limit = 2): Promise<Article[]> {
  return withRetry(async () => {
    const pb = getPocketBase();
    const { items } = await pb.collection('articles').getList(1, limit, {
      filter: `${PUBLISHED} && featured = false`,
      sort: '-publishedAt',
      skipTotal: true,
    });
    return (items as unknown as Article[]).map(resolveImage);
  });
}

export async function getLatestArticles(limit = 5): Promise<Article[]> {
  return withRetry(async () => {
    const pb = getPocketBase();
    const { items } = await pb.collection('articles').getList(1, limit, {
      filter: PUBLISHED,
      sort: '-publishedAt',
      skipTotal: true,
    });
    return (items as unknown as Article[]).map(resolveImage);
  });
}

export async function getTrendingArticles(limit = 5): Promise<Article[]> {
  return withRetry(async () => {
    const pb = getPocketBase();
    const { items } = await pb.collection('articles').getList(1, limit, {
      filter: PUBLISHED,
      sort: '-views',
      skipTotal: true,
    });
    return (items as unknown as Article[]).map(resolveImage);
  });
}

export const getHomePageData = unstable_cache(
  async () => {
    const featured = await getFeaturedArticle().catch(() => null);
    const secondary = await getSecondaryArticles(2).catch(() => []);
    const latest = await getLatestArticles(5).catch(() => []);
    const trending = await getTrendingArticles(5).catch(() => []);
    return { featured, secondary, latest, trending };
  },
  ['home-data'],
  { revalidate: 120 }
);

export const getArticleBySlug = unstable_cache(
  async (slug: string): Promise<Article | null> => {
    const pb = getPocketBase();
    try {
      const item = await pb.collection('articles').getFirstListItem(pb.filter('slug = {:slug}', { slug })) as unknown as Article;
      return resolveImage(item);
    } catch {
      return null;
    }
  },
  ['article-slug'],
  { revalidate: 180 }
);

export const getArticlesByCategory = unstable_cache(
  async (categorySlug: string, limit = 20): Promise<Article[]> => {
    const pb = getPocketBase();
    const { items } = await pb.collection('articles').getList(1, limit, {
      filter: pb.filter(`${PUBLISHED} && category = {:cat}`, { cat: categorySlug }),
      sort: '-publishedAt',
      skipTotal: true,
    });
    return (items as unknown as Article[]).map(resolveImage);
  },
  ['category-articles'],
  { revalidate: 120 }
);

export async function searchArticles(query: string, limit = 20): Promise<Article[]> {
  const q = query.trim();
  if (!q) return [];
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList(1, limit, {
    filter: pb.filter(`${PUBLISHED} && (title ~ {:q} || excerpt ~ {:q})`, { q }),
    sort: '-publishedAt',
    skipTotal: true,
  });
  return (items as unknown as Article[]).map(resolveImage);
}

export const getRelatedArticles = unstable_cache(
  async (category: string, articleId: string, limit = 3): Promise<Article[]> => {
    const pb = getPocketBase();
    const { items } = await pb.collection('articles').getList(1, limit, {
      filter: pb.filter(`${PUBLISHED} && category = {:cat} && id != {:id}`, {
        cat: category,
        id: articleId,
      }),
      sort: '-publishedAt',
      skipTotal: true,
    });
    return (items as unknown as Article[]).map(resolveImage);
  },
  ['related'],
  { revalidate: 300 }
);

export async function getBookmarkedArticles(userId: string): Promise<Article[]> {
  const pb = await getServerPocketBase();
  
  // چک نهایی auth
  if (!pb.authStore.isValid || !pb.authStore.record?.id) {
    console.warn('🔴 getBookmarkedArticles: no valid auth');
    return [];
  }
  
  try {
    // ۱. فقط bookmarkها را بگیر (بدون expand و بدون filter)
    // listRule در PocketBase خودش filter می‌کند
    const bookmarks = await pb.collection('bookmarks').getFullList({
      sort: '-created',
    });
    
    console.log('🔍 Bookmarks count:', bookmarks.length);
    
    // ۲. IDهای مقالات را استخراج کن
    const articleIds = bookmarks
      .map((b: any) => b.article)
      .filter((id: string) => Boolean(id));
    
    if (articleIds.length === 0) {
      return [];
    }
    
    // ۳. مقالات را جداگانه بگیر (با error handling برای هر کدام)
    const articles: Article[] = [];
    for (const articleId of articleIds) {
      try {
        const article = await pb.collection('articles').getOne(articleId);
        articles.push(resolveImage(article as Article));
      } catch (err) {
        // اگر مقاله وجود نداشت یا منتشر نشده بود، نادیده بگیر
        console.warn(`🔴 Article ${articleId} not found or not published, skipping`);
      }
    }
    
    console.log('🔍 Resolved articles count:', articles.length);
    
    // ۴. بر اساس ترتیب bookmarkها مرتب کن
    const articleMap = new Map(articles.map((a) => [a.id, a]));
    return articleIds
      .map((id: string) => articleMap.get(id))
      .filter((a): a is Article => Boolean(a));
      
  } catch (error) {
    console.error('🔴 getBookmarkedArticles error:', error);
    return [];
  }
}
// ── مقالات پیشنهادی بر اساس علاقه‌مندی‌های کاربر ──
// ── مقالات پیشنهادی بر اساس علاقه‌مندی‌های کاربر ──
export const getRecommendedArticles = async (
  interests: string[],
  limit = 4
): Promise<Article[]> => {
  if (!interests || interests.length === 0) return [];

  const fetcher = unstable_cache(
    async (cats: string[]) => {
      const pb = getPocketBase();

      // فیلتر ساده و قابل اعتماد (به جای in)
      const categoryFilter = cats
        .map((c) => `category = "${c}"`)
        .join(' || ');
      const filter = `status = "published" && (${categoryFilter})`;

      console.error('🟢 getRecommendedArticles filter:', filter);

      const items = await pb.collection('articles').getList(1, limit, {
        filter,
        sort: '-publishedAt',
      });

      console.error('🟢 getRecommendedArticles found:', items.items.length);

      return items.items.map((i) => resolveImage(i as unknown as Article));
    },
    ['recommended-articles-v2', ...interests],  // ← کلید cache جدید (v2) برای شکستن cache قدیمی
    { revalidate: 60 }  // ← cache فقط ۱ دقیقه
  );

  return fetcher(interests);
};