import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { Icon } from '@/components/Icon';
import { InterestsPicker } from '@/components/InterestsPicker';
import { LogoutButton } from '@/components/LogoutButton';
import { findCategoryBySlug } from '@/lib/categories';

export const metadata: Metadata = { title: 'پروفایل من' };

const toneStyle = (tone: string) =>
  ({ '--c': `var(--cat-${tone})` }) as CSSProperties;

export default async function ProfilePage() {
  const pb = await getServerPocketBase();
  const record = pb.authStore.record as {
    id: string;
    email: string;
    displayName?: string;
    bio?: string;
    interests?: string[];
    created: string;
  } | null;

  // اگر لاگین نیست، به صفحه‌ی ورود برو
  if (!record) redirect('/login');

  const initial = (record.displayName || record.email || 'ک')[0];
  const memberSince = new Date(record.created).toLocaleDateString('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="relative">
      {/* سربرگ پروفایل */}
      <header className="relative overflow-hidden border-b border-outline-variant/60">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary-container/30 to-transparent"
        />
        <Icon
          name="person"
          aria-hidden
          className="pointer-events-none absolute -left-10 top-1/2 -translate-y-1/2 select-none text-[220px] text-on-surface/5"
        />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-5 px-4 py-14 text-center md:px-6">
          <span className="grid h-24 w-24 place-items-center rounded-full bg-primary text-4xl font-black text-on-primary shadow-3">
            {initial}
          </span>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-on-surface md:text-4xl">
              {record.displayName || 'کاربر فن زوم'}
            </h1>
            <p className="mt-2 text-on-surface-variant">{record.email}</p>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-outline-variant/70 bg-surface-container px-4 py-1.5 text-sm text-on-surface-variant">
            <Icon name="calendar_month" className="text-lg" />
            عضویت از {memberSince}
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        {/* درباره‌ی من */}
        <div className="rounded-2xl border border-outline-variant/60 bg-surface-container-low p-6 shadow-1">
          <h2 className="flex items-center gap-2.5 text-lg font-black text-on-surface">
            <Icon name="edit_note" className="text-2xl text-primary" />
            درباره‌ی من
          </h2>
          <p className="mt-4 leading-8 text-on-surface-variant">
            {record.bio || 'هنوز چیزی درباره‌ی خودت ننوشته‌ای.'}
          </p>
        </div>

        {/* علایق */}
    {/* علاقه‌مندی‌ها — Interactive Picker */}
<div className="mt-6">
  <InterestsPicker initialInterests={record.interests ?? []} />
</div>

        {/* حساب */}
        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-6 shadow-1 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2.5 text-lg font-black text-on-surface">
              <Icon name="manage_accounts" className="text-2xl text-primary" />
              حساب کاربری
            </h2>
            <p className="mt-2 text-sm leading-7 text-on-surface-variant">
              با خروج، از این دستگاه خارج می‌شوی.
            </p>
          </div>
          <LogoutButton />
        </div>
      </section>
    </main>
  );
}