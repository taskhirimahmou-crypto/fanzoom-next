'use client';

import { useEffect, useRef } from 'react';

export function ReadingTracker({
  articleId,
  signedIn,
}: {
  articleId: string;
  signedIn: boolean;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (!signedIn || !articleId || fired.current) return;
    fired.current = true; // جلوگیری از ثبت تکراری (StrictMode / remount)
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId }),
    }).catch(() => {}); // بی‌صدا — تاریخچه نباید تجربه‌ی خواندن را مختل کند
  }, [articleId, signedIn]);

  return null;
}