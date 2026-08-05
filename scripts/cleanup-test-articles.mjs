// scripts/cleanup-test-articles.mjs
import PocketBase from 'pocketbase';
const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');
const [email, password] = process.argv.slice(2);
await pb.collection('_superusers').authWithPassword(email, password);

const testSlugs = [
  'ai-phones-revolution', 'flagship-review', 'gpu-launch', 'security-alert',
  'ps6-rumor', 'smartwatch-health', 'android-16', 'ev-iran',
];
for (const slug of testSlugs) {
  try {
    const a = await pb.collection('articles').getFirstListItem(`slug="${slug}"`);
    await pb.collection('articles').delete(a.id);
    console.log(`🗑️  "${slug}" پاک شد`);
  } catch {
    console.log(`⏭️  "${slug}" وجود نداشت`);
  }
}
console.log('✅ تمیز شد');
process.exit(0);