import { NextRequest } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import {
  beginServerRequest,
  logRequestEvent,
  observedJson,
} from '@/lib/observability/request-context';

export async function PATCH(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/profile/personalization');
  try {
    const pb = await getServerPocketBase(observation.requestId);
    const record = pb.authStore.record as { id?: string; collectionName?: string } | null;
    if (!record?.id || record.collectionName !== 'users') {
      return observedJson(observation, { error: 'unauthorized' }, { status: 401 }, {
        errorCode: 'unauthorized',
      });
    }

    const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== 'boolean') {
      return observedJson(observation, { error: 'invalid_preference' }, { status: 400 }, {
        errorCode: 'invalid_preference',
      });
    }

    const update: { personalizationEnabled: boolean; personalizationConsentAt?: string } = {
      personalizationEnabled: body.enabled,
    };
    if (body.enabled) update.personalizationConsentAt = new Date().toISOString();

    await pb.collection('users').update(record.id, update);
    logRequestEvent(observation, 'info', 'personalization_consent_updated', 200);
    return observedJson(observation, { ok: true, personalizationEnabled: body.enabled });
  } catch {
    logRequestEvent(observation, 'error', 'pocketbase_failure', 500, {
      errorCode: 'personalization_update_failed',
    });
    return observedJson(
      observation,
      { error: 'preference_update_failed' },
      { status: 500 },
      { errorCode: 'personalization_update_failed' },
    );
  }
}
