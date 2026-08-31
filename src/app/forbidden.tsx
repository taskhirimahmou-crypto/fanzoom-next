import Link from 'next/link';
import { Icon } from '@/components/Icon';

export default function Forbidden() {
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-2xl place-items-center px-4 py-16">
      <section className="cyber-card w-full rounded-3xl bg-surface-container p-8 text-center shadow-2">
        <Icon name="lock" className="mx-auto mb-4 text-5xl text-primary" />
        <p className="mb-2 font-mono text-sm text-on-surface-variant">HTTP 403</p>
        <h1 className="text-2xl font-black text-on-surface">دسترسی مدیریتی ندارید</h1>
        <p className="mx-auto mt-3 max-w-md leading-8 text-on-surface-variant">
          این بخش فقط برای مدیران فعال فن‌زوم قابل مشاهده است.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-on-primary"
        >
          بازگشت به سایت
          <Icon name="arrow_back" className="icon-mirror text-lg" />
        </Link>
      </section>
    </main>
  );
}
