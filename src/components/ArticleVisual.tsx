import { Icon } from '@/components/Icon';
import type { Category } from '@/lib/categories';

interface Props {
  image?: string;
  title: string;
  cat: Category;
  /** کلاس‌های ظرف (اندازه، گردی و...) */
  className?: string;
  /** اندازه‌ی آیکون در حالت fallback */
  iconClassName?: string;
}

/**
 * ناحیه‌ی بصری کارت مقاله:
 * تصویر واقعی اگر موجود باشد، وگرنه آیکون دسته روی پس‌زمینه‌ی tonal.
 */
export function ArticleVisual({ image, title, cat, className, iconClassName }: Props) {
  if (image) {
    return (
      <div className={`overflow-hidden ${className ?? ''}`}>
        <img
          src={image}
          alt={title}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className="h-full w-full object-cover transition-transform duration-500 ease-decelerate group-hover:scale-105"
          style={{ contentVisibility: 'auto' }}
        />
      </div>
    );
  }
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