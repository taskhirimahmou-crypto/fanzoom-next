'use client';

import { useEffect, useRef } from 'react';
import { clientPersonalizationAllowsEvents } from '@/lib/recommender/client-events';
import { sendServedBatchWithRetry } from '@/lib/recommender/served-client';
import { BASELINE_RECOMMENDATION_ALGORITHM_VERSION } from '@/lib/recommendations/baseline';

export function RecommendationServedReporter({
  feedId,
  surface,
  algorithmVersion,
  offset,
  articleIds,
  enabled,
}: {
  feedId: string;
  surface: 'home' | 'for_you';
  algorithmVersion: typeof BASELINE_RECOMMENDATION_ALGORITHM_VERSION;
  offset: number;
  articleIds: string[];
  enabled: boolean;
}) {
  const requested = useRef(false);
  const articleKey = articleIds.join(',');

  useEffect(() => {
    if (requested.current || articleIds.length < 1 || !clientPersonalizationAllowsEvents(enabled)) return;
    requested.current = true;
    void sendServedBatchWithRetry({
      feedId,
      surface,
      algorithmVersion,
      offset,
      articleIds,
    }).then((succeeded) => {
      if (!succeeded) requested.current = false;
    });
  }, [algorithmVersion, articleIds, articleKey, enabled, feedId, offset, surface]);

  return null;
}
