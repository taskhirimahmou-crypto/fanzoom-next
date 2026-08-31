// scripts/seed-articles.mjs
// ساخت مقاله‌های تست در PocketBase
// اجرا در محیط محلی: ALLOW_LOCAL_SEED=true node scripts/seed-articles.mjs

import PocketBase from 'pocketbase';

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const [emailArg, passwordArg] = process.argv.slice(2);
const email = emailArg || process.env.PB_SUPERUSER_EMAIL;
const password = passwordArg || process.env.PB_SUPERUSER_PASSWORD;

let pbHostname = '';
try {
  pbHostname = new URL(PB_URL).hostname;
} catch {
  console.error('❌ آدرس PocketBase معتبر نیست.');
  process.exit(1);
}

const localHosts = new Set(['127.0.0.1', 'localhost', 'pocketbase']);
if (process.env.ALLOW_LOCAL_SEED !== 'true' || !localHosts.has(pbHostname)) {
  console.error('❌ Seed فقط با ALLOW_LOCAL_SEED=true و روی PocketBase محلی مجاز است.');
  process.exit(1);
}

if (!email || !password) {
  console.error('❌ PB_SUPERUSER_EMAIL و PB_SUPERUSER_PASSWORD لازم است.');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);

try {
  await pb.collection('_superusers').authWithPassword(email, password);
  console.log('✅ اتصال برقرار شد');
} catch (e) {
  console.error('❌ خطا در ورود:', e.message);
  process.exit(1);
}

