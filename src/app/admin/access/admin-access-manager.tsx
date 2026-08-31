'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import type {
  AdminAccessListResult,
  AdminAccessMemberDto,
  AdminAccessUserDto,
  ManageableAdminRole,
} from '@/lib/admin/management';

type AccessResponse = AdminAccessListResult & { csrfToken: string };
type Mutation = {
  targetRef: string;
  role: ManageableAdminRole;
  enabled: boolean;
  label: string;
  revoke: boolean;
};

const dateTime = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

function roleLabel(role: 'owner' | ManageableAdminRole) {
  return role === 'owner' ? 'مالک' : role === 'admin' ? 'مدیر' : 'مشاهده‌گر';
}

function Status({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? 'bg-primary-container text-on-primary-container' : 'bg-error/10 text-error'}`}>
      <Icon name={enabled ? 'check_circle' : 'lock'} className="text-base" />
      {enabled ? 'فعال' : 'غیرفعال'}
    </span>
  );
}

function Identity({ email, displayName }: { email: string; displayName: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-bold">{displayName || 'بدون نام نمایشی'}</p>
      <p className="mt-1 truncate font-mono text-xs text-on-surface-variant" dir="ltr">{email}</p>
    </div>
  );
}

export function AdminAccessManager() {
  const [data, setData] = useState<AccessResponse | null>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [adminPage, setAdminPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState<Mutation | null>(null);
  const [mutating, setMutating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(searchPage),
          perPage: '10',
          adminPage: String(adminPage),
        });
        if (submittedQuery) params.set('q', submittedQuery);
        const response = await fetch(`/api/admin/access?${params.toString()}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.assign('/login?redirect=/admin/access');
          return;
        }
        if (!response.ok) throw new Error(`access_${response.status}`);
        setData(await response.json() as AccessResponse);
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === 'AbortError')) {
          setError('دریافت اطلاعات دسترسی ناموفق بود. دوباره تلاش کنید.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [adminPage, reloadKey, searchPage, submittedQuery]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const next = query.trim();
    if (next && next.length < 3) {
      setError('برای جست‌وجو حداقل سه حرف وارد کنید.');
      return;
    }
    setError('');
    setSuccess('');
    setSearchPage(1);
    setSubmittedQuery(next);
  };

  const performMutation = async () => {
    if (!pending || !data?.csrfToken) return;
    setMutating(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/access', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Fanzoom-CSRF': data.csrfToken,
        },
        body: JSON.stringify({
          targetRef: pending.targetRef,
          role: pending.role,
          enabled: pending.enabled,
        }),
      });
      const body = await response.json().catch(() => null) as { errorCode?: string } | null;
      if (!response.ok) {
        if (body?.errorCode === 'no_change') throw new Error('این دسترسی از قبل همین وضعیت را دارد.');
        if (body?.errorCode?.includes('owner') || body?.errorCode === 'self_lockout_forbidden') {
          throw new Error('نقش owner فقط از مسیر recovery/transfer امن قابل تغییر است.');
        }
        throw new Error('ثبت تغییر ناموفق بود.');
      }
      setSuccess(pending.revoke ? 'دسترسی با موفقیت لغو شد.' : 'تغییر دسترسی با موفقیت ثبت شد.');
      setPending(null);
      setReloadKey((value) => value + 1);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'ثبت تغییر ناموفق بود.');
    } finally {
      setMutating(false);
    }
  };

  const requestMutation = (item: AdminAccessMemberDto, role: ManageableAdminRole, enabled: boolean) => {
    setPending({
      targetRef: item.targetRef,
      role,
      enabled,
      label: item.displayName || item.email,
      revoke: !enabled,
    });
  };

  const grant = (user: AdminAccessUserDto, role: ManageableAdminRole) => {
    setPending({
      targetRef: user.targetRef,
      role,
      enabled: true,
      label: user.displayName || user.email,
      revoke: false,
    });
  };

  return (
    <main className="pcb-bg min-h-screen pb-16" dir="rtl">
      <div className="mx-auto max-w-6xl px-4 py-7 md:px-8 md:py-10">
        <header className="cyber-card rounded-3xl bg-surface-container p-5 shadow-2 md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="inline-flex rounded-full bg-primary-container px-3 py-1 text-xs font-bold text-on-primary-container">فقط owner</span>
              <h1 className="mt-4 text-2xl font-black md:text-3xl">مدیریت دسترسی پنل</h1>
              <p className="mt-2 max-w-2xl leading-7 text-on-surface-variant">اعطای viewer/admin، تغییر نقش و لغو دسترسی؛ ownerها در این صفحه قابل تغییر نیستند.</p>
            </div>
            <Link href="/admin/observability" className="inline-flex items-center justify-center gap-2 rounded-full border border-outline px-4 py-2.5 font-bold hover:bg-surface-low">
              <Icon name="monitoring" className="text-lg" />داشبورد پایش
            </Link>
          </div>
        </header>

        {(error || success) && (
          <div role={error ? 'alert' : 'status'} className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${error ? 'border-error/40 bg-error/10 text-error' : 'border-primary/40 bg-primary-container text-on-primary-container'}`}>
            {error || success}
          </div>
        )}

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <div className="cyber-card rounded-3xl bg-surface-container p-5 shadow-1 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-xl font-black">مدیران فعلی</h2><p className="mt-1 text-sm text-on-surface-variant">ایمیل فقط در این صفحه‌ی owner نمایش داده می‌شود.</p></div>
              <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="grid h-10 w-10 place-items-center rounded-full border border-outline-variant" aria-label="تازه‌سازی"><Icon name="refresh" /></button>
            </div>
            <div className="mt-5 space-y-3">
              {loading && !data ? <p className="rounded-2xl bg-surface-low p-8 text-center">در حال بارگذاری…</p> : null}
              {data?.admins.length === 0 ? <p className="rounded-2xl bg-surface-low p-8 text-center text-on-surface-variant">مدیری در این صفحه وجود ندارد.</p> : null}
              {data?.admins.map((admin) => (
                <article key={admin.targetRef} className="rounded-2xl border border-outline-variant bg-surface-low p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Identity email={admin.email} displayName={admin.displayName} />
                    <div className="flex flex-wrap items-center gap-2"><Status enabled={admin.enabled} /><span className="rounded-full border border-outline px-2.5 py-1 text-xs font-bold">{roleLabel(admin.role)}</span></div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-outline-variant/60 pt-4">
                    {admin.mutable ? (
                      <>
                        <label className="text-xs font-bold">نقش
                          <select
                            value={admin.role}
                            onChange={(event) => requestMutation(admin, event.target.value as ManageableAdminRole, admin.enabled)}
                            className="cyber-input mt-1 block rounded-xl px-3 py-2 text-sm"
                          >
                            <option value="viewer">viewer</option><option value="admin">admin</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => requestMutation(admin, admin.role as ManageableAdminRole, !admin.enabled)}
                          className={`rounded-full px-4 py-2 text-sm font-bold ${admin.enabled ? 'border border-error/50 text-error' : 'bg-primary text-on-primary'}`}
                        >{admin.enabled ? 'لغو دسترسی' : 'فعال‌کردن'}</button>
                      </>
                    ) : <p className="text-sm text-on-surface-variant">تغییر owner نیازمند flow جداگانه‌ی recovery/transfer است.</p>}
                    <p className="mr-auto text-[11px] text-on-surface-variant">آخرین تغییر: {admin.updated ? dateTime.format(new Date(admin.updated)) : 'نامشخص'}</p>
                  </div>
                </article>
              ))}
            </div>
            {data && data.adminPagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <button type="button" disabled={adminPage <= 1} onClick={() => setAdminPage((page) => page - 1)} className="rounded-full border px-3 py-1.5 disabled:opacity-40">قبلی</button>
                <span>صفحه {adminPage} از {data.adminPagination.totalPages}</span>
                <button type="button" disabled={adminPage >= data.adminPagination.totalPages} onClick={() => setAdminPage((page) => page + 1)} className="rounded-full border px-3 py-1.5 disabled:opacity-40">بعدی</button>
              </div>
            )}
          </div>

          <div className="cyber-card rounded-3xl bg-surface-container p-5 shadow-1 md:p-6">
            <h2 className="text-xl font-black">یافتن کاربر</h2>
            <form onSubmit={submitSearch} className="mt-4 flex gap-2">
              <label className="sr-only" htmlFor="admin-user-search">ایمیل یا نام کاربر</label>
              <input id="admin-user-search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={3} maxLength={100} placeholder="حداقل ۳ حرف از ایمیل یا نام" className="cyber-input min-w-0 flex-1 rounded-xl px-3 py-2.5" />
              <button type="submit" className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-on-primary" aria-label="جست‌وجو"><Icon name="search" /></button>
            </form>
            <div className="mt-5 space-y-3">
              {!submittedQuery ? <p className="rounded-2xl bg-surface-low p-6 text-center text-sm text-on-surface-variant">برای اعطای دسترسی، کاربر را با ایمیل یا نام پیدا کنید.</p> : null}
              {submittedQuery && !loading && data?.users.length === 0 ? <p className="rounded-2xl bg-surface-low p-6 text-center text-sm text-on-surface-variant">کاربری پیدا نشد.</p> : null}
              {data?.users.map((user) => (
                <article key={user.targetRef} className="rounded-2xl border border-outline-variant p-4">
                  <Identity email={user.email} displayName={user.displayName} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {user.access?.role === 'owner' ? <span className="text-sm text-on-surface-variant">owner از این فرم قابل تغییر نیست.</span> : (
                      <>
                        <button type="button" onClick={() => grant(user, 'viewer')} className="rounded-full border border-outline px-3 py-1.5 text-sm font-bold">اعطای viewer</button>
                        <button type="button" onClick={() => grant(user, 'admin')} className="rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-on-primary">اعطای admin</button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {data?.searchPagination && data.searchPagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <button type="button" disabled={searchPage <= 1} onClick={() => setSearchPage((page) => page - 1)} className="rounded-full border px-3 py-1.5 disabled:opacity-40">قبلی</button>
                <span>صفحه {searchPage} از {data.searchPagination.totalPages}</span>
                <button type="button" disabled={searchPage >= data.searchPagination.totalPages} onClick={() => setSearchPage((page) => page + 1)} className="rounded-full border px-3 py-1.5 disabled:opacity-40">بعدی</button>
              </div>
            )}
          </div>
        </section>
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="access-confirm-title" className="w-full max-w-md rounded-3xl bg-surface p-6 text-on-surface shadow-5">
            <h2 id="access-confirm-title" className="text-xl font-black">{pending.revoke ? 'تأیید لغو دسترسی' : 'تأیید تغییر دسترسی'}</h2>
            <p className="mt-3 leading-7 text-on-surface-variant">{pending.revoke ? `دسترسی «${pending.label}» غیرفعال شود؟` : `نقش ${pending.role} برای «${pending.label}» ثبت شود؟`}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={mutating} onClick={() => setPending(null)} className="rounded-full border border-outline px-4 py-2 font-bold">انصراف</button>
              <button type="button" disabled={mutating} onClick={() => void performMutation()} className={`rounded-full px-4 py-2 font-bold ${pending.revoke ? 'bg-error text-on-error' : 'bg-primary text-on-primary'}`}>{mutating ? 'در حال ثبت…' : 'تأیید'}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
