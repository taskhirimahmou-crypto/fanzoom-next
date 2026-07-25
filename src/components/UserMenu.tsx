'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';

export interface CurrentUser {
  id: string;
  email: string;
  displayName?: string;
}

export function UserMenu({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setOpen(false);
    router.push('/');
    router.refresh();
  };

  const initial = (user.displayName || user.email || 'ک')[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center rounded-full p-1 transition-colors hover:bg-on-surface/8 active:bg-on-surface/12"
        aria-label="منوی کاربر"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary-container text-sm font-black text-on-secondary-container">
          {initial}
        </span>
      </button>

      <div
        className={`absolute left-0 top-full z-50 mt-2 w-60 origin-top rounded-xl border border-outline-variant/60 bg-surface-container-high p-1.5 shadow-2 transition-all duration-200 ease-standard ${
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
        }`}
      >
        <div className="border-b border-outline-variant/60 px-3 py-2.5">
          <p className="truncate text-sm font-bold text-on-surface">
            {user.displayName || 'کاربر فنزوم'}
          </p>
          <p className="truncate text-xs text-on-surface-variant">{user.email}</p>
        </div>
        <Link
          href="/profile"
          onClick={() => setOpen(false)}
          className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-on-surface/8"
        >
          <Icon name="person" className="text-xl text-on-surface-variant" />
          پروفایل من
        </Link>
                <Link
          href="/bookmarks"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-on-surface/8"
        >
          <Icon name="bookmark" className="text-xl text-on-surface-variant" />
          نشان‌شده‌ها
        </Link>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error/10"
        >
          <Icon name="logout" className="text-xl" />
          خروج
        </button>
      </div>
    </div>
  );
}