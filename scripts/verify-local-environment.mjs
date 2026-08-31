import PocketBase from 'pocketbase';

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const adminEmail = process.env.PB_SUPERUSER_EMAIL;
const adminPassword = process.env.PB_SUPERUSER_PASSWORD;
const testUserEmail = process.env.LOCAL_TEST_USER_EMAIL;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pbUrl, 'NEXT_PUBLIC_POCKETBASE_URL is required');
assert(adminEmail && adminPassword, 'Local PocketBase superuser credentials are required');
assert(testUserEmail, 'LOCAL_TEST_USER_EMAIL is required');

const parsedUrl = new URL(pbUrl);
assert(
  parsedUrl.hostname === 'pocketbase',
  'Verification is allowed only against the local Docker PocketBase service',
);

const pb = new PocketBase(pbUrl);
pb.autoCancellation(false);
await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

const collections = await pb.collections.getFullList();
const requiredCollections = [
  'users',
  'articles',
  'bookmarks',
  'comments',
  'reading_history',
  'recommendation_events',
  'app_admins',
];

for (const name of requiredCollections) {
  assert(collections.some((collection) => collection.name === name), `Missing collection: ${name}`);
}

const recommendationEvents = collections.find(
  (collection) => collection.name === 'recommendation_events',
);
for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
  assert(recommendationEvents?.[rule] === null, `recommendation_events.${rule} must be private`);
}
const surfaceField = (recommendationEvents?.fields ?? []).find((field) => field.name === 'surface');
assert(surfaceField?.values?.includes('direct'), 'recommendation_events.surface must allow direct');

const appAdmins = collections.find((collection) => collection.name === 'app_admins');
for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
  assert(appAdmins?.[rule] === null, `app_admins.${rule} must be private`);
}
const appAdminFieldNames = new Set((appAdmins?.fields ?? []).map((field) => field.name));
for (const name of ['user', 'role', 'enabled']) {
  assert(appAdminFieldNames.has(name), `Missing app_admins.${name} field`);
}
const appAdminRole = (appAdmins?.fields ?? []).find((field) => field.name === 'role');
assert(
  JSON.stringify(appAdminRole?.values) === JSON.stringify(['owner', 'admin', 'viewer']),
  'app_admins.role values do not match the access contract',
);
assert(
  (appAdmins?.indexes ?? []).some((index) => String(index).includes('idx_app_admins_user_unique')),
  'app_admins.user must be unique',
);

const users = collections.find((collection) => collection.name === 'users');
const userFieldNames = new Set((users?.fields ?? []).map((field) => field.name));
assert(userFieldNames.has('personalizationEnabled'), 'Missing personalizationEnabled field');
assert(userFieldNames.has('personalizationConsentAt'), 'Missing personalizationConsentAt field');

const articleResult = await pb.collection('articles').getList(1, 1);
assert(articleResult.totalItems >= 8, 'Expected at least 8 local seed articles');

const testUser = await pb.collection('users').getFirstListItem(
  pb.filter('email = {:email}', { email: testUserEmail }),
);
assert(testUser.personalizationEnabled === false, 'Local test user must start opted out');

console.log('✅ Local PocketBase schema, private admin rules, seed data, and consent default verified.');
