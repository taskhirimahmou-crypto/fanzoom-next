'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/components/ThemeProvider';
import { mainNavCategories, moreNavCategories } from '@/lib/categories';

export function Header() {
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
      <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-1.5 px-4 md:px-6">
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
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-on-primary shadow-1">
              <Icon name="bolt" fill className="text-xl" />
            </span>
            <span className="text-lg font-black tracking-tight text-on-surface">فنزوم</span>
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
                className={`absolute left-0 top-full z-50 mt-2 w-64 origin-top rounded-xl border border-outline-variant/60 bg-surface-container-high p-1.5 shadow-2 transition-all duration-200 ease-standard ${
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
          className={`absolute inset-0 bg-on-surface/40 transition-opacity duration-300 ${
            drawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* panel */}
        <aside
          className={`absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col bg-surface-container-low shadow-5 transition-transform duration-300 ease-decelerate ${
            drawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-outline-variant/60 px-4 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-on-primary">
                <Icon name="bolt" fill className="text-xl" />
              </span>
              <span className="text-lg font-black text-on-surface">فنزوم</span>
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