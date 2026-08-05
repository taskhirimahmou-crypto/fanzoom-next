import Link from 'next/link';
import type { Metadata } from 'next';
import { Icon } from '@/components/Icon';
import { mainNavCategories } from '@/lib/categories';

export const metadata: Metadata = {
  title: 'صفحه پیدا نشد',
  description: 'متأسفانه صفحه‌ای که به دنبال آن بودید یافت نشد.',
};

export default function NotFound() {
  const suggestions = mainNavCategories.slice(0, 4);

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden">
      {/* لایه‌ی ambient: dot-grid محوشونده */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(circle, var(--color-outline-variant) 1px, transparent 1.4px)',
          backgroundSize: '24px 24px',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 75%)',
        }}
      />

      {/* واترمارک غول‌پیکر عدد خطا */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 -translate-y-1/2 select-none text-[44vw] font-black leading-none text-outline-variant/15 dark:text-outline-variant/10 md:text-[30vw]"
      >
        ۴۰۴
      </span>

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 py-16 text-center md:px-6">
        {/* آیکون شناور */}
        <div className="mb-8 flex justify-center">
          <span className="animate-float-soft grid h-24 w-24 place-items-center rounded-[28px] bg-primary-container text-on-primary-container shadow-2">
            <Icon name="search_off" className="text-5xl" />
          </span>
        </div>

        {/* برچسب کد خطا */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/70 bg-surface-container px-3.5 py-1 text-xs font-bold tracking-wide text-on-surface-variant">
          <Icon name="bolt" className="text-sm text-primary" />
          خطای ۴۰۴
        </span>

        <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-on-surface md:text-6xl">
          این صفحه در مدار نیست
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-on-surface-variant md:text-lg">
          نشانی‌ای که وارد کردید یا منسوخ شده، یا هرگز وجود نداشته. نگران نباشید —
          می‌توانید به خانه برگردید یا یکی از مسیرهای زیر را امتحان کنید.
        </p>

        {/* دکمه‌ها */}
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-bold text-on-primary shadow-1 transition-all duration-300 ease-standard hover:shadow-3 hover:brightness-110 active:scale-[0.97] sm:w-auto"
          >
            <Icon name="home" className="text-lg" />
            بازگشت به خانه
          </Link>
          <Link
            href="/search"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-outline bg-surface px-7 py-3.5 text-sm font-bold text-on-surface transition-all duration-300 ease-standard hover:bg-surface-container-high active:scale-[0.97] sm:w-auto"
          >
            <Icon name="search" className="text-lg" />
            جستجو در اخبار
          </Link>
        </div>

        {/* پیشنهاد دسته‌بندی — به‌جای کارت‌های مساوی، یک ردیف chip هدایت‌کننده */}
        <div className="mt-12">
          <p className="mb-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant/70">
            شاید این‌ها را می‌خواستید
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {suggestions.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="group inline-flex items-center gap-2 rounded-full border border-outline-variant/70 bg-surface-container px-4 py-2 text-sm font-medium text-on-surface-variant transition-all duration-300 ease-standard hover:border-primary/40 hover:bg-primary-container hover:text-on-primary-container active:scale-95"
              >
                <Icon
                  name={cat.symbol}
                  className="text-lg text-on-surface-variant transition-colors group-hover:text-on-primary-container"
                />
                {cat.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}