import PocketBase from 'pocketbase';
import { getPocketBaseServerUrl } from './pocketbase-url';
import { attachRequestIdToPocketBase } from './observability/request-context';
import { writeStructuredServerLog } from './observability/logger';
import { isSharedRateLimitPermit } from './shared-rate-limit/core';
import type { SharedRateLimitPermit } from './shared-rate-limit/types';

export class PocketBaseAdminConfigurationError extends Error {
  constructor() {
    super('PocketBase admin credentials are not configured');
    this.name = 'PocketBaseAdminConfigurationError';
  }
}

export async function getAdminPocketBase(
  requestId: string | undefined,
  permit: SharedRateLimitPermit,
): Promise<PocketBase> {
  if (!isSharedRateLimitPermit(permit)) {
    writeStructuredServerLog({
      level: 'error',
      eventName: 'privileged_operation_without_shared_limiter',
      requestId: requestId ?? 'missing_request_id',
      route: 'pocketbase-admin',
      statusCode: 503,
      durationMs: 0,
      errorCode: 'shared_rate_limit_permit_missing',
    });
    throw new Error('shared_rate_limit_permit_missing');
  }
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !password) throw new PocketBaseAdminConfigurationError();

  const pb = attachRequestIdToPocketBase(new PocketBase(getPocketBaseServerUrl()), requestId);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password);
  return pb;
}
