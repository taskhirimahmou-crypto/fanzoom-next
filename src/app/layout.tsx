import type { Metadata } from 'next';
import Script from 'next/script';
import { Vazirmatn } from 'next/font/google';
import 'material-symbols/rounded.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import './globals.css';
import { getServerPocketBase } from '@/lib/auth-cookies';

const vazir = Vazirmatn({
  subsets: ['arabic', 'latin'],
  variable: '--font-vazir',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: {
    default: 'فنزوم | رسانه‌ی تخصصی فناوری',
    template: '%s | فنزوم',
  },
  description:
    'فنزوم، رسانه‌ی تخصصی فناوری؛ اخبار، بررسی و تحلیل دنیای تکنولوژی به زبان فارسی.',
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'فنزوم',
    title: 'فنزوم | رسانه‌ی تخصصی فناوری',
    description: 'اخبار، بررسی و تحلیل دنیای تکنولوژی به زبان فارسی.',
  },
  twitter: { card: 'summary_large_image' },
};

const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // خواندن کاربر لاگین‌شده از کوکی (برای SSR)
  const pb = await getServerPocketBase();
  const record = pb.authStore.record as
    | { id: string; email: string; displayName?: string }
    | null;
  const user = record
    ? { id: record.id, email: record.email, displayName: record.displayName }
    : null;

  return (
    <html
      lang="fa"
      dir="rtl"
      data-scroll-behavior="smooth"
      className={`${vazir.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-surface text-on-surface selection:bg-primary/20 selection:text-on-primary-container">
        <Script
          id="theme-no-flash"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT }}
        />
        <ThemeProvider>
          <div className="flex min-h-screen flex-col">
            <Header user={user} />
            <div className="flex-1">{children}</div>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}