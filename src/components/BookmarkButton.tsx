'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';

export function BookmarkButton({
  articleId,
  initialBookmarked,
  signedIn,
}: {
  articleId: string;
  initialBookmarked: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!signedIn) {
      router.push('/login');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/bookmarks', {
        method: bookmarked ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });
      if (res.ok) setBookmarked((v) => !v);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={bookmarked ? 'حذف از نشان‌شده‌ها' : 'افزودن به نشان‌شده‌ها'}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold shadow-1 transition-all duration-300 ease-standard hover:shadow-2 active:scale-95 disabled:opacity-60 ${
        bookmarked
          ? 'bg-secondary-container text-on-secondary-container'
          : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
      }`}
    >
      <Icon
        name="bookmark"
        fill={bookmarked}
        className={`text-base transition-transform duration-300 ease-decelerate ${
          bookmarked ? 'scale-110' : ''
        }`}
      />
      {bookmarked ? 'نشان‌شده' : 'نشان‌کردن'}
    </button>
  );
}