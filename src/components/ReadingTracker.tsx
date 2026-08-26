'use client';

import { useEffect, useRef } from 'react';
import type { RecommendationAttribution } from '@/lib/recommender/attribution';
import { sendRecommendationEvent } from '@/lib/recommender/client-events';
import { estimateReadSeconds, ReadingEngagementController } from '@/lib/reading/engagement';

export function ReadingTracker({
  articleId,
  signedIn,
  personalizationEnabled,
  articleElementId,
  attribution,
}: {
  articleId: string;
  signedIn: boolean;
  personalizationEnabled: boolean;
  articleElementId: string;
  attribution?: RecommendationAttribution;
}) {
  const historyFired = useRef(false);
  const readingSessionId = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn || !articleId || historyFired.current) return;
    historyFired.current = true;
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, attribution }),
    }).catch(() => {});
  }, [articleId, attribution, signedIn]);

  useEffect(() => {
    if (!signedIn || !personalizationEnabled || !articleId) return;
    const articleElement = document.getElementById(articleElementId);
    if (!articleElement) return;
    readingSessionId.current ??= crypto.randomUUID();
    const sessionId = readingSessionId.current;
    const eventContext = attribution ?? {};
    const eventSurface = attribution?.surface ?? 'article';
    const controller = new ReadingEngagementController({
      expectedReadSeconds: estimateReadSeconds(articleElement.textContent ?? ''),
      onMilestone: (milestone, snapshot) => {
        void sendRecommendationEvent(
          {
            idempotencyKey: `progress:${sessionId}:${articleId}:${milestone}`,
            articleId,
            eventType: 'progress_milestone',
            surface: eventSurface,
            ...eventContext,
            occurredAt: new Date().toISOString(),
            engagedSeconds: snapshot.activeSeconds,
            maxProgress: milestone,
          },
          personalizationEnabled,
        );
      },
      onEngaged: (snapshot) => {
        void sendRecommendationEvent(
          {
            idempotencyKey: `engaged:${sessionId}:${articleId}`,
            articleId,
            eventType: 'engaged',
            surface: eventSurface,
            ...eventContext,
            occurredAt: new Date().toISOString(),
            engagedSeconds: snapshot.activeSeconds,
            maxProgress: snapshot.maxProgress,
          },
          personalizationEnabled,
        );
      },
    });

    const syncPageState = () => {
      controller.setConditions({
        documentVisible: document.visibilityState === 'visible',
        windowFocused: document.hasFocus(),
      });
    };
    const onFocus = () => controller.setConditions({ windowFocused: true });
    const onBlur = () => controller.setConditions({ windowFocused: false });
    syncPageState();

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        controller.setConditions({ articleVisible: Boolean(entry?.isIntersecting) });
      },
      { threshold: [0] },
    );
    observer.observe(articleElement);

    let animationFrame: number | undefined;
    const updateProgress = () => {
      animationFrame = undefined;
      const rect = articleElement.getBoundingClientRect();
      const articleTop = rect.top + window.scrollY;
      const articleHeight = Math.max(1, articleElement.scrollHeight);
      const viewportBottom = window.scrollY + window.innerHeight;
      controller.updateProgress(((viewportBottom - articleTop) / articleHeight) * 100);
    };
    const onScroll = () => {
      if (animationFrame === undefined) animationFrame = window.requestAnimationFrame(updateProgress);
    };
    updateProgress();

    document.addEventListener('visibilitychange', syncPageState);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const timer = window.setInterval(() => controller.tick(1_000), 1_000);

    return () => {
      controller.dispose();
      observer.disconnect();
      window.clearInterval(timer);
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('visibilitychange', syncPageState);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [articleElementId, articleId, attribution, personalizationEnabled, signedIn]);

  return null;
}
