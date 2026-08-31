import { NextResponse } from 'next/server';

/**
 * Kept as a compatibility tombstone after the unified server-side auth flow
 * removed client-submitted PocketBase sessions.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'This authentication endpoint is no longer supported' },
    { status: 410 },
  );
}
