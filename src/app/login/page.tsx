import { LoginClient } from './LoginClient';
import { safeRedirectPath } from '@/lib/auth-redirect';

const OAUTH_ERRORS: Record<string, string> = {
  oauth_configuration:
    'ورود با گوگل در حال حاضر در دسترس نیست. لطفاً بعداً دوباره تلاش کنید.',
  oauth_denied: 'ورود با گوگل لغو شد. در صورت تمایل دوباره تلاش کنید.',
  oauth_expired: 'فرایند ورود منقضی یا نامعتبر شد. لطفاً دوباره تلاش کنید.',
  oauth_exchange_failed: 'تکمیل ورود با گوگل ممکن نشد. لطفاً دوباره تلاش کنید.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const initialError = params.error ? OAUTH_ERRORS[params.error] ?? '' : '';

  return (
    <LoginClient
      initialError={initialError}
      returnTo={safeRedirectPath(params.redirect)}
    />
  );
}
