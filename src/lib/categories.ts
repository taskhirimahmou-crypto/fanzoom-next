import type { IconName } from '@/components/Icon';

export type CategoryTone =
  | 'blue'
  | 'violet'
  | 'magenta'
  | 'red'
  | 'green'
  | 'teal'
  | 'amber'
  | 'indigo'
  | 'cyan'
  | 'fuchsia'
  | 'slate';

export interface Category {
  name: string;
  slug: string;
  symbol: IconName;
  tone: CategoryTone;
  description: string;
  keywords: string[];
}

export const allCategories: Category[] = [
  {
    name: 'موبایل و تبلت',
    slug: 'mobile-tablet',
    symbol: 'smartphone',
    tone: 'blue',
    description: 'اخبار گوشی‌های هوشمند، تبلت‌ها و لوازم جانبی موبایل',
    keywords: ['گوشی', 'موبایل', 'تبلت', 'آیفون', 'سامسونگ', 'شیائومی'],
  },
  {
    name: 'سخت‌افزار و قطعات کامپیوتر',
    slug: 'hardware-pc',
    symbol: 'memory',
    tone: 'violet',
    description: 'پردازنده، کارت گرافیک، رم، SSD و قطعات کامپیوتر',
    keywords: ['پردازنده', 'gpu', 'کارت گرافیک', 'nvidia', 'amd', 'ram', 'ssd'],
  },
  {
    name: 'هوش مصنوعی و رباتیک',
    slug: 'ai-robotics',
    symbol: 'smart_toy',
    tone: 'magenta',
    description: 'آخرین اخبار هوش مصنوعی، مدل‌های زبانی و ربات‌ها',
    keywords: ['هوش مصنوعی', 'chatgpt', 'openai', 'gemini', 'ربات'],
  },
  {
    name: 'امنیت سایبری و حریم خصوصی',
    slug: 'cybersecurity',
    symbol: 'shield',
    tone: 'red',
    description: 'اخبار امنیت، بدافزارها، هک و حریم خصوصی دیجیتال',
    keywords: ['امنیت', 'بدافزار', 'هک', 'حریم خصوصی', 'ransomware'],
  },
  {
    name: 'گیمینگ و کنسول‌ها',
    slug: 'gaming',
    symbol: 'sports_esports',
    tone: 'green',
    description: 'اخبار بازی‌ها، کنسول‌های PS5، Xbox و Nintendo',
    keywords: ['بازی', 'گیم', 'ps5', 'xbox', 'nintendo', 'steam'],
  },
  {
    name: 'گجت‌های پوشیدنی و سلامت',
    slug: 'wearables',
    symbol: 'watch',
    tone: 'teal',
    description: 'ساعت‌های هوشمند، مچ‌بندها و گجت‌های سلامت',
    keywords: ['ساعت هوشمند', 'smartwatch', 'wearable', 'سلامت'],
  },
  {
    name: 'صوتی، تصویری و عکاسی',
    slug: 'audio-visual',
    symbol: 'headphones',
    tone: 'amber',
    description: 'هدفون، اسپیکر، دوربین و تجهیزات عکاسی',
    keywords: ['هدفون', 'اسپیکر', 'دوربین', 'عکاسی', 'sony'],
  },
  {
    name: 'خانه هوشمند و اینترنت اشیا',
    slug: 'smart-home',
    symbol: 'home',
    tone: 'indigo',
    description: 'اتوماسیون خانگی، IoT و گجت‌های هوشمند خانه',
    keywords: ['خانه هوشمند', 'iot', 'smart home', 'alexa'],
  },
  {
    name: 'حمل‌ونقل و وسایل نقلیه هوشمند',
    slug: 'smart-mobility',
    symbol: 'electric_car',
    tone: 'cyan',
    description: 'خودروهای برقی، پهپادها و سیستم‌های حمل‌ونقل هوشمند',
    keywords: ['خودرو', 'تسلا', 'ev', 'پهپاد', 'drone'],
  },
  {
    name: 'نرم‌افزار و سیستم‌عامل',
    slug: 'software-os',
    symbol: 'code',
    tone: 'fuchsia',
    description: 'ویندوز، اندروید، iOS، لینوکس و نرم‌افزارهای کاربردی',
    keywords: ['ویندوز', 'اندروید', 'ios', 'linux', 'به‌روزرسانی'],
  },
  {
    name: 'کسب‌وکار، سیاست و صنعت فناوری',
    slug: 'tech-business',
    symbol: 'insights',
    tone: 'slate',
    description: 'اخبار کسب‌وکارهای تکنولوژی، سرمایه‌گذاری و سیاست‌های فناوری',
    keywords: ['سرمایه‌گذاری', 'تحریم', 'استارتاپ', 'business'],
  },
];

export const mainNavCategories = allCategories.slice(0, 6);
export const moreNavCategories = allCategories.slice(6);

export function findCategory(name: string): Category | undefined {
  return allCategories.find((c) => c.name === name);
}

export function findCategoryBySlug(slug: string): Category | undefined {
  return allCategories.find((c) => c.slug === slug);
}