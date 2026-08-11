import { redirect } from 'next/navigation';
import { getServerPocketBase } from '@/lib/auth-cookies';

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const pb = await getServerPocketBase();

  // PocketBase OAuth callback را هندل می‌کند
  // اگر موفق بود، user در authStore ذخیره می‌شود
  if (pb.authStore.isValid) {
    redirect('/');
  }

  // اگر خطا بود
  redirect('/login?error=oauth_failed');
}