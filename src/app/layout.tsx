import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import 'material-symbols/rounded.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import './globals.css';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { cache } from 'react';

const vazir = Vazirmatn({
  subsets: ['arabic', 'latin'],
  variable: '--font-vazir',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL('https://fanzoom.ir'),
  title: {
    default: 'فن زوم | رسانه‌ی تخصصی فناوری',
    template: '%s | فن زوم',
  },
  description:
    'فن زوم، رسانه‌ی تخصصی فناوری؛ اخبار، بررسی و تحلیل دنیای تکنولوژی به زبان فارسی.',
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'فن زوم',
    title: 'فن زوم | رسانه‌ی تخصصی فناوری',
    description: 'اخبار، بررسی و تحلیل دنیای تکنولوژی به زبان فارسی.',
  },
  twitter: { card: 'summary_large_image' },
};

const getCurrentUser = cache(async () => {
  const pb = await getServerPocketBase();
  const record = pb.authStore.record as
    | { id: string; email: string; displayName?: string }
    | null;
  return record
    ? { id: record.id, email: record.email, displayName: record.displayName }
    : null;
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html
      lang="fa"
      dir="rtl"
      data-scroll-behavior="smooth"
      className={`${vazir.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-surface text-on-surface selection:bg-primary/20 selection:text-on-primary-container">
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
