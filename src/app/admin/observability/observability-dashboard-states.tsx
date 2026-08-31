'use client';

import { Icon } from '@/components/Icon';

export function DashboardLoading() {
  return (
    <section
      className="mx-auto min-h-screen max-w-[1500px] px-4 py-8 md:px-8"
      aria-label="در حال بارگذاری داشبورد"
      aria-busy="true"
    >
      <div className="mb-7 h-28 animate-pulse rounded-3xl bg-surface-container-high" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-2xl bg-surface-container-high" />
        ))}
      </div>
      <div className="mt-6 h-96 animate-pulse rounded-3xl bg-surface-container-high" />
      <span className="sr-only">داده‌ها در حال دریافت هستند.</span>
    </section>
  );
}

export function DashboardEmpty({ windowLabel }: { windowLabel: string }) {
  return (
    <section className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-outline bg-surface-container p-8 text-center">
      <div>
        <Icon name="monitoring" className="mb-3 text-5xl text-on-surface-variant" />
        <h2 className="text-xl font-black">داده‌ای در این بازه پیدا نشد</h2>
        <p className="mt-2 leading-7 text-on-surface-variant">
          برای {windowLabel} هنوز event یا log قابل محاسبه‌ای وجود ندارد. بازه یا فیلترها را تغییر دهید.
        </p>
      </div>
    </section>
  );
}

export function DashboardFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="mx-auto grid min-h-[65vh] max-w-3xl place-items-center px-4 py-10">
      <section
        role="alert"
        className="cyber-card w-full rounded-3xl bg-surface-container p-8 text-center shadow-2"
      >
        <Icon name="error" className="mb-3 text-5xl text-error" />
        <h1 className="text-2xl font-black">دریافت داده‌های پایش ممکن نشد</h1>
        <p className="mx-auto mt-3 max-w-lg leading-8 text-on-surface-variant">
          سلامت Docker و PocketBase لوکال را بررسی کنید. جزئیات داخلی و credentialها عمداً نمایش داده نمی‌شوند.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-on-primary"
        >
          <Icon name="refresh" className="text-lg" />
          تلاش دوباره
        </button>
      </section>
    </section>
  );
}
