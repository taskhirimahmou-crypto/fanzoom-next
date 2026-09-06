import PocketBase from 'pocketbase';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compareSnapshotToImported, diffSchemas } from './schema-contract.mjs';

const command = process.argv[2];
const baseUrl = process.env.PB_REHEARSAL_URL ?? 'http://127.0.0.1:18090';
const schemaPath = process.env.PB_REHEARSAL_SCHEMA_PATH;
const outputDir = process.env.PB_REHEARSAL_OUTPUT_DIR;
const email = process.env.PB_REHEARSAL_SUPERUSER_EMAIL;
const password = process.env.PB_REHEARSAL_SUPERUSER_PASSWORD;
const hookSecret = process.env.PB_REHEARSAL_HOOK_SECRET;
const previousHookSecret = process.env.PB_REHEARSAL_HOOK_SECRET_PREVIOUS;
const executableVersion = process.env.PB_REHEARSAL_EXECUTABLE_VERSION;
const executableVersionOutput = process.env.PB_REHEARSAL_EXECUTABLE_VERSION_RAW;
const expectedSchemaHash = process.env.PB_REHEARSAL_EXPECTED_SCHEMA_SHA256;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(['prepare', 'verify', 'verify-preserved', 'restore', 'verify-restored'].includes(command), 'Unknown rehearsal command');
assert(schemaPath && outputDir && email && password, 'Rehearsal environment is incomplete');
assert(/^\d+\.\d+\.\d+$/.test(executableVersion ?? ''), 'PocketBase executable version was not verified');
assert(new URL(baseUrl).hostname === '127.0.0.1' || new URL(baseUrl).hostname === 'localhost', 'Refusing a non-local PocketBase URL');

await mkdir(outputDir, { recursive: true });
const statePath = path.join(outputDir, 'state.json');
const reportPath = path.join(outputDir, 'report.json');

async function adminClient() {
  const pb = new PocketBase(baseUrl);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password);
  return pb;
}

async function collections(pb) {
  return pb.collections.getFullList({ sort: 'name', requestKey: null });
}

async function count(pb, collection) {
  return (await pb.collection(collection).getList(1, 1, { fields: 'id', requestKey: null })).totalItems;
}

async function recordCounts(pb, names) {
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await count(pb, name)])));
}

async function assertPreservedRecords(pb, state) {
  for (const [collectionName, ids] of Object.entries(state.preservedRecordIds)) {
    for (const id of ids) {
      await pb.collection(collectionName).getOne(id, { fields: 'id', requestKey: null });
    }
  }
  const news = await pb.collection('news').getOne(state.newsRecordId, { requestKey: null });
  for (const [field, expected] of Object.entries(state.newsFixture)) {
    assert(news[field] === expected, `Preserved news field changed: ${field}`);
  }
}

async function expectStatus(task, status, label) {
  const error = await task.then(() => null, (value) => value);
  assert(error?.status === status, `${label}: expected ${status}, received ${error?.status ?? 'success'}`);
}

