'use client';

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className="pcb-bg grid min-h-screen place-items-center p-6">
      <section className="cyber-card max-w-lg rounded-3xl bg-surface-container p-8 text-center shadow-2">
        <h1 className="text-2xl font-black">مدیریت دسترسی در دسترس نیست</h1>
        <p className="mt-3 leading-7 text-on-surface-variant">اتصال لوکال و وضعیت PocketBase را بررسی کنید و دوباره تلاش کنید.</p>
        <button type="button" onClick={reset} className="mt-6 rounded-full bg-primary px-5 py-2.5 font-bold text-on-primary">تلاش دوباره</button>
      </section>
    </main>
  );
}
