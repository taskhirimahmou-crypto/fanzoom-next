'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard در دسترس نیست */
    }
  };

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary shadow-1 transition-all duration-300 ease-standard hover:shadow-2 hover:brightness-110 active:scale-95"
    >
      <Icon name={copied ? 'check' : 'share'} className="text-base" />
      {copied ? 'کپی شد!' : 'اشتراک‌گذاری'}
    </button>
  );
}