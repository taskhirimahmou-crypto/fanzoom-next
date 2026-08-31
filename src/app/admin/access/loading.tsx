export default function Loading() {
  return (
    <main className="pcb-bg min-h-screen p-4 md:p-8" aria-busy="true" aria-label="در حال بارگذاری مدیریت دسترسی">
      <div className="mx-auto max-w-6xl animate-pulse space-y-5">
        <div className="h-40 rounded-3xl bg-surface-container" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-80 rounded-3xl bg-surface-container" />
          <div className="h-80 rounded-3xl bg-surface-container" />
        </div>
      </div>
    </main>
  );
}
