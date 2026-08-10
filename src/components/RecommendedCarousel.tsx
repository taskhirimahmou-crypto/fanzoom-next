'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SecondaryCard } from '@/components/SecondaryCard';
import { Icon } from '@/components/Icon';
import type { Article } from '@/lib/articles-server';

export function RecommendedCarousel({ articles }: { articles: Article[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const x = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(x > 8);
    setCanNext(x < max - 8);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, articles]);

  const scroll = (dir: 'prev' | 'next') => {
    const el = trackRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    // در RTL: «بعدی» یعنی اسکرول به چپ
    el.scrollBy({ left: dir === 'next' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="relative mt-6">
      <div ref={trackRef} className="no-scrollbar overflow-x-auto">
        <div className="flex snap-x snap-mandatory gap-5 pb-2">
          {articles.map((article) => (
            <div
              key={article.id}
              className="w-[78vw] shrink-0 snap-start sm:w-[300px] md:w-[calc(25%-15px)]"
            >
              <SecondaryCard article={article} />
            </div>
          ))}
        </div>
      </div>

      {/* فلش قبلی (سمت راست) */}
      <button
        type="button"
        onClick={() => scroll('prev')}
        disabled={!canPrev}
        aria-label="اسلاید قبلی"
        className="absolute -right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-outline-variant/60 bg-surface-container-high shadow-2 transition-all hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-0"
      >
        <Icon name="arrow_back" mirror className="text-xl" />
      </button>

      {/* فلش بعدی (سمت چپ) */}
      <button
        type="button"
        onClick={() => scroll('next')}
        disabled={!canNext}
        aria-label="اسلاید بعدی"
        className="absolute -left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-outline-variant/60 bg-surface-container-high shadow-2 transition-all hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-0"
      >
        <Icon name="arrow_back" className="text-xl" />
      </button>
    </div>
  );
}