import PocketBase from 'pocketbase';

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const adminEmail = process.env.PB_SUPERUSER_EMAIL;
const adminPassword = process.env.PB_SUPERUSER_PASSWORD;
const userEmail = process.env.LOCAL_TEST_USER_EMAIL;
const userPassword = process.env.LOCAL_TEST_USER_PASSWORD;

if (!pbUrl || !adminEmail || !adminPassword || !userEmail || !userPassword) {
  console.error('❌ متغیرهای bootstrap کاربر محلی کامل نیستند.');
  process.exit(1);
}

let hostname = '';
try {
  hostname = new URL(pbUrl).hostname;
} catch {
  console.error('❌ آدرس PocketBase معتبر نیست.');
  process.exit(1);
}

if (process.env.ALLOW_LOCAL_SEED !== 'true' || hostname !== 'pocketbase') {
  console.error('❌ ساخت کاربر تست فقط داخل شبکه Docker محلی مجاز است.');
  process.exit(1);
}

const pb = new PocketBase(pbUrl);
pb.autoCancellation(false);

await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

let existing = null;
try {
  existing = await pb.collection('users').getFirstListItem(
    pb.filter('email = {:email}', { email: userEmail })
  );
} catch (error) {
  if (error?.status !== 404) throw error;
}

const profile = {
  displayName: 'کاربر تست محلی',
  interests: ['ai-robotics', 'mobile-tablet', 'cybersecurity'],
  personalizationEnabled: false,
  personalizationConsentAt: '',
  verified: true,
};

if (existing) {
  await pb.collection('users').update(existing.id, profile);
  console.log(`⏭️  کاربر تست محلی به‌روزرسانی شد: ${userEmail}`);
} else {
  await pb.collection('users').create({
    ...profile,
    email: userEmail,
    password: userPassword,
    passwordConfirm: userPassword,
  });
  console.log(`✅ کاربر تست محلی ساخته شد: ${userEmail}`);
}