function writeJson(file, value) {
  return writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function prepare() {
  const snapshot = JSON.parse(await readFile(schemaPath, 'utf8'));
  assert(Array.isArray(snapshot), 'PocketBase schema snapshot must be an array');
  const snapshotHash = createHash('sha256').update(await readFile(schemaPath)).digest('hex');
  assert(snapshotHash === expectedSchemaHash, 'PocketBase schema snapshot hash changed before import');
  const pb = await adminClient();
  await pb.collections.import(snapshot, false);
  const imported = await collections(pb);
  const preflight = compareSnapshotToImported(snapshot, imported);
  assert(preflight.matches, `Imported schema differs from snapshot: ${JSON.stringify(preflight.mismatches)}`);

  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const testPassword = process.env.PB_REHEARSAL_FIXTURE_PASSWORD;
  assert(testPassword && testPassword.length >= 16, 'Local fixture password is missing');
  const user1 = await pb.collection('users').create({
    email: `rehearsal-a-${suffix}@fanzoom.local`, password: testPassword,
    passwordConfirm: testPassword, verified: true, displayName: 'Local rehearsal A',
  });
  const user2 = await pb.collection('users').create({
    email: `rehearsal-b-${suffix}@fanzoom.local`, password: testPassword,
    passwordConfirm: testPassword, verified: true, displayName: 'Local rehearsal B',
  });
  const articles = [];
  for (let index = 1; index <= 5; index += 1) {
    articles.push(await pb.collection('articles').create({
      title: `Local rehearsal article ${index}`,
      slug: `local-rehearsal-${suffix}-${index}`,
      excerpt: 'Local-only compatibility fixture',
      content: '<p>Local-only compatibility fixture</p>',
      category: 'ai-robotics', status: 'published', views: index,
      readTime: 1, author: 'Local QA', featured: false,
    }));
  }
  const bookmark = await pb.collection('bookmarks').create({ user: user1.id, article: articles[0].id });
  const preservedComment = await pb.collection('comments').create({
    user: user1.id, article: articles[0].id, content: 'Local fixture', status: 'approved',
  });

  const readingHistory = await Promise.all([
    pb.collection('reading_history').create({ user: user1.id, article: articles[0].id, progress: 20 }),
    pb.collection('reading_history').create({ user: user1.id, article: articles[0].id, progress: 40 }),
    pb.collection('reading_history').create({ user: user2.id, article: articles[2].id }),
  ]);
  const legacyHistory = await Promise.all([
    pb.collection('history').create({ user: user1.id, article: articles[0].id, last_read: '2030-02-01 00:00:00.000Z' }),
    pb.collection('history').create({ user: user1.id, article: articles[1].id }),
    pb.collection('history').create({ user: user2.id, article: articles[2].id, last_read: '2030-01-01 00:00:00.000Z' }),
    pb.collection('history').create({ user: user1.id, article: articles[0].id, last_read: '2030-03-01 00:00:00.000Z' }),
  ]);
  const siteLogo = await pb.collection('Site_Logo').create({});
  const newsFixture = {
    news_link: `https://local.invalid/rehearsal/${suffix}`,
    status: 'PENDING',
    title: `Local rehearsal news ${suffix}`,
    slug: `local-rehearsal-news-${suffix}`,
    content: '<p>Local-only news fixture</p>',
    source_name: 'Local QA',
    retry_count: 2,
    archived: false,
  };
  const news = await pb.collection('news').create(newsFixture);

  const preservedCollections = snapshot.map((collection) => collection.name);
  const preCounts = await recordCounts(pb, preservedCollections);
  const backupName = `fanzoom_rehearsal_${suffix}.zip`;
  await pb.backups.create(backupName);
  const token = await pb.files.getToken();
  const download = await fetch(pb.backups.getDownloadURL(token, backupName));
  assert(download.ok, `Backup download failed with ${download.status}`);
  const backupBytes = Buffer.from(await download.arrayBuffer());
  assert(backupBytes.byteLength > 0, 'Backup is empty');
  const backupFile = path.join(outputDir, backupName);
  await writeFile(backupFile, backupBytes);

  await writeJson(statePath, {
    schemaPath,
    snapshotHash,
    snapshotCollections: snapshot,
    preCounts,
    userIds: [user1.id, user2.id],
    testPassword,
    articleIds: articles.map((article) => article.id),
    preservedCommentId: preservedComment.id,
    newsRecordId: news.id,
    newsFixture,
    preservedRecordIds: {
      users: [user1.id, user2.id],
      articles: articles.map((article) => article.id),
      bookmarks: [bookmark.id],
      comments: [preservedComment.id],
      history: legacyHistory.map((record) => record.id),
      reading_history: readingHistory.map((record) => record.id),
      Site_Logo: [siteLogo.id],
      news: [news.id],
    },
    backupName,
    backupFile,
    backupSha256: createHash('sha256').update(backupBytes).digest('hex'),
    backupBytes: backupBytes.byteLength,
  });
  await writeJson(reportPath, {
    phase: 'prepared', schemaSource: path.basename(schemaPath), snapshotHash, expectedSchemaHash,
    snapshotCollectionCount: snapshot.length, snapshotImportMatches: true, preCounts,
    backup: { name: backupName, bytes: backupBytes.byteLength, sha256: createHash('sha256').update(backupBytes).digest('hex') },
  });
  console.log(JSON.stringify({ ok: true, phase: 'prepare', preCounts, backupBytes: backupBytes.byteLength }));
}

function limiterHeaders(method, route, body, secret, timestamp = Date.now()) {
  const canonical = `v1\n${method}\n${route}\n${timestamp}\n${createHash('sha256').update(body).digest('hex')}`;
  return {
    'Content-Type': 'application/json',
    'X-Fanzoom-Timestamp': String(timestamp),
    'X-Fanzoom-Signature': createHmac('sha256', secret).update(canonical).digest('hex'),
  };
}

async function limiterCheck(secret, buckets, decisionId = randomUUID(), timestamp = Date.now()) {
  const route = '/api/fanzoom/rate-limit/check';
  const payload = { decisionId, buckets };
  const body = JSON.stringify(payload);
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST', body, headers: limiterHeaders('POST', route, [decisionId, ...buckets.flatMap((item) => [item.policy, item.keyHash])].join('\n'), secret, timestamp),
  });
  const result = await response.json().catch(() => ({}));
  return { response, result, body };
}

