'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';

export function LogoutButton() {
  const router = useRouter();
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  };
  return (
    <button
      onClick={logout}
      className="inline-flex items-center gap-2 rounded-full bg-error px-6 py-3 text-sm font-bold text-on-error shadow-1 transition-all duration-300 ease-standard hover:shadow-2 hover:brightness-110 active:scale-95"
    >
      <Icon name="logout" className="text-lg" />
      خروج از حساب
    </button>
  );
}