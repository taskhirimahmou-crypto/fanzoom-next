// src/lib/articles-server.ts
import { getPocketBase } from '@/lib/pocketbase';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getImageUrl } from '@/lib/articles';
import type { ArticlesResponse } from '@/lib/pb-types';
import { cache } from 'react';

export type Article = ArticlesResponse;
const PUBLISHED = 'status = "published"';

// ✅ تبدیلِ یک‌باره: نامِ فایلِ PB → URL کاملِ لیارا (برای داده‌های قدیمیِ URLدار هم امن است)
function resolveImage<T extends { id: string; image?: string | null }>(article: T): T {
  return { ...article, image: getImageUrl(article) };
}

// Cache PocketBase instance per request to avoid redundant API calls
const getFeaturedArticleCached = cache(async (): Promise<Article | null> => {
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

const getSecondaryArticlesCached = cache(async (limit = 2): Promise<Article[]> => {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList(1, limit, {
    filter: `${PUBLISHED} && featured = false`,
    sort: '-publishedAt',
    skipTotal: true,
  });
  return (items as unknown as Article[]).map(resolveImage);
});

const getLatestArticlesCached = cache(async (limit = 5): Promise<Article[]> => {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList(1, limit, {
    filter: PUBLISHED,
    sort: '-publishedAt',
    skipTotal: true,
  });
  return (items as unknown as Article[]).map(resolveImage);
});

const getTrendingArticlesCached = cache(async (limit = 5): Promise<Article[]> => {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList(1, limit, {
    filter: PUBLISHED,
    sort: '-views',
    skipTotal: true,
  });
  return (items as unknown as Article[]).map(resolveImage);
});

export async function getFeaturedArticle(): Promise<Article | null> {
  return getFeaturedArticleCached();
}

export async function getSecondaryArticles(limit = 2): Promise<Article[]> {
  return getSecondaryArticlesCached(limit);
}

export async function getLatestArticles(limit = 5): Promise<Article[]> {
  return getLatestArticlesCached(limit);
}

export async function getTrendingArticles(limit = 5): Promise<Article[]> {
  return getTrendingArticlesCached(limit);
}

export async function getHomePageData() {
  const [featured, secondary, latest, trending] = await Promise.all([
    getFeaturedArticle(),
    getSecondaryArticles(2),
    getLatestArticles(5),
    getTrendingArticles(5),
  ]);
  return { featured, secondary, latest, trending };
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const pb = getPocketBase();
  try {
    const item = await pb.collection('articles').getFirstListItem(pb.filter('slug = {:slug}', { slug })) as unknown as Article;
    return resolveImage(item);
  } catch {
    return null;
  }
}

export async function getArticlesByCategory(categorySlug: string, limit = 20): Promise<Article[]> {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList(1, limit, {
    filter: pb.filter(`${PUBLISHED} && category = {:cat}`, { cat: categorySlug }),
    sort: '-publishedAt',
    skipTotal: true,
  });
  return (items as unknown as Article[]).map(resolveImage);
}

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

export async function getRelatedArticles(article: Article, limit = 3): Promise<Article[]> {
  const pb = getPocketBase();
  const { items } = await pb.collection('articles').getList(1, limit, {
    filter: pb.filter(`${PUBLISHED} && category = {:cat} && id != {:id}`, {
      cat: article.category,
      id: article.id,
    }),
    sort: '-publishedAt',
    skipTotal: true,
  });
  return (items as unknown as Article[]).map(resolveImage);
}

export async function getBookmarkedArticles(userId: string): Promise<Article[]> {
  const pb = await getServerPocketBase();
  const items = await pb.collection('bookmarks').getFullList({
    filter: pb.filter('user = {:uid}', { uid: userId }),
    expand: 'article',
    sort: '-created',
  });
  return items
    .map((b) => (b.expand as { article?: Article })?.article)
    .filter((a): a is Article => Boolean(a))
    .map(resolveImage);
}