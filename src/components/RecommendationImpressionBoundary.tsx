'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { RecommendationAttribution } from '@/lib/recommender/attribution';
import { sendRecommendationEventOnce } from '@/lib/recommender/client-events';
import { ImpressionVisibilityController } from '@/lib/recommender/impression';

export function RecommendationImpressionBoundary({
  articleId,
  attribution,
  enabled,
  children,
}: {
  articleId: string;
  attribution: RecommendationAttribution;
  enabled: boolean;
  children: ReactNode;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const { feedId, rank, surface, algorithmVersion } = attribution;

  useEffect(() => {
    if (!enabled || !targetRef.current) return;
    const dedupeKey = `${feedId}:${articleId}`;
    const controller = new ImpressionVisibilityController(() => {
      void sendRecommendationEventOnce(
        dedupeKey,
        {
          idempotencyKey: `impression:${feedId}:${articleId}`,
          articleId,
          eventType: 'impression',
          feedId,
          rank,
          surface,
          algorithmVersion,
          occurredAt: new Date().toISOString(),
        },
        enabled,
      );
    });
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        controller.update(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.5));
      },
      { threshold: [0.5] },
    );
    observer.observe(targetRef.current);
    return () => {
      observer.disconnect();
      controller.dispose();
    };
  }, [algorithmVersion, articleId, enabled, feedId, rank, surface]);

  return <div ref={targetRef} className="h-full">{children}</div>;
}
