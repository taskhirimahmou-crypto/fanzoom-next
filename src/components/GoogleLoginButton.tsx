'use client';

/** Compatibility component that delegates to the unified server-side OAuth flow. */
export function GoogleLoginButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.assign('/api/auth/google')}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container py-3 text-sm font-bold text-on-surface transition-all hover:bg-surface-container-high active:scale-95"
    >
      ورود با گوگل
    </button>
  );
}
