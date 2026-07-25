'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  return (
    <form
      onSubmit={submit}
      className="group flex items-center gap-2 rounded-full border border-outline-variant/70 bg-surface-container-high px-5 py-1.5 shadow-2 transition-all duration-300 ease-standard focus-within:border-primary/50 focus-within:shadow-3"
    >
      <Icon
        name="search"
        className="text-2xl text-on-surface-variant transition-colors group-focus-within:text-primary"
      />
      <input
        autoFocus
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="جستجو در اخبار فناوری..."
        className="w-full bg-transparent py-3 text-base text-on-surface outline-none placeholder:text-on-surface-variant/60 md:text-lg"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            router.push('/search');
          }}
          aria-label="پاک کردن جستجو"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-on-surface/8 hover:text-on-surface active:scale-90"
        >
          <Icon name="close" className="text-xl" />
        </button>
      )}
    </form>
  );
}