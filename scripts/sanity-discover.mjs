// scripts/sanity-discover.mjs
// کشف ساختار Sanity: چه document typeهایی داریم و مقالات چه شکلی‌اند
const PROJECT_ID = 'eml8dnki';
const DATASET = 'production';
const TOKEN = process.env.SANITY_TOKEN;

if (!TOKEN) {
  console.error('❌ SANITY_TOKEN در .env.local پیدا نشد');
  process.exit(1);
}

const API = `https://${PROJECT_ID}.api.sanity.io/v2021-10-21/data/query/${DATASET}`;

async function groq(query) {
  const url = `${API}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Sanity error ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

// ۱. همه‌ی document typeها
const types = await groq('array::unique(*._type)');
console.log('📋 document types موجود:', types);

// ۲. تعداد هر type
console.log('\n📊 تعداد هر type:');
for (const type of types) {
  const count = await groq(`count(*[_type == "${type}"])`);
  console.log(`   ${type}: ${count}`);
}

// ۳. نمونه‌ی typeهایی که احتمالاً مقاله‌اند
const candidates = types.filter((t) =>
  ['post', 'article', 'news', 'blog', 'story', 'posts', 'articles', 'newsarticle'].includes(
    t.toLowerCase(),
  ),
);
console.log('\n🔍 نامزدهای مقاله:', candidates.length ? candidates : '(هیچ — همه‌ی typeها را دستی بررسی کن)');

for (const type of candidates) {
  const sample = await groq(`*[_type == "${type}"][0]`);
  console.log(`\n────── نمونه‌ی "${type}" ──────`);
  console.log(JSON.stringify(sample, null, 2).slice(0, 2500));
}

process.exit(0);