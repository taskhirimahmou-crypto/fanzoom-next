import { Icon } from '@/components/Icon';
import type { Category } from '@/lib/categories';
import Image from 'next/image';

interface Props {
  image?: string;
  title: string;
  cat: Category;
  /** کلاس‌های ظرف (اندازه، گردی و...) */
  className?: string;
  /** اندازه‌ی آیکون در حالت fallback */
  iconClassName?: string;
  /** اولویت لود برای LCP - فقط برای تصویر اصلی صفحه استفاده شود */
  priority?: boolean;
}

/**
 * ناحیه‌ی بصری کارت مقاله:
 * تصویر واقعی اگر موجود باشد، وگرنه آیکون دسته روی پس‌زمینه‌ی tonal.
 */
export function ArticleVisual({ image, title, cat, className, iconClassName, priority = false }: Props) {
  // شاخه ۱: بدون تصویر → fallback آیکون (کد فعلی دست‌نخورده)
  if (!image) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden ${className ?? ''}`}
        style={{
          backgroundColor: `color-mix(in srgb, var(--cat-${cat.tone}) 18%, var(--color-surface-container))`,
        }}
      >
        <Icon
          name={cat.symbol}
          className={`text-on-surface/25 transition-transform duration-500 ease-decelerate group-hover:scale-110 ${iconClassName ?? 'text-5xl'}`}
        />
      </div>
    );
  }

  // شاخه ۲: تصویر PocketBase → next/image
  if (image.includes('/api/files/')) {
    return (
      <div className={`relative overflow-hidden ${className ?? ''}`}>
        <Image
          src={image}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority={priority}
          fetchPriority={priority ? 'high' : undefined}
          className="object-cover transition-transform duration-500 ease-decelerate group-hover:scale-105"
        />
      </div>
    );
  }

  // شاخه ۳: تصویر خارجی → img معمولی با lazy
  return (
    <div className={`overflow-hidden ${className ?? ''}`}>
      <img
        src={image}
        alt={title}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        className="h-full w-full object-cover transition-transform duration-500 ease-decelerate group-hover:scale-105"
      />
    </div>
  );
}