'use client';

import { useEffect } from 'react';

export function ViewTracker({ articleId }: { articleId: string }) {
  useEffect(() => {
    if (!articleId) return;

    const storageKey = `viewed:${articleId}`;
    
    if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) {
      return;
    }

    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: articleId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && typeof window !== 'undefined') sessionStorage.setItem(storageKey, 'true');
        return data;
      })
      .catch(() => {});
  }, [articleId]);

  return null;
}
