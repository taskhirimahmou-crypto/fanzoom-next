import PocketBase, { ClientResponseError } from 'pocketbase';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'viewer']);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', 'pocketbase']);
const RECORD_ID = /^[a-z0-9]{15}$/i;

function fail(message) {
  throw new Error(message);
}

function readArguments(argv) {
  const result = { enabled: true, recovery: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--disabled') {
      result.enabled = false;
    } else if (argument === '--recovery') {
      result.recovery = true;
    } else if (argument === '--user-id' || argument === '--role') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail(`${argument} requires a value`);
      result[argument === '--user-id' ? 'userId' : 'role'] = value;
      index += 1;
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function requireLocalPocketBase(rawUrl) {
  if (!rawUrl) fail('A local PocketBase URL is required');
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' || !LOCAL_HOSTS.has(url.hostname)) {
    fail('Provisioning is restricted to the local Docker PocketBase service');
  }
  return url.origin;
}

async function main() {
  if (process.env.FANZOOM_LOCAL_DOCKER !== 'true') {
    fail('Provisioning is allowed only inside the isolated local Docker stack');
  }
  const options = readArguments(process.argv.slice(2));
  if (!options.userId || !RECORD_ID.test(options.userId)) {
    fail('--user-id must be a 15-character PocketBase record ID');
  }
  if (!options.role || !ALLOWED_ROLES.has(options.role)) {
    fail('--role must be owner, admin, or viewer');
  }

  const pbUrl = requireLocalPocketBase(
    process.env.POCKETBASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_POCKETBASE_URL,
  );
  const email = process.env.POCKETBASE_ADMIN_EMAIL ?? process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD ?? process.env.PB_SUPERUSER_PASSWORD;
  if (!email || !password) fail('Local PocketBase superuser credentials are required');

  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password);
  await pb.collection('users').getOne(options.userId, { fields: 'id' });

  const activeOwners = await pb.collection('app_admins').getList(1, 2, {
    filter: 'role = "owner" && enabled = true',
    fields: 'id,user',
    requestKey: null,
  });
  if (activeOwners.totalItems === 0) {
    if (options.role !== 'owner' || options.enabled !== true || options.recovery) {
      fail('The first local app admin must be one enabled owner without --recovery');
    }
    await pb.send('/api/fanzoom/admin-access/bootstrap-owner', {
      method: 'POST',
      body: { userId: options.userId, requestId: crypto.randomUUID() },
      requestKey: null,
    });
    console.log('First local app owner provisioned securely.');
    return;
  }

  if (!options.recovery) {
    fail('An owner already exists. Manage viewer/admin access in /admin/access; use --recovery only for recovery.');
  }

  let existing = null;
  try {
    existing = await pb.collection('app_admins').getFirstListItem(
      pb.filter('user = {:userId}', { userId: options.userId }),
      { fields: 'id,role,enabled' },
    );
  } catch (error) {
    if (!(error instanceof ClientResponseError) || error.status !== 404) throw error;
  }

  if (
    existing &&
    existing.role === 'owner' &&
    existing.enabled === true &&
    (options.role !== 'owner' || options.enabled !== true) &&
    activeOwners.totalItems <= 1
  ) fail('Recovery cannot disable or demote the last active owner');

  const data = { user: options.userId, role: options.role, enabled: options.enabled };
  if (existing) await pb.collection('app_admins').update(existing.id, data);
  else await pb.collection('app_admins').create(data);

  const action = !existing
    ? 'grant'
    : existing.role !== options.role
      ? 'role_change'
      : existing.enabled && !options.enabled
        ? 'revoke'
        : 'enable';
  await pb.collection('app_admin_audit').create({
    targetUser: options.userId,
    action,
    beforeRole: existing?.role ?? '',
    afterRole: options.role,
    beforeEnabled: existing?.enabled === true,
    afterEnabled: options.enabled,
    requestId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    outcome: 'success',
  });

  console.log(`Local recovery completed: role=${options.role}, enabled=${options.enabled}`);
}

main().catch(() => {
  console.error('Local app admin provisioning failed. Check local URL, credentials, user ID, and migrations.');
  process.exitCode = 1;
});
