'use client';

import { useState, type CSSProperties } from 'react';
import { allCategories } from '@/lib/categories';
import { Icon } from '@/components/Icon';

const toneStyle = (tone: string) =>
  ({ '--c': `var(--cat-${tone})` }) as CSSProperties;

interface Props {
  initialInterests: string[];
}

export function InterestsPicker({ initialInterests }: Props) {
  const [selected, setSelected] = useState<string[]>(initialInterests);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const toggle = (slug: string) => {
    setSaved(false);
    setError(false);
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch('/api/profile/interests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: selected }),
      });
      if (!res.ok) throw new Error('save failed');
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-outline-variant/60 bg-surface-container-low p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-container text-on-primary-container">
          <Icon name="insights" className="text-xl" />
        </span>
        <div>
          <h3 className="text-lg font-black text-on-surface">علاقه‌مندی‌های شما</h3>
          <p className="text-xs text-on-surface-variant">
            دسته‌بندی‌های مورد علاقه‌ات را انتخاب کن تا مقالات پیشنهادی شخصی‌سازی شود
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        {allCategories.map((cat) => {
          const active = selected.includes(cat.slug);
          return (
            <button
              key={cat.slug}
              type="button"
              onClick={() => toggle(cat.slug)}
              style={toneStyle(cat.tone)}
              className={`cat-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all duration-300 ease-standard active:scale-95 ${
                active
                  ? 'shadow-1 ring-2 ring-[var(--c)]'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <Icon name={cat.symbol} className="text-lg" />
              {cat.name}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-on-primary shadow-1 transition-all hover:shadow-2 hover:brightness-110 active:scale-95 disabled:opacity-50"
        >
          {saving ? 'در حال ذخیره...' : 'ذخیره علاقه‌مندی‌ها'}
        </button>
        {saved && (
          <span className="text-sm font-bold text-[var(--cat-green)]">
            ✅ ذخیره شد — صفحه اصلی را رفرش کن
          </span>
        )}
        {error && (
          <span className="text-sm font-bold text-error">
            خطا در ذخیره — دوباره تلاش کن
          </span>
        )}
      </div>
    </div>
  );
}