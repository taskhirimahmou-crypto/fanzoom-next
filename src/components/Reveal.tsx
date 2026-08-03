'use client';

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** تأخیر به میلی‌ثانیه برای stagger بین کارت‌ها */
  delay?: number;
  /** آستانه‌ی مشاهده (پیش‌فرض 0.12) */
  threshold?: number;
}

const revealStyle: CSSProperties = {
  willChange: 'opacity, transform',
  contain: 'layout style paint',
};

export function Reveal({ children, className, delay = 0, threshold = 0.12 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin: '0px 0px -48px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={`${className ?? ''} transition-all duration-700 ease-decelerate ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
      style={{ ...revealStyle, transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}