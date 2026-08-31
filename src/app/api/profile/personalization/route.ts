import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';

export async function PATCH(req: NextRequest) {
  const pb = await getServerPocketBase();
  const record = pb.authStore.record as { id?: string; collectionName?: string } | null;
  if (!record?.id || record.collectionName !== 'users') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid_preference' }, { status: 400 });
  }

  const update: { personalizationEnabled: boolean; personalizationConsentAt?: string } = {
    personalizationEnabled: body.enabled,
  };
  if (body.enabled) update.personalizationConsentAt = new Date().toISOString();

  await pb.collection('users').update(record.id, update);
  return NextResponse.json({ ok: true, personalizationEnabled: body.enabled });
}
