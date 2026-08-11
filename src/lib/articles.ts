import { getPocketBaseUrl } from './pocketbase-url';

/**
 * فرمت تعداد بازدیدها — نسخه‌ی ضدضربه که null/undefined را تحمل می‌کند
 */
export function formatViews(n?: number | null): string {
  const v = typeof n === 'number' && isFinite(n) ? n : 0;
  if (v >= 1000) {
    const k = (v / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 });
    return `${k} هزار`;
  }
  return v.toLocaleString('fa-IR');
}

/**
 * نمایش زمان نسبی (مثلاً "۵ دقیقه پیش") — نسخه‌ی ضدضربه که null/undefined و تاریخ‌های نامعتبر را تحمل می‌کند
 */
export function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'همین حالا';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (isNaN(diffMs)) return 'همین حالا';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'همین حالا';
  if (min < 60) return `${min.toLocaleString('fa-IR')} دقیقه پیش`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour.toLocaleString('fa-IR')} ساعت پیش`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day.toLocaleString('fa-IR')} روز پیش`;
  return new Date(dateStr).toLocaleDateString('fa-IR');
}

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
// src/lib/articles.ts

/**
 * ساخت آدرس تصویر مقاله
 * - خالی → رشته‌ی خالی
 * - URL کامل (http) → مستقیم برمی‌گرداند (سازگاری با داده‌های قدیمی)
 * - نام فایل → آدرس عمومی فایل در PocketBase را می‌سازد
 */
export function getImageUrl(article: { id: string; image?: string | null }): string {
  if (!article.image) return '';
  if (article.image.startsWith('http')) return article.image;
  return `${getPocketBaseUrl()}/api/files/articles/${article.id}/${article.image}`;
}
