'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/Icon';

type Mode = 'login' | 'register';

function Field({
  label,
  icon,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  icon: IconName;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-on-surface">{label}</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-outline bg-surface px-4 transition-all duration-200 ease-standard focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]">
        <Icon name={icon} className="text-xl text-on-surface-variant" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full bg-transparent py-3.5 text-on-surface outline-none placeholder:text-on-surface-variant/50"
        />
      </div>
    </label>
  );
}

function Benefit({ icon, title, desc }: { icon: IconName; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-on-primary-container/10 text-on-primary-container">
        <Icon name={icon} className="text-2xl" />
      </span>
      <div>
        <h3 className="font-bold text-on-primary-container">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-on-primary-container/70">{desc}</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطایی رخ داد');
      // reload کامل صفحه تا layout دوباره رندر شود و کاربر را از کوکی بخواند
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      {/* ── فرم ── */}
      <div className="flex items-center justify-center px-4 py-12 md:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-on-primary shadow-1">
              <Icon name="bolt" fill className="text-2xl" />
            </span>
            <span className="text-xl font-black text-on-surface">فنزوم</span>
          </Link>

          <h1 className="text-3xl font-black tracking-tight text-on-surface md:text-4xl">
            {mode === 'login' ? 'خوش آمدید' : 'حساب بسازید'}
          </h1>
          <p className="mt-3 leading-7 text-on-surface-variant">
            {mode === 'login'
              ? 'برای ادامه وارد حساب فنزوم خود شوید.'
              : 'در چند ثانیه به فنزوم بپیوندید.'}
          </p>

          {/* تب ورود / ثبت‌نام */}
          <div className="mt-8 flex rounded-full bg-surface-container-high p-1">
            {(['login', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError('');
                }}
                className={`flex-1 rounded-full py-2.5 text-sm font-bold transition-all duration-300 ease-standard ${
                  mode === m
                    ? 'bg-primary text-on-primary shadow-1'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {m === 'login' ? 'ورود' : 'ثبت‌نام'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-8 space-y-5">
            {mode === 'register' && (
              <Field
                label="نام نمایشی"
                icon="person"
                value={displayName}
                onChange={setDisplayName}
                placeholder="مثلاً: علی رضایی"
              />
            )}
            <Field
              label="ایمیل"
              icon="mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
            />
            <Field
              label="رمز عبور"
              icon="lock"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="حداقل ۸ کاراکتر"
              required
            />
            {error && (
              <div className="rounded-xl bg-error/10 px-4 py-3">
                <div className="flex items-center gap-2.5 text-sm font-medium text-error">
                  <Icon name="error" className="shrink-0 text-lg" />
                  {error}
                </div>
                {error.includes('قبلاً ثبت شده') && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-error px-4 py-1.5 text-xs font-bold text-on-error transition-all duration-200 ease-standard hover:brightness-110 active:scale-95"
                  >
                    <Icon name="login" className="text-sm" />
                    رفتن به تب ورود
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-bold text-on-primary shadow-1 transition-all duration-300 ease-standard hover:shadow-2 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <Icon name="progress_activity" className="animate-spin text-lg" />
              ) : (
                <Icon name={mode === 'login' ? 'login' : 'person_add'} className="text-lg" />
              )}
              {loading ? 'لطفاً صبر کنید...' : mode === 'login' ? 'ورود' : 'ثبت‌نام'}
            </button>
          </form>
        </div>
      </div>

      {/* ── پنل برند (دسکتاپ) ── */}
      <div className="relative hidden overflow-hidden bg-primary-container lg:block">
        <Icon
          name="bolt"
          aria-hidden
          className="pointer-events-none absolute -left-16 -top-16 select-none text-[340px] text-on-primary-container/10"
        />
        <div className="relative flex h-full flex-col justify-center px-16">
          <h2 className="text-4xl font-black leading-[1.4] text-on-primary-container">
            به جامعه‌ی فناوری فارسی بپیوندید
          </h2>
          <div className="mt-10 space-y-7">
            <Benefit
              icon="bookmark"
              title="نشان‌کردن مقالات"
              desc="مقالات مورد علاقه‌ات را ذخیره کن و هر وقت خواستی بخوان."
            />
            <Benefit
              icon="comment"
              title="گفتگو با دیگران"
              desc="نظرت را درباره‌ی جدیدترین اخبار فناوری بگو."
            />
            <Benefit
              icon="tune"
              title="تجربه‌ی شخصی‌سازی‌شده"
              desc="دسته‌بندی‌های مورد علاقه‌ات را دنبال کن."
            />
          </div>
        </div>
      </div>
    </main>
  );
}