import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'تماس با ما | فن زوم',
  description: 'راه‌های ارتباطی با تیم فن زوم شامل ایمیل و شبکه‌های اجتماعی. برای ارسال اخبار، پیشنهادات و انتقادات با ما در تماس باشید.',
};

const contactMethods = [
  {
    icon: 'mail' as const,
    label: 'ایمیل',
    value: 'info@fanzoom.ir',
    href: 'mailto:info@fanzoom.ir',
    description: 'برای ارسال اخبار، پیشنهادات و انتقادات',
  },
  {
    icon: 'send' as const,
    label: 'تلگرام',
    value: '@fanzoom_ir',
    href: 'https://t.me/fanzoom_ir',
    description: 'کانال رسمی تلگرام فن زوم',
  },
  {
    icon: 'rss' as const,
    label: 'خوراک خبری',
    value: '/rss',
    href: '/rss',
    description: 'دنبال کردن اخبار از طریق RSS',
  },
];

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
      <div className="mb-8 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src="https://my-backend-fanzoom.liara.run/api/files/pbc_2583489775/2396ehdiapcae16/photo_1l7rr5z7gw.jpg?token="
            alt="فن زوم"
            className="h-10 w-10 rounded-xl object-cover shadow-1"
          />
          <span className="text-xl font-black text-on-surface">فن زوم</span>
        </Link>
      </div>

      <h1 className="text-3xl font-black leading-[1.35] tracking-tight text-on-surface md:text-4xl">
        تماس با ما
      </h1>

      <p className="mt-4 text-lg leading-9 text-on-surface-variant md:text-xl">
        برای ارتباط با تیم فن زوم می‌توانید از روش‌های زیر استفاده کنید. ما به تمام پیام‌ها پاسخ خواهیم داد.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {contactMethods.map((method) => (
          <a
            key={method.label}
            href={method.href}
            target={method.href.startsWith('http') ? '_blank' : undefined}
            rel={method.href.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="group flex flex-col gap-3 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-5 shadow-1 transition-all duration-300 ease-standard hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-2 hover:bg-surface-container"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary-container text-on-primary-container transition-transform group-hover:scale-110">
                <Icon name={method.icon} className="text-2xl" />
              </span>
              <div>
                <h3 className="font-bold text-on-surface">{method.label}</h3>
                <p className="text-sm font-medium text-primary">{method.value}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-on-surface-variant">{method.description}</p>
          </a>
        ))}
      </div>

      <div className="article-content mt-10 rounded-2xl border border-outline-variant/60 bg-surface-container p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-on-surface">
          <Icon name="edit_note" className="text-2xl text-primary" />
          ارسال اخبار و مطالب
        </h2>
        <p className="mt-3 leading-8 text-on-surface-variant">
          اگر خبر یا مطلبی برای انتشار دارید، می‌توانید آن را به آدرس ایمیل بالا ارسال کنید. تیم تحریریه فن زوم پس از بررسی، در صورت مناسب بودن، خبر شما را منتشر خواهد کرد. لطفاً در ارسال مطالب به منابع معتبر استناد کنید.
        </p>
      </div>

      <div className="mt-12 flex items-center justify-center gap-4 border-t border-outline-variant/60 pt-8">
        <Link
          href="/about"
          className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-5 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-on-surface/8 hover:text-on-surface active:scale-95"
        >
          <Icon name="person" className="text-lg" />
          درباره ما
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-1 transition-all hover:shadow-2 hover:brightness-110 active:scale-95"
        >
          <Icon name="home" className="text-lg" />
          بازگشت به خانه
        </Link>
      </div>
    </main>
  );
}
