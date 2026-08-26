'use client';

import { useState } from 'react';
import { setClientPersonalizationPreference } from '@/lib/recommender/client-events';

export function PersonalizationToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const update = async () => {
    const next = !enabled;
    setSaving(true);
    setError(false);
    try {
      const response = await fetch('/api/profile/personalization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) throw new Error('preference update failed');
      setEnabled(next);
      setClientPersonalizationPreference(next);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-6 shadow-1">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-black text-on-surface">بهبود شخصی پیشنهادها</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-on-surface-variant">
            با فعال‌سازی این گزینه، تعامل شما با پیشنهادها و کیفیت مطالعه برای بهبود پیشنهادهای آینده ثبت می‌شود.
            این ثبت فقط هنگام ورود به حساب انجام می‌شود و هر زمان بخواهید قابل خاموش‌کردن است.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={update}
          className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50"
        >
          {saving ? 'در حال ذخیره…' : enabled ? 'فعال است' : 'غیرفعال است'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-error">ذخیره تنظیم انجام نشد؛ دوباره تلاش کنید.</p>}
    </div>
  );
}
