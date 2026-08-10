import Link from 'next/link';
import Image from 'next/image';
import { Icon, type IconName } from '@/components/Icon';
import { mainNavCategories } from '@/lib/categories';

const quickLinks = [
  { label: 'درباره فن زوم', href: '/about' },
  { label: 'تماس با ما', href: '/contact' },
  { label: 'حریم خصوصی', href: '/privacy' },
  { label: 'قوانین استفاده', href: '/terms' },
  { label: 'آرشیو اخبار', href: '/archive' },
];

const socials: { label: string; href: string; icon: IconName }[] = [
  { label: 'تلگرام', href: 'https://t.me/fanzoom_ir', icon: 'send' },
  { label: 'خوراک خبری', href: '/rss', icon: 'rss' },
  { label: 'ایمیل', href: 'mailto:info@fanzoom.ir', icon: 'mail' },
  { label: 'وب‌سایت', href: '/', icon: 'public' },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-outline-variant/60 bg-surface-container-low pcb-bg">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* برند */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="https://my-backend-fanzoom.liara.run/api/files/pbc_2583489775/2396ehdiapcae16/photo_1l7rr5z7gw.jpg?token="
                alt="فن زوم"
                width={36}
                height={36}
                priority={false}
                className="h-9 w-9 rounded-xl object-cover shadow-1"
              />
              <span className="text-lg font-black text-on-surface">فن زوم</span>
            </Link>
            <p className="mt-4 text-sm leading-7 text-on-surface-variant">
              رسانه‌ی تخصصی فناوری؛ اخبار، بررسی و تحلیل دنیای تکنولوژی به زبان فارسی.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target={s.href.startsWith('http') ? '_blank' : undefined}
                  rel={s.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  aria-label={s.label}
                  className="grid h-10 w-10 place-items-center rounded-full bg-surface-container-high text-on-surface-variant transition-all hover:bg-primary-container hover:text-on-primary-container active:scale-95"
                >
                  <Icon name={s.icon} className="text-xl" />
                </a>
              ))}
            </div>
          </div>

          {/* دسته‌بندی‌ها */}
          <div>
            <h3 className="text-sm font-bold text-on-surface">دسته‌بندی‌ها</h3>
            <ul className="mt-4 space-y-1">
              {mainNavCategories.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/category/${cat.slug}`}
                    className="inline-block rounded-lg px-2 py-1.5 text-sm text-on-surface-variant transition-colors hover:bg-on-surface/8 hover:text-on-surface"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* دسترسی سریع */}
          <div>
            <h3 className="text-sm font-bold text-on-surface">دسترسی سریع</h3>
            <ul className="mt-4 space-y-1">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-block rounded-lg px-2 py-1.5 text-sm text-on-surface-variant transition-colors hover:bg-on-surface/8 hover:text-on-surface"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* همراه ما باشید */}
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-sm font-bold text-on-surface">همراه ما باشید</h3>
            <p className="mt-4 text-sm leading-7 text-on-surface-variant">
              جدیدترین اخبار فناوری را در کانال تلگرام فن زوم دنبال کنید.
            </p>
            <a
              href="https://t.me/fanzoom_ir"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-1 transition-all hover:shadow-2 hover:brightness-110 active:scale-95"
            >
              <Icon name="send" className="text-lg" />
              عضویت در تلگرام
            </a>
          </div>
        </div>

        {/* نوار پایینی */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-outline-variant/60 pt-6 sm:flex-row">
          <p className="text-xs text-on-surface-variant">
            © {year} فن زوم — تمامی حقوق محفوظ است.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            ساخته‌شده با
            <Icon name="bolt" fill className="text-sm text-primary" />
            برای علاقه‌مندان فناوری
          </p>
        </div>
      </div>
    </footer>
  );
}