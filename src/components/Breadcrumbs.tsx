// src/components/Breadcrumbs.tsx
import Link from 'next/link';

export type Crumb = { name: string; href?: string };

/** مسیر ناوبری قابل مشاهده — RTL و هماهنگ با توکن‌های رنگی پروژه */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="مسیر صفحه"
      className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant"
    >
      {items.map((item, i) => (
        <span key={i} className="flex min-w-0 items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="text-outline-variant">
              ‹
            </span>
          )}
          {item.href ? (
            <Link href={item.href} className="shrink-0 transition-colors hover:text-primary">
              {item.name}
            </Link>
          ) : (
            <span className="line-clamp-1 max-w-[14rem] font-medium text-on-surface md:max-w-[24rem]">
              {item.name}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** خروجی Schema.org برای BreadcrumbList — با کامپوننت JsonLd استفاده شود */
export function breadcrumbJsonLd(items: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.href ? { item: `https://fanzoom.ir${item.href}` } : {}),
    })),
  };
}