async function limiterMetrics(secret) {
  const route = '/api/fanzoom/rate-limit/metrics';
  const response = await fetch(`${baseUrl}${route}`, { headers: limiterHeaders('GET', route, '', secret) });
  return { response, result: await response.json().catch(() => ({})) };
}

async function verify() {
  assert(hookSecret?.length >= 32 && previousHookSecret?.length >= 32, 'Hook rotation secrets are required for upgraded verification');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const pb = await adminClient();
  const upgradedCollections = await collections(pb);
  const upgradedByName = new Map(upgradedCollections.map((collection) => [collection.name, collection]));
  const requireFields = (label, requirements) => {
    for (const [collectionName, fieldNames] of Object.entries(requirements)) {
      const collection = upgradedByName.get(collectionName);
      assert(collection, `${label} requires missing collection ${collectionName}`);
      const fields = new Set(collection.fields.map((field) => field.name));
      for (const fieldName of fieldNames) assert(fields.has(fieldName), `${label} requires missing field ${collectionName}.${fieldName}`);
    }
  };
  const originMainRequirements = {
    users: ['email', 'personalizationEnabled', 'personalizationConsentAt'],
    articles: ['title', 'slug', 'views'], comments: ['user', 'article', 'content', 'status'],
    reading_history: ['user', 'article', 'progress', 'last_read'],
    recommendation_events: ['eventId', 'userId', 'articleId', 'eventType', 'surface', 'feedId', 'rank', 'algorithmVersion'],
    app_admins: ['user', 'role', 'enabled'],
  };
  const featureRequirements = {
    ...originMainRequirements,
    app_admin_audit: ['actorAdmin', 'targetUser', 'action', 'requestId', 'occurredAt', 'outcome'],
  };
  requireFields('origin/main', originMainRequirements);
  requireFields('feature branch', featureRequirements);
  const schemaDiff = diffSchemas(state.snapshotCollections, upgradedCollections);
  assert(schemaDiff.removedCollections.length === 0, `Migration removed collections: ${schemaDiff.removedCollections.join(', ')}`);
  assert(schemaDiff.changedCollections.every((item) => item.removedFields.length === 0), 'Migration removed fields');

  const postCountsBeforeHookTests = await recordCounts(pb, Object.keys(state.preCounts));
  for (const name of Object.keys(state.preCounts).filter((name) => name !== 'reading_history')) {
    assert(postCountsBeforeHookTests[name] === state.preCounts[name], `${name} count changed during migration`);
  }
  assert(postCountsBeforeHookTests.reading_history === state.preCounts.reading_history + 1, 'Legacy history copy count is unexpected');
  await assertPreservedRecords(pb, state);
  const duplicatePair = await pb.collection('reading_history').getFullList({
    filter: pb.filter('user = {:user} && article = {:article}', { user: state.userIds[0], article: state.articleIds[0] }),
  });
  assert(duplicatePair.length === 2, 'Representative canonical duplicates were deleted');
  assert(duplicatePair.some((record) => String(record.last_read).startsWith('2030-03-01')), 'Newest legacy last_read was not merged');
  const copied = await pb.collection('reading_history').getFullList({
    filter: pb.filter('user = {:user} && article = {:article}', { user: state.userIds[0], article: state.articleIds[1] }),
  });
  assert(copied.length === 1, 'Incomplete legacy history was not preserved in the canonical collection');
  const users = await Promise.all(state.userIds.map((id) => pb.collection('users').getOne(id)));
  assert(users.every((user) => user.personalizationEnabled === false && !user.personalizationConsentAt), 'Existing users were not safely opted out');
  assert((await pb.collection('comments').getOne(state.preservedCommentId)).status === 'approved', 'Existing approved comment was modified');

  const userPb = new PocketBase(baseUrl);
  userPb.autoCancellation(false);
  const firstUser = await pb.collection('users').getOne(state.userIds[0]);
  await userPb.collection('users').authWithPassword(firstUser.email, state.testPassword);
  for (const name of ['recommendation_events', 'app_admins', 'app_admin_audit']) {
    await expectStatus(userPb.collection(name).getList(1, 1), 403, `${name} direct list`);
    await expectStatus(userPb.collection(name).create({}), 403, `${name} direct create`);
  }
  await expectStatus(userPb.collection('comments').create({
    user: state.userIds[0], article: state.articleIds[0], content: 'Bypass attempt', status: 'approved',
  }), 403, 'direct approved comment');

  const key = createHash('sha256').update('rehearsal-multi-bucket').digest('hex');
  const decisionId = randomUUID();
  const multi = await limiterCheck(hookSecret, [
    { policy: 'recommendation-events.visitor', keyHash: key },
    { policy: 'recommendation-events.user', keyHash: createHash('sha256').update('rehearsal-user').digest('hex') },
  ], decisionId);
  assert(multi.response.status === 200 && multi.result.writeCount === 3, 'Atomic multi-bucket check failed');
  const retry = await limiterCheck(hookSecret, [
    { policy: 'recommendation-events.visitor', keyHash: key },
    { policy: 'recommendation-events.user', keyHash: createHash('sha256').update('rehearsal-user').digest('hex') },
  ], decisionId);
  assert(retry.response.status === 200 && retry.result.retryDeduplicated === true && retry.result.writeCount === 0, 'Decision retry consumed quota');
  assert((await limiterCheck(previousHookSecret, [{ policy: 'views.visitor', keyHash: createHash('sha256').update('old-secret').digest('hex') }])).response.status === 200, 'Previous rotation secret was rejected');
  assert((await limiterCheck('x'.repeat(48), [{ policy: 'views.visitor', keyHash: createHash('sha256').update('bad-secret').digest('hex') }])).response.status === 401, 'Invalid limiter signature was accepted');
  assert((await limiterCheck(hookSecret, [{ policy: 'views.visitor', keyHash: createHash('sha256').update('expired').digest('hex') }], randomUUID(), Date.now() - 120_000)).response.status === 401, 'Expired limiter timestamp was accepted');
  assert((await limiterCheck(hookSecret, [{ policy: 'client-policy', keyHash: key }])).response.status === 400, 'Client policy was accepted');

  const concurrencyRounds = [];
  for (let round = 0; round < 3; round += 1) {
    const roundKey = createHash('sha256').update(`concurrency-${round}-${randomUUID()}`).digest('hex');
    const responses = await Promise.all(Array.from({ length: 20 }, () => limiterCheck(hookSecret, [{ policy: 'comments.user', keyHash: roundKey }])));
    const allowed = responses.filter((item) => item.response.status === 200).length;
    const denied = responses.filter((item) => item.response.status === 429).length;
    assert(allowed === 10 && denied === 10, `Limiter concurrency round ${round + 1} was ${allowed}/${denied}`);
    assert(responses.filter((item) => item.response.status === 429).every((item) => Number(item.response.headers.get('retry-after')) >= 1), '429 omitted Retry-After');
    concurrencyRounds.push({ round: round + 1, allowed, denied });
  }

  const viewRounds = [];
  for (let round = 0; round < 3; round += 1) {
    const before = await pb.collection('articles').getOne(state.articleIds[round]);
    const increments = await Promise.all(Array.from({ length: 20 }, () => pb.send(`/api/fanzoom/articles/${state.articleIds[round]}/increment-view`, { method: 'POST' })));
    const after = await pb.collection('articles').getOne(state.articleIds[round]);
    const delta = Number(after.views) - Number(before.views);
    assert(delta === 20, `Atomic views round ${round + 1} lost increments`);
    assert(Math.max(...increments.map((item) => Number(item.views))) === Number(after.views), 'Atomic view response overstated the final value');
    viewRounds.push({ round: round + 1, requested: 20, delta });
  }

  const cleanupKey = createHash('sha256').update(`cleanup-${randomUUID()}`).digest('hex');
  const metricsInitial = await limiterMetrics(hookSecret);
  assert(metricsInitial.response.status === 200, 'Initial cleanup metrics were unavailable');
  await limiterCheck(hookSecret, [{ policy: '_internal.cleanup-probe', keyHash: cleanupKey }]);
  await new Promise((resolve) => setTimeout(resolve, 2300));
  const metricsBefore = await limiterMetrics(hookSecret);
  assert(metricsBefore.response.status === 200, 'Cleanup backlog metrics were unavailable');
  let cleanupMode = 'scheduled';
  if (metricsBefore.result.cleanupBacklog >= 1) {
    cleanupMode = 'manual';
    await pb.crons.run('fanzoom-rate-limit-cleanup');
  } else {
    assert(
      metricsBefore.result.cleanupDeleted > metricsInitial.result.cleanupDeleted,
      'Expired cleanup probe was neither pending nor deleted by the scheduled job',
    );
  }
  const metricsAfter = await limiterMetrics(hookSecret);
  assert(metricsAfter.result.cleanupBacklog === 0, 'Cleanup left the expired probe behind');
  assert(metricsAfter.result.activeBuckets >= 1, 'Cleanup removed active buckets');

  const bootstrap = await pb.send('/api/fanzoom/admin-access/bootstrap-owner', {
    method: 'POST', body: { userId: state.userIds[1], requestId: randomUUID() },
  });
  assert(bootstrap.role === 'owner' && bootstrap.enabled === true, 'Owner bootstrap hook failed');
  const mutation = await pb.send('/api/fanzoom/admin-access/mutate', {
    method: 'POST', body: { actorUserId: state.userIds[1], targetUserId: state.userIds[0], role: 'viewer', enabled: true, requestId: randomUUID() },
  });
  assert(mutation.role === 'viewer' && mutation.enabled === true, 'Atomic admin mutation failed');
  assert(await count(pb, 'app_admin_audit') === 2, 'Admin mutation and audit were not written together');
  await expectStatus(pb.send('/api/fanzoom/admin-access/mutate', {
    method: 'POST', body: { actorUserId: state.userIds[1], targetUserId: state.userIds[1], role: 'viewer', enabled: false, requestId: randomUUID() },
  }), 409, 'owner self lockout');

  const finalCounts = await recordCounts(pb, Object.keys(state.preCounts));
  const report = {
    phase: 'verified', schemaSource: path.basename(state.schemaPath), snapshotHash: state.snapshotHash,
    pocketBaseVersion: executableVersion,
    pocketBaseExecutableVersion: executableVersion,
    pocketBaseVersionOutput: executableVersionOutput,
    snapshotImportMatches: true, migrationRerunNoOp: process.env.PB_REHEARSAL_MIGRATION_RERUN_NOOP === 'true',
    preservation: { before: state.preCounts, afterMigration: postCountsBeforeHookTests, final: finalCounts, noSourceRowsDeleted: true },
    historyMigration: {
      canonicalAdded: 1,
      duplicateCanonicalRowsPreserved: 2,
      incompleteLegacyCopied: true,
      incompleteLegacyTimestampRemainsBlank: !copied[0].last_read,
      newestTimestampMerged: true,
    },
    consent: { existingUsersDefaultDisabled: true },
    privateCollections: ['recommendation_events', 'app_admins', 'app_admin_audit'],
    commentModeration: { directCreateBlocked: true, existingApprovedPreserved: true },
    sharedLimiter: { multiBucketAtomic: true, retryDeduplicated: true, rotationSecretAccepted: true, invalidAndExpiredRejected: true, concurrencyRounds, cleanupMode, cleanupBacklogBefore: metricsBefore.result.cleanupBacklog, cleanupBacklogAfter: metricsAfter.result.cleanupBacklog, activeBucketsAfterCleanup: metricsAfter.result.activeBuckets },
    hooks: { atomicViews: viewRounds, adminMutationAuditAtomic: true, coexistence: true },
    schemaDiff,
    compatibility: {
      featureBranchRequiredSchemaPresent: true,
      originMainRequiredSchemaPresent: true,
      originMainNote: 'additive-schema-compatible; direct comment creation intentionally replaced by trusted server API',
      applicationPathsExecuted: false,
    },
    startupSafety: { missingRequiredSecretsRejected: process.env.PB_REHEARSAL_STARTUP_SECRET_GUARD === 'true' },
    backup: { bytes: state.backupBytes, sha256: state.backupSha256, restorePending: true },
  };
  await writeJson(reportPath, report);
  console.log(JSON.stringify({ ok: true, phase: 'verify', concurrencyRounds, viewRounds, schemaDiff }));
}

