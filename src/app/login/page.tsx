'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/Icon';
import Image from 'next/image';
import { GoogleLoginButton } from '@/components/GoogleLoginButton';

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
            <Image
              src="/logo.webp"
              alt="فن زوم"
              width={40}
              height={40}
              priority
              className="h-10 w-10 rounded-xl object-cover shadow-1"
            />
            <span className="text-xl font-black text-on-surface">فن زوم</span>
          </Link>

          <h1 className="text-3xl font-black tracking-tight text-on-surface md:text-4xl">
            {mode === 'login' ? 'خوش آمدید' : 'حساب بسازید'}
          </h1>
          <p className="mt-3 leading-7 text-on-surface-variant">
            {mode === 'login'
              ? 'برای ادامه وارد حساب فن زوم خود شوید.'
              : 'در چند ثانیه به فن زوم بپیوندید.'}
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

<div className="mt-6 flex items-center gap-3">
  <span className="h-px flex-1 bg-outline-variant/60" />
  <span className="text-xs text-on-surface-variant">یا</span>
  <span className="h-px flex-1 bg-outline-variant/60" />
</div>
{/* Divider */}
<div className="relative my-6">
  <div className="absolute inset-0 flex items-center">
    <div className="w-full border-t border-outline-variant/60"></div>
  </div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-surface px-2 text-on-surface-variant">یا</span>
  </div>
</div>

{/* Google OAuth Button */}
<Link
  href="/api/auth/google"
  className="flex w-full items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-sm font-bold text-on-surface transition-all hover:bg-surface-container-high hover:shadow-1 active:scale-[0.98]"
>
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
  <span>ورود با گوگل</span>
</Link>


{/* فرم لاگین معمولی خودت اینجا ادامه می‌یابد */}
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