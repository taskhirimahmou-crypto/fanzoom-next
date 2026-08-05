'use client';

import { useEffect } from 'react';

export function ViewTracker({ articleId }: { articleId: string }) {
  useEffect(() => {
    if (!articleId) {
      console.log('🔵 [ViewTracker] No articleId provided');
      return;
    }

    const storageKey = `viewed:${articleId}`;
    
    if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) {
      console.log('🔵 [ViewTracker] Already viewed in this session:', articleId);
      return;
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(storageKey, 'true');
    }

    console.log('🔵 [ViewTracker] Sending view request for:', articleId);

    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: articleId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          console.log('✅ [ViewTracker] Success:', data);
        } else {
          console.error('🔴 [ViewTracker] API error:', data);
        }
      })
      .catch((err) => {
        console.error('🔴 [ViewTracker] Network error:', err);
      });
  }, [articleId]);

  return null;
}
