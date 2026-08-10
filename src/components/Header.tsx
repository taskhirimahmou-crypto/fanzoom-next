'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/components/ThemeProvider';
import { mainNavCategories, moreNavCategories } from '@/lib/categories';
import { UserMenu, type CurrentUser } from '@/components/UserMenu';


export function Header({ user }: { user: CurrentUser | null }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // بستن منوی «بیشتر» با کلیک بیرون
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [moreOpen]);

  // قفل scroll وقتی drawer باز است
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // focus روی input هنگام باز شدن جستجو
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // بستن با Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        setMoreOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
      setSearchOpen(false);
      setQuery('');
    }
  };

  return (
    <>
<header className="sticky top-0 z-40 border-b border-outline-variant bg-surface-container">        <div className="mx-auto flex h-16 max-w-7xl items-center gap-1.5 px-4 md:px-6">
          {/* دکمه منو (موبایل) */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-on-surface/8 active:bg-on-surface/12 lg:hidden"
            aria-label="باز کردن منو"
          >
            <Icon name="menu" className="text-2xl" />
          </button>

          {/* لوگو */}
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-full p-1 transition-opacity hover:opacity-80"
          >
            <Image
              src="https://my-backend-fanzoom.liara.run/api/files/pbc_2583489775/2396ehdiapcae16/photo_1l7rr5z7gw.jpg?token="
              alt="فن زوم"
              width={36}
              height={36}
              priority={false}
              className="h-9 w-9 rounded-xl object-cover shadow-1"
            />
            <span className="text-lg font-black tracking-tight text-on-surface">فن زوم</span>
          </Link>

          {/* ناوبری دسکتاپ */}
          <nav className="hidden items-center gap-0.5 lg:flex">
            {mainNavCategories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="rounded-full px-3.5 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-on-surface/8 hover:text-on-surface active:bg-on-surface/12"
              >
                {cat.name}
              </Link>
            ))}
            {/* منوی بیشتر */}
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-on-surface/8 hover:text-on-surface active:bg-on-surface/12"
                aria-expanded={moreOpen}
              >
                بیشتر
                <Icon
                  name="expand_more"
                  className={`text-lg transition-transform duration-300 ease-standard ${
                    moreOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
                            <div
                            style={{ backgroundColor: 'var(--color-surface)' }}
                className={`absolute left-0 top-full z-50 mt-2 w-64 origin-top rounded-xl border border-outline-variant bg-surface-container-high p-1.5 shadow-3 transition-all duration-200 ease-standard ${
                  moreOpen
                    ? 'scale-100 opacity-100'
                    : 'pointer-events-none scale-95 opacity-0'
                }`}
              >
                {moreNavCategories.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/category/${cat.slug}`}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-on-surface/8 active:bg-on-surface/12"
                  >
                    <Icon name={cat.symbol} className="text-xl text-on-surface-variant" />
                    {cat.name}
                  </Link>
                ))}
              </div>
            </div>
          </nav>

          <div className="flex-1" />

          {/* جستجو */}
          <div
            className={`flex items-center overflow-hidden rounded-full border transition-all duration-300 ease-standard ${
              searchOpen
                ? 'w-44 border-outline-variant bg-surface-container-high sm:w-64'
                : 'w-10 border-transparent'
            }`}
          >
            {searchOpen && (
              <form onSubmit={submitSearch} className="flex w-full items-center">
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="جستجو..."
                  className="w-full bg-transparent px-3 py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
                />
              </form>
            )}
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-on-surface/8 active:bg-on-surface/12"
              aria-label="جستجو"
            >
              <Icon name={searchOpen ? 'close' : 'search'} className="text-xl" />
            </button>
          </div>

          {/* ورود */}
                    {/* ورود / منوی کاربر */}
          {user ? (
            <UserMenu user={user} />
          ) : (
            <Link
              href="/login"
              className="hidden items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary shadow-1 transition-all duration-300 ease-standard hover:shadow-2 hover:brightness-110 active:scale-95 sm:inline-flex"
            >
              <Icon name="login" className="text-lg" />
              ورود
            </Link>
          )}
          {/* تم */}
          <button
            type="button"
            onClick={toggle}
            className="grid h-10 w-10 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-on-surface/8 active:bg-on-surface/12"
            aria-label="تغییر تم"
          >
            <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-xl" />
          </button>
        </div>
      </header>

      {/* Navigation Drawer (موبایل) */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!drawerOpen}
      >
        {/* scrim */}
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-on-surface/50 transition-opacity duration-300 $ ${
            drawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* panel */}
        <aside
          className={`absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col bg-surface shadow-5 transition-transform duration-300 ease-decelerate ${
            drawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-outline-variant/60 px-4 py-4">
            <div className="flex items-center gap-2.5">
              <Image
                src="https://my-backend-fanzoom.liara.run/api/files/pbc_2583489775/2396ehdiapcae16/photo_1l7rr5z7gw.jpg?token="
                alt="فن زوم"
                width={36}
                height={36}
                priority={false}
                className="h-9 w-9 rounded-xl object-cover shadow-1"
              />
              <span className="text-lg font-black text-on-surface">فن زوم</span>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="grid h-10 w-10 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-on-surface/8"
              aria-label="بستن منو"
            >
              <Icon name="close" className="text-2xl" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <p className="px-4 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant/70">
              دسته‌بندی‌ها
            </p>
            {[...mainNavCategories, ...moreNavCategories].map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3.5 rounded-full px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-on-surface/8 active:bg-secondary-container active:text-on-secondary-container"
              >
                <Icon name={cat.symbol} className="text-2xl text-on-surface-variant" />
                {cat.name}
              </Link>
            ))}
          </nav>

          <div className="border-t border-outline-variant/60 p-3">
            {/* ورود / ثبت‌نام */}
                       {/* ورود / منوی کاربر (موبایل) */}
            {user ? (
              <>
                <div className="mb-1 flex items-center gap-3 rounded-full px-4 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary-container text-sm font-black text-on-secondary-container">
                    {(user.displayName || user.email || 'ک')[0]}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-on-surface">
                      {user.displayName || 'کاربر فن زوم'}
                    </p>
                    <p className="truncate text-xs text-on-surface-variant">{user.email}</p>
                  </div>
                </div>
                <Link
                  href="/profile"
                  onClick={() => setDrawerOpen(false)}
                  className="flex w-full items-center gap-3.5 rounded-full px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-on-surface/8"
                >
                  <Icon name="person" className="text-2xl text-on-surface-variant" />
                  پروفایل من
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    setDrawerOpen(false);
                    router.push('/');
                    router.refresh();
                  }}
                  className="flex w-full items-center gap-3.5 rounded-full px-4 py-3 text-sm font-medium text-error transition-colors hover:bg-error/10"
                >
                                    <Link
                  href="/bookmarks"
                  onClick={() => setDrawerOpen(false)}
                  className="flex w-full items-center gap-3.5 rounded-full px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-on-surface/8"
                >
                  <Icon name="bookmark" className="text-2xl text-on-surface-variant" />
                  نشان‌شده‌ها
                </Link>

                <Link
                  href="/history"
                  onClick={() => setDrawerOpen(false)}
                  className="flex w-full items-center gap-3.5 rounded-full px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-on-surface/8"
                >
                  <Icon name="history" className="text-2xl text-on-surface-variant" />
                  تاریخچه
                </Link>
                
                  <Icon name="logout" className="text-2xl" />
                  خروج
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setDrawerOpen(false)}
                className="flex w-full items-center gap-3.5 rounded-full px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-on-surface/8"
              >
                <Icon name="login" className="text-2xl text-on-surface-variant" />
                ورود / ثبت‌نام
              </Link>
            )}
            {/* تم */}
            <button
              type="button"
              onClick={toggle}
              className="flex w-full items-center gap-3.5 rounded-full px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-on-surface/8"
            >
              <Icon
                name={theme === 'dark' ? 'light_mode' : 'dark_mode'}
                className="text-2xl text-on-surface-variant"
              />
              {theme === 'dark' ? 'حالت روشن' : 'حالت تاریک'}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}