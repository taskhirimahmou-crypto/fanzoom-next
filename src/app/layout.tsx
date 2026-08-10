import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
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

// Material Symbols را از CDN لود می‌کنیم (نه next/font)

export const metadata: Metadata = {
  // آدرس پایه سایت — برای تمام لینک‌های نسبی (Open Graph، canonical و...)
  metadataBase: new URL('https://fanzoom.ir'),
  
  // عنوان پیش‌فرض + قالب عنوان صفحات داخلی
  title: {
    default: 'فن زوم | پایگاه خبری فناوری',
    template: '%s | فن زوم',
  },
  
  description:
    'فن زوم، پایگاه خبری فناوری ایران — آخرین اخبار موبایل، سخت‌افزار، نرم‌افزار، خودروهای برقی و هوش مصنوعی',
  
  // کلمات کلیدی (تأثیر کم ولی بدون ضرر)
  keywords: [
    'اخبار فناوری',
    'اخبار تکنولوژی',
    'موبایل',
    'سخت‌افزار',
    'نرم‌افزار',
    'هوش مصنوعی',
    'خودرو برقی',
    'فن زوم',
  ],
  
authors: [{ name: 'تحریریه فن زوم' }],
  
  // canonical پیش‌فرض
  alternates: {
    canonical: '/',
  },
  
  // Open Graph — برای تلگرام، لینکدین، فیسبوک
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    url: 'https://fanzoom.ir',
    siteName: 'فن زوم',
    title: 'فن زوم | پایگاه خبری فناوری',
    description:
      'آخرین اخبار فناوری، بررسی موبایل، سخت‌افزار، نرم‌افزار و هوش مصنوعی',
    images: [
      {
        url: '/og-default.jpg', // یک عکس 1200x630 در پوشه public بگذار
        width: 1200,
        height: 630,
        alt: 'فن زوم | پایگاه خبری فناوری',
      },
    ],
  },
  
  // Twitter Card — برای توییتر/ایکس
  twitter: {
    card: 'summary_large_image',
    title: 'فن زوم | پایگاه خبری فناوری',
    description:
      'آخرین اخبار فناوری، بررسی موبایل، سخت‌افزار، نرم‌افزار و هوش مصنوعی',
    images: ['/og-default.jpg'],
  },
  
  // ربات‌ها
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
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