async function verifyPreserved() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const pb = await adminClient();
  await assertPreservedRecords(pb, state);
  const live = await collections(pb);
  const schemaDiff = diffSchemas(state.snapshotCollections, live);
  assert(schemaDiff.removedCollections.length === 0, 'Application-path tests removed a snapshot collection');
  assert(schemaDiff.changedCollections.every((item) => item.removedFields.length === 0), 'Application-path tests removed a snapshot field');
  report.compatibility.applicationPathsExecuted = process.env.PB_REHEARSAL_APP_INTEGRATION === 'true';
  report.compatibility.applicationIntegrationSuite = 'scripts/test-local-integration.mjs';
  report.preservation.representativeRecordsSurvivedApplicationPaths = true;
  await writeJson(reportPath, report);
  console.log(JSON.stringify({ ok: true, phase: 'verify-preserved' }));
}

async function restore() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const pb = await adminClient();
  await pb.backups.restore(state.backupName);
  console.log(JSON.stringify({ ok: true, phase: 'restore-requested' }));
}

async function verifyRestored() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const pb = await adminClient();
  const live = await collections(pb);
  const preflight = compareSnapshotToImported(state.snapshotCollections, live);
  assert(preflight.matches, `Restored schema differs from pre-migration snapshot: ${JSON.stringify(preflight.mismatches)}`);
  const restoredCounts = await recordCounts(pb, Object.keys(state.preCounts));
  assert(JSON.stringify(restoredCounts) === JSON.stringify(state.preCounts), 'Restored record counts differ from pre-migration counts');
  const liveNames = new Set(live.map((collection) => collection.name));
  for (const added of ['recommendation_events', 'app_admins', 'app_admin_audit']) {
    assert(!liveNames.has(added), `Restore retained post-migration collection ${added}`);
  }
  report.phase = 'complete';
  report.backup.restorePending = false;
  report.backup.restoreVerified = true;
  report.backup.restoredCounts = restoredCounts;
  await writeJson(reportPath, report);
  console.log(JSON.stringify({ ok: true, phase: 'verify-restored', restoredCounts }));
}

if (command === 'prepare') await prepare();
if (command === 'verify') await verify();
if (command === 'verify-preserved') await verifyPreserved();
if (command === 'restore') await restore();
if (command === 'verify-restored') await verifyRestored();
