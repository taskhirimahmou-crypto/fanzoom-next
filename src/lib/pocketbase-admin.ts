import PocketBase from 'pocketbase';
import { getPocketBaseServerUrl } from './pocketbase-url';

export class PocketBaseAdminConfigurationError extends Error {
  constructor() {
    super('PocketBase admin credentials are not configured');
    this.name = 'PocketBaseAdminConfigurationError';
  }
}

export async function getAdminPocketBase(): Promise<PocketBase> {
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !password) throw new PocketBaseAdminConfigurationError();

  const pb = new PocketBase(getPocketBaseServerUrl());
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password);
  return pb;
}
