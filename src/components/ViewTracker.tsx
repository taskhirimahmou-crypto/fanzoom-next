'use client';

import { useEffect } from 'react';

export function ViewTracker({ articleId }: { articleId: string }) {
  useEffect(() => {
    const storageKey = `viewed:${articleId}`;
    
    // چک می‌کنیم آیا این مقاله قبلاً در این session بازدید شده
    if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) {
      return;
    }

    // ثبت در sessionStorage برای جلوگیری از شمارش مجدد با refresh
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(storageKey, 'true');
    }

    // ارسال درخواست به API برای افزایش ویو
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: articleId }),
    }).catch(() => {}); // silent error - نباید تجربه کاربر را مختل کند
  }, [articleId]);

  return null;
}
