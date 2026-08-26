// scripts/setup-collections.mjs
import PocketBase from 'pocketbase';

console.warn(
  '⚠️  DEPRECATED: schema changes are now managed by versioned files in pb_migrations/. ' +
  'Use the PocketBase `migrate up` command. This script remains only for legacy bootstrap compatibility.',
);

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('❌ دستور درست: node scripts/setup-collections.mjs <email> <password>');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);

try {
  await pb.collection('_superusers').authWithPassword(email, password);
  console.log('✅ اتصال به PocketBase برقرار شد');
} catch (e) {
  console.error('❌ خطا در ورود:', e.message);
  process.exit(1);
}

const categorySlugs = [
  'mobile-tablet', 'hardware-pc', 'ai-robotics', 'cybersecurity',
  'gaming', 'wearables', 'audio-visual', 'smart-home',
  'smart-mobility', 'software-os', 'tech-business',
];

async function ensureCollection(name, data) {
  try {
    const existing = await pb.collections.getOne(name);
    console.log(`⏭️  "${name}" از قبل وجود دارد`);
    return existing;
  } catch {
    const created = await pb.collections.create(data);
    console.log(`✅ "${name}" ساخته شد`);
    return created;
  }
}

// ── ۱. articles ──
const articles = await ensureCollection('articles', {
  type: 'base',
  name: 'articles',
  fields: [
    { name: 'title', type: 'text', required: true, presentable: true },
    { name: 'slug', type: 'text', required: true },
    { name: 'excerpt', type: 'text' },
    { name: 'content', type: 'editor' },
    { name: 'category', type: 'select', values: categorySlugs, maxSelect: 1 },
    { name: 'image', type: 'url' },
    { name: 'status', type: 'select', values: ['draft', 'published', 'archived'], maxSelect: 1 },
    { name: 'views', type: 'number' },
    { name: 'readTime', type: 'number' },
    { name: 'author', type: 'text' },
    { name: 'sourceUrl', type: 'url' },
    { name: 'publishedAt', type: 'date' },
    { name: 'featured', type: 'bool' },
  ],
  indexes: ['CREATE UNIQUE INDEX idx_articles_slug ON articles (slug)'],
  listRule: 'status = "published"',
  viewRule: 'status = "published"',
  createRule: null,
  updateRule: null,
  deleteRule: null,
});

// ── ۲. users ──
const users = await pb.collections.getOne('users');
const existing = users.fields.map((f) => f.name);
const userFields = [
  { name: 'displayName', type: 'text' },
  { name: 'avatar', type: 'file', maxSelect: 1, maxSize: 2097152 },
  { name: 'bio', type: 'text' },
  { name: 'interests', type: 'select', values: categorySlugs, maxSelect: 11 },
].filter((f) => !existing.includes(f.name));

if (userFields.length) {
  await pb.collections.update(users.id, { fields: [...users.fields, ...userFields] });
  console.log('✅ فیلدهای users به‌روز شد');
} else {
  console.log('⏭️  فیلدهای users از قبل کامل بود');
}

// ── ۳. bookmarks ──
await ensureCollection('bookmarks', {
  type: 'base',
  name: 'bookmarks',
  fields: [
    { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1 },
    { name: 'article', type: 'relation', required: true, collectionId: articles.id, maxSelect: 1 },
  ],
  indexes: ['CREATE UNIQUE INDEX idx_bookmarks_user_article ON bookmarks (user, article)'],
  listRule: '@request.auth.id = user.id',
  viewRule: '@request.auth.id = user.id',
  createRule: '@request.auth.id = user.id',
  updateRule: null,
  deleteRule: '@request.auth.id = user.id',
});

// ── ۴. comments ──
await ensureCollection('comments', {
  type: 'base',
  name: 'comments',
  fields: [
    { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1 },
    { name: 'article', type: 'relation', required: true, collectionId: articles.id, maxSelect: 1 },
    { name: 'content', type: 'text', required: true },
    { name: 'status', type: 'select', values: ['pending', 'approved', 'rejected'], maxSelect: 1 },
  ],
  listRule: 'status = "approved"',
  viewRule: 'status = "approved"',
  createRule: '@request.auth.id = user.id',
  updateRule: null,
  deleteRule: '@request.auth.id = user.id',
});

// ── ۵. reading_history ──
await ensureCollection('reading_history', {
  type: 'base',
  name: 'reading_history',
  fields: [
    { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1 },
    { name: 'article', type: 'relation', required: true, collectionId: articles.id, maxSelect: 1 },
    { name: 'progress', type: 'number', min: 0, max: 100 },
    { name: 'last_read', type: 'date' },
  ],
  listRule: '@request.auth.id = user.id',
  viewRule: '@request.auth.id = user.id',
  createRule: '@request.auth.id = user.id',
  updateRule: '@request.auth.id = user.id',
  deleteRule: '@request.auth.id = user.id',
});

console.log('\n🎉 همه‌ی collectionها آماده‌اند: http://127.0.0.1:8090/_/');
process.exit(0);
