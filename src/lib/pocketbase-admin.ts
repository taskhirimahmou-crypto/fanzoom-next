import PocketBase from 'pocketbase';
import { getPocketBaseServerUrl } from './pocketbase-url';
import { attachRequestIdToPocketBase } from './observability/request-context';

export class PocketBaseAdminConfigurationError extends Error {
  constructor() {
    super('PocketBase admin credentials are not configured');
    this.name = 'PocketBaseAdminConfigurationError';
  }
}

export async function getAdminPocketBase(requestId?: string): Promise<PocketBase> {
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !password) throw new PocketBaseAdminConfigurationError();

  const pb = attachRequestIdToPocketBase(new PocketBase(getPocketBaseServerUrl()), requestId);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password);
  return pb;
}
