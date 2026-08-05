'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { relativeTime } from '@/lib/articles';

export type CommentView = {
  id: string;
  body: string;
  created: string;
  authorName: string;
  authorInitial: string;
};

const toPersianDigits = (n: number) =>
  n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

// نمایش امن زمان: اگر تاریخ معتبر نبود، null برمی‌گرداند (تا span کلاً رندر نشود)
const when = (iso: string): string | null => {
  if (!iso) return null;
  const fixed = iso.includes('T') ? iso : iso.replace(' ', 'T');
  const d = new Date(fixed);
  if (isNaN(d.getTime())) {
    const onlyDate = new Date(fixed.slice(0, 10));
    return isNaN(onlyDate.getTime()) ? null : onlyDate.toLocaleDateString('fa-IR');
  }
  return relativeTime(fixed);
};

export function CommentsSection({
  articleId,
  signedIn,
  comments,
}: {
  articleId: string;
  signedIn: boolean;
  comments: CommentView[];
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, body: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطایی رخ داد');
      setText('');
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mx-auto mt-12 max-w-3xl px-4 md:px-6">
      <h2 className="flex items-center gap-3 text-xl font-black text-on-surface md:text-2xl">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-container text-on-primary-container">
          <Icon name="comment" className="text-xl" />
        </span>
        نظرات
        <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-sm font-bold text-on-surface-variant">
          {toPersianDigits(comments.length)}
        </span>
      </h2>

      {/* فرم ارسال */}
      <div className="mt-6">
        {signedIn ? (
          <form onSubmit={submit}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="نظر خود را بنویسید..."
              className="w-full resize-none rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm leading-7 text-on-surface outline-none transition-all duration-200 ease-standard placeholder:text-on-surface-variant/60 focus:border-primary focus:bg-surface-container focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[11px] text-on-surface-variant">
                {toPersianDigits(text.length)} / ۱۰۰۰
              </span>
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-1 transition-all duration-300 ease-standard hover:shadow-2 hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {sending ? (
                  <Icon name="progress_activity" className="animate-spin text-lg" />
                ) : (
                  <Icon name="send" className="text-lg" />
                )}
                ارسال نظر
              </button>
            </div>
            {error && (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-error">
                <Icon name="error" className="text-lg" />
                {error}
              </p>
            )}
            {submitted && (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
                <Icon name="check_circle" className="text-lg" />
                نظر شما ثبت شد و پس از بررسی نمایش داده می‌شود.
              </p>
            )}
          </form>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-6 text-center">
            <p className="text-sm font-medium text-on-surface-variant">
              برای نوشتن نظر، وارد حساب خود شوید.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-1 transition-all duration-300 ease-standard hover:shadow-2 hover:brightness-110 active:scale-95"
            >
              <Icon name="login" className="text-lg" />
              ورود / ثبت‌نام
            </Link>
          </div>
        )}
      </div>

      {/* فهرست نظرات */}
      <div className="mt-8 flex flex-col gap-4">
        {comments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-outline-variant/70 bg-surface-container-low/50 px-4 py-10 text-center text-sm text-on-surface-variant">
            هنوز نظری ثبت نشده — اولین نفری باش که نظر می‌دهد.
          </p>
        ) : (
          comments.map((c) => {
            const time = when(c.created);
            return (
              <div
                key={c.id}
                className="flex gap-3 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-4 shadow-1 transition-all duration-300 ease-standard hover:-translate-y-0.5 hover:shadow-2"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary-container text-sm font-black text-on-secondary-container">
                  {c.authorInitial}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-on-surface">{c.authorName}</span>
                    {time && (
                      <>
                        <span aria-hidden className="h-1 w-1 rounded-full bg-on-surface-variant/50" />
                        <span className="text-[11px] text-on-surface-variant">{time}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-7 text-on-surface-variant">
                    {c.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}