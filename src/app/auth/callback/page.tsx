import { redirect } from 'next/navigation';

/** Legacy compatibility route; OAuth now completes on the server callback. */
export default function LegacyAuthCallbackPage() {
  redirect('/login?error=oauth_expired');
}
