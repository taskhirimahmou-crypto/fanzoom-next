'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import type { RecommendationAttribution } from '@/lib/recommender/attribution';
import { sendRecommendationEvent } from '@/lib/recommender/client-events';

export function ShareButton({
  articleId,
  title,
  signedIn,
  personalizationEnabled,
  attribution,
}: {
  articleId: string;
  title: string;
  signedIn: boolean;
  personalizationEnabled: boolean;
  attribution?: RecommendationAttribution;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (signedIn && personalizationEnabled) {
        void sendRecommendationEvent(
          {
            idempotencyKey: `share:${crypto.randomUUID()}`,
            articleId,
            eventType: 'share',
            surface: attribution?.surface ?? 'article',
            ...attribution,
            occurredAt: new Date().toISOString(),
          },
          personalizationEnabled,
        );
      }
    } catch {
      // Cancellation or a failed clipboard operation is not a successful share.
    }
  };

  return (
    <button
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary shadow-1 transition-all duration-300 ease-standard hover:shadow-2 hover:brightness-110 active:scale-95"
    >
      <Icon name={copied ? 'check' : 'share'} className="text-base" />
      {copied ? 'کپی شد!' : 'اشتراک‌گذاری'}
    </button>
  );
}
