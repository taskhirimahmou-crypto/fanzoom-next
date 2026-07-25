// scripts/fix-auth-options.mjs
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');
const [email, password] = process.argv.slice(2);
await pb.collection('_superusers').authWithPassword(email, password);

const users = await pb.collections.getOne('users');
console.log('وضعیت onlyVerified (تأیید ایمیل اجباری):', users.onlyVerified);

if (users.onlyVerified) {
  await pb.collections.update(users.id, { onlyVerified: false });
  console.log('✅ خاموش شد — حالا بدون تأیید ایمیل می‌شود ثبت‌نام و ورود کرد');
} else {
  console.log('✅ از قبل خاموش بود — هیچ کاری لازم نیست');
}
process.exit(0);