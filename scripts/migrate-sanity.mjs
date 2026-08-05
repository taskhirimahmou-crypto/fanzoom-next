// scripts/migrate-sanity.mjs
// انتقال مقالات از Sanity به PocketBase
// اجرا: node --env-file=.env.local scripts/migrate-sanity.mjs <pb-email> <pb-password>

import PocketBase from 'pocketbase';

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const SANITY_TOKEN = process.env.SANITY_TOKEN;
const [pbEmail, pbPassword] = process.argv.slice(2);

if (!SANITY_TOKEN) {
  console.error('❌ SANITY_TOKEN در .env.local نیست');
  process.exit(1);
}
if (!pbEmail || !pbPassword) {
  console.error('❌ دستور: node --env-file=.env.local scripts/migrate-sanity.mjs <pb-email> <pb-password>');
  process.exit(1);
}

const PROJECT_ID = 'eml8dnki';
const DATASET = 'production';
const SANITY_API = `https://${PROJECT_ID}.api.sanity.io/v2021-10-21/data/query/${DATASET}`;

// نگاشت نام فارسی دسته → slug
const categoryMap = {
  'موبایل و تبلت': 'mobile-tablet',
  'سخت‌افزار و قطعات کامپیوتر': 'hardware-pc',
  'هوش مصنوعی و رباتیک': 'ai-robotics',
  'امنیت سایبری و حریم خصوصی': 'cybersecurity',
  'گیمینگ و کنسول‌ها': 'gaming',
  'گجت‌های پوشیدنی و سلامت': 'wearables',
  'صوتی، تصویری و عکاسی': 'audio-visual',
  'خانه هوشمند و اینترنت اشیا': 'smart-home',
  'حمل‌ونقل و وسایل نقلیه هوشمند': 'smart-mobility',
  'نرم‌افزار و سیستم‌عامل': 'software-os',
  'کسب‌وکار، سیاست و صنعت فناوری': 'tech-business',
};

/* ── توابع تبدیل ── */
async function groq(query) {
  const url = `${SANITY_API}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SANITY_TOKEN}` } });
  if (!res.ok) throw new Error(`Sanity error ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

// image-098192...-1280x720-jpg → https://cdn.sanity.io/images/.../098192...-1280x720.jpg
function sanityImageUrl(ref) {
  if (!ref) return '';
  const m = ref.match(/^image-(.+)-(\d+x\d+)-(\w+)$/);
  if (!m) return '';
  return `https://cdn.sanity.io/images/${PROJECT_ID}/${DATASET}/${m[1]}-${m[2]}.${m[3]}`;
}

// Tue, 21 Jul 2026 13:00:00 +0000 → 2026-07-21 13:00:00
function toDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// تخمین زمان مطالعه از روی HTML (۲۰۰ کلمه در دقیقه)
function calcReadTime(html) {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/* ── ۱. اتصال به PocketBase ── */
const pb = new PocketBase(PB_URL);
try {
  await pb.collection('_superusers').authWithPassword(pbEmail, pbPassword);
  console.log('✅ به PocketBase متصل شد');
} catch (e) {
  console.error('❌ خطا در ورود به PocketBase:', e.message);
  process.exit(1);
}

/* ── ۲. خواندن همه‌ی مقالات Sanity (دسته‌دسته) ── */
console.log('\n📥 در حال خواندن از Sanity...');
let all = [];
const BATCH = 100;
while (true) {
  const batch = await groq(
    `*[_type == "article"] | order(_createdAt asc) [${all.length}...${all.length + BATCH}]{title,slug,excerpt,content,category,image,publishedAt,author,views}`,
  );
  all = all.concat(batch);
  console.log(`   خوانده‌شده: ${all.length}`);
  if (batch.length < BATCH) break;
}
console.log(`✅ ${all.length} مقاله از Sanity خوانده شد`);

/* ── ۳. slugهای موجود در PocketBase (برای جلوگیری از تکرار) ── */
const existing = await pb.collection('articles').getFullList({ fields: 'slug' });
const existingSlugs = new Set(existing.map((a) => a.slug));
console.log(`   ${existingSlugs.size} مقاله از قبل در PocketBase موجود است`);

/* ── ۴. درج مقالات جدید ── */
console.log('\n📤 در حال انتقال به PocketBase... (چند دقیقه طول می‌کشد)');
let created = 0;
let skipped = 0;
let errors = 0;
const unmapped = new Set();

for (const a of all) {
  const slug = a.slug?.current;
  if (!slug || existingSlugs.has(slug)) {
    skipped++;
    continue;
  }

  const categoryName = (a.category || '').trim();
  const categorySlug = categoryMap[categoryName];
  if (!categorySlug) unmapped.add(categoryName);

  try {
    await pb.collection('articles').create({
      title: a.title || '',
      slug,
      excerpt: a.excerpt || '',
      content: a.content || '',
      category: categorySlug || 'tech-business',
      image: sanityImageUrl(a.image?.asset?._ref),
      status: 'published',
      views: a.views || 0,
      readTime: calcReadTime(a.content || ''),
      author: a.author || 'تیم تحریریه',
      sourceUrl: '',
      publishedAt: toDate(a.publishedAt),
      featured: false,
    });
    created++;
        existingSlugs.add(slug);   // ← این خط را اضافه کن
    if (created % 100 === 0) console.log(`   درج‌شده: ${created}`);
  } catch (e) {
    errors++;
        console.error(`   ❌ خطا در "${slug}": ${JSON.stringify(e.response?.data || e.message)}`);
  }
}

/* ── ۵. گزارش ── */
console.log('\n🎉 migration تمام شد');
console.log(`   ✅ درج شد: ${created}`);
console.log(`   ⏭️  رد شد (تکراری یا بدون slug): ${skipped}`);
console.log(`   ❌ خطا: ${errors}`);
if (unmapped.size) {
  console.log(`\n   ⚠️ این دسته‌ها در mapping نبودند (به tech-business نگاشت شدند):`);
  for (const c of unmapped) console.log(`      - "${c}"`);
  console.log('   (اگر خواستی، بعداً دسته‌بندی‌شان را در داشبورد اصلاح می‌کنیم)');
}
process.exit(0);