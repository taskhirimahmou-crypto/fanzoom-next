// src/app/sitemap.ts
import type { MetadataRoute } from 'next';
import { getPocketBase } from '@/lib/pocketbase';
import { allCategories } from '@/lib/categories';

const BASE_URL = 'https://fanzoom.ir';

export const revalidate = 3600; // 1 ساعت کش

// هر ساعت یک‌بار بازسازی شود

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // صفحه اصلی
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'hourly', priority: 1.0 },
  ];

  // صفحات دسته‌بندی
  const categoryPages: MetadataRoute.Sitemap = allCategories.map((cat) => ({
    url: `${BASE_URL}/category/${cat.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // همه‌ی مقالات منتشرشده
  let articlePages: MetadataRoute.Sitemap = [];
  try {
    const pb = getPocketBase();
    const articles = await pb.collection('articles').getFullList({
      filter: 'status = "published"',
      sort: '-publishedAt',
      fields: 'slug,publishedAt',
    });

    articlePages = articles.map((a) => {
      const item = a as unknown as { slug: string; publishedAt?: string };
      return {
        url: `${BASE_URL}/article/${item.slug}`,
        lastModified: item.publishedAt ? new Date(item.publishedAt) : now,
        changeFrequency: 'weekly',
        priority: 0.8,
      };
    });
  } catch (e) {
    console.error('sitemap error:', e);
  }

  return [...staticPages, ...categoryPages, ...articlePages];
}