const articles = [
  {
    title: 'هوش مصنوعی مولد به گوشی‌های میان‌رده می‌آید؛ انقلابی در راه است',
    slug: 'ai-phones-revolution',
    excerpt: 'سازندگان بزرگ تراشه از نسل جدید پردازنده‌های خود رونمایی کردند که قابلیت اجرای مدل‌های زبانی بزرگ را به‌صورت آفلاین و روی دستگاه فراهم می‌کند؛ قابلیتی که تا پیش از این تنها در پرچمداران گران‌قیمت دیده می‌شد.',
    content: '<p>در رویداد امسال، سه سازنده‌ی بزرگ تراشه از نسل جدید پردازنده‌های موبایل خود رونمایی کردند که همگی بر اجرای محلی مدل‌های زبانی بزرگ تمرکز دارند.</p><p>این یعنی دستیارهای هوشمند، ترجمه‌ی بلادرنگ و خلاصه‌سازی متن بدون نیاز به اینترنت و با حفظ حریم خصوصی کاربر انجام می‌شود.</p>',
    category: 'ai-robotics',
    status: 'published',
    views: 12400,
    readTime: 8,
    author: 'تحریریه فن زوم',
    publishedAt: '2026-07-25 09:00:00',
    featured: true,
  },
  {
    title: 'بررسی کامل پرچمدار جدید؛ قدرت مطلق در دستان شما',
    slug: 'flagship-review',
    excerpt: 'یک ماه با پرچمدار جدید زندگی کردیم؛ نتیجه چیزی فراتر از انتظار بود.',
    content: '<p>پرچمدار امسال با طراحی تازه، دوربین سه‌گانه‌ی بازطراحی‌شده و باتری ۵۵۰۰ میلی‌آمپری عرضه شده است.</p><p>در استفاده‌ی روزمره، عملکرد دوربین در نور کم نقطه‌ی قوت اصلی این دستگاه است.</p>',
    category: 'mobile-tablet',
    status: 'published',
    views: 8200,
    readTime: 12,
    author: 'تحریریه فن زوم',
    publishedAt: '2026-07-25 07:00:00',
    featured: false,
  },
  {
    title: 'نسل جدید کارت‌های گرافیک رونمایی شد؛ جهشی ۴۰ درصدی در عملکرد',
    slug: 'gpu-launch',
    excerpt: 'رقابت در بازار گرافیک داغ‌تر از همیشه؛ نگاهی به مشخصات و قیمت‌ها.',
    content: '<p>نسل جدید کارت‌های گرافیک با معماری تازه و پشتیبانی از ray tracing نسل سوم معرفی شدند.</p><p>بر اساس بنچمارک‌های اولیه، عملکرد در بازی‌های 4K تا ۴۰ درصد بهبود یافته است.</p>',
    category: 'hardware-pc',
    status: 'published',
    views: 9700,
    readTime: 6,
    author: 'تحریریه فن زوم',
    publishedAt: '2026-07-25 05:00:00',
    featured: false,
  },
  {
    title: 'هشدار امنیتی جدید؛ میلیاردها دستگاه در معرض خطر',
    slug: 'security-alert',
    excerpt: 'یک آسیب‌پذیری بحرانی کشف شده که میلیون‌ها کاربر را تحت تأثیر قرار می‌دهد.',
    content: '<p>پژوهشگران امنیتی یک آسیب‌پذیری بحرانی در یکی از کتابخانه‌های پرکاربرد کشف کرده‌اند.</p><p>به کاربران توصیه می‌شود هرچه سریع‌تر به‌روزرسانی‌های امنیتی را نصب کنند.</p>',
    category: 'cybersecurity',
    status: 'published',
    views: 15100,
    readTime: 4,
    author: 'تحریریه فن زوم',
    publishedAt: '2026-07-25 11:00:00',
    featured: false,
  },
  {
    title: 'کنسول نسل بعدی سونی زودتر از انتظار می‌آید',
    slug: 'ps6-rumor',
    excerpt: 'گزارش‌های جدید از عرضه‌ی زودهنگام کنسول نسل بعدی حکایت دارند.',
    content: '<p>بر اساس گزارش‌های زنجیره‌ی تأمین، سونی برنامه‌ی خود را برای عرضه‌ی کنسول نسل بعدی جلو انداخته است.</p>',
    category: 'gaming',
    status: 'published',
    views: 11300,
    readTime: 5,
    author: 'تحریریه فن زوم',
    publishedAt: '2026-07-24 18:00:00',
    featured: false,
  },
  {
    title: 'ساعت هوشمند جدید با سنسورهای پیشرفته‌ی پایش سلامت',
    slug: 'smartwatch-health',
    excerpt: 'پایش فشار خون و قند خون بدون نیاز به تجهیزات جانبی.',
    content: '<p>ساعت هوشمند جدید با سنسورهای نسل تازه قادر به پایش غیرتهاجمی فشار خون است.</p>',
    category: 'wearables',
    status: 'published',
    views: 6800,
    readTime: 7,
    author: 'تحریریه فن زوم',
    publishedAt: '2026-07-24 14:00:00',
    featured: false,
  },
  {
    title: 'به‌روزرسانی بزرگ اندروید ۱۶ با قابلیت‌های هوش مصنوعی منتشر شد',
    slug: 'android-16',
    excerpt: 'نگاهی به مهم‌ترین تغییرات و دستگاه‌های واجد شرایط دریافت به‌روزرسانی.',
    content: '<p>اندروید ۱۶ با تمرکز بر قابلیت‌های هوش مصنوعی دستگاهی و حریم خصوصی منتشر شد.</p>',
    category: 'software-os',
    status: 'published',
    views: 10500,
    readTime: 6,
    author: 'تحریریه فن زوم',
    publishedAt: '2026-07-24 10:00:00',
    featured: false,
  },
  {
    title: 'خودروهای برقی خودران به جاده‌های ایران می‌آیند؟',
    slug: 'ev-iran',
    excerpt: 'زیرساخت‌های شارژ و چالش‌های پیش‌روی خودروهای برقی در کشور.',
    content: '<p>با گسترش زیرساخت‌های شارژ، پرسش ورود خودروهای برقی خودران به کشور جدی‌تر شده است.</p>',
    category: 'smart-mobility',
    status: 'published',
    views: 7900,
    readTime: 9,
    author: 'تحریریه فن زوم',
    publishedAt: '2026-07-23 16:00:00',
    featured: false,
  },
];

for (const article of articles) {
  try {
    await pb.collection('articles').getFirstListItem(`slug="${article.slug}"`);
    console.log(`⏭️  "${article.slug}" از قبل وجود دارد`);
  } catch {
    await pb.collection('articles').create(article);
    console.log(`✅ "${article.slug}" ساخته شد`);
  }
}

console.log('\n🎉 مقاله‌های تست آماده‌اند. داشبورد: http://127.0.0.1:8090/_/');
process.exit(0);
