import PocketBase from 'pocketbase';
import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const appUrl = process.env.LOCAL_APP_URL;
const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const adminEmail = process.env.PB_SUPERUSER_EMAIL;
const adminPassword = process.env.PB_SUPERUSER_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertLocalUrl(raw, allowedHosts, label) {
  assert(raw, `${label} is required`);
  const url = new URL(raw);
  assert(url.protocol === 'http:', `${label} must use local HTTP`);
  assert(allowedHosts.has(url.hostname), `${label} must target the isolated local stack`);
  return url.origin;
}

const localApp = assertLocalUrl(appUrl, new Set(['web', '127.0.0.1', 'localhost']), 'LOCAL_APP_URL');
const localPb = assertLocalUrl(pbUrl, new Set(['pocketbase', '127.0.0.1', 'localhost']), 'NEXT_PUBLIC_POCKETBASE_URL');
assert(adminEmail && adminPassword, 'Local PocketBase admin credentials are required');

const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const testEmail = `api-${runId}@fanzoom.local`;
const testPassword = `ApiLocal-${runId}!Z9`;
const feedId = `itest_${runId}`;
const algorithmVersion = 'baseline-category-round-robin-v1';
const results = [];
const functionalFailures = [];
const securityFindings = [];

function pass(name) {
  results.push(name);
  console.log(`✅ ${name}`);
}

function functionalFailure(name, details) {
  functionalFailures.push(`${name}: ${details}`);
  console.error(`❌ ${name}: ${details}`);
}

async function jsonRequest(path, { cookie, headers, ...options } = {}) {
  const response = await fetch(`${localApp}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function createTestViewVisitorCookie(seed) {
  const secret = process.env.VIEW_RATE_LIMIT_SECRET;
  assert(secret && Buffer.byteLength(secret, 'utf8') >= 32, 'Local view signing secret is required');
  const id = createHmac('sha256', secret).update(`integration:${seed}`).digest('base64url').slice(0, 24);
  const signature = createHmac('sha256', secret).update(`v1.${id}`).digest('base64url');
  return `fz_view_visitor=v1.${id}.${signature}`;
}

try {
const adminPb = new PocketBase(localPb);
adminPb.autoCancellation(false);
await adminPb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

const healthRequestId = crypto.randomUUID();
const health = await jsonRequest('/api/health', {
  headers: { 'x-request-id': healthRequestId },
});
assert(health.response.status === 200, 'Next.js health endpoint is not healthy');
assert(health.body?.status === 'ok', 'Public health response has an unexpected status');
assert(Object.keys(health.body).length === 1, 'Public health response exposed internal details');
assert(
  health.response.headers.get('x-request-id') === healthRequestId,
  'Health request ID was not propagated',
);
pass('public health is minimal and propagates request ID');

const articles = await adminPb.collection('articles').getFullList();
assert(articles.length >= 3, 'At least three local articles are required');
const article = articles[0];

await adminPb.collection('users').create({
  email: testEmail,
  password: testPassword,
  passwordConfirm: testPassword,
  verified: true,
  displayName: 'API integration test',
  interests: ['ai-robotics', 'mobile-tablet', 'cybersecurity'],
  personalizationEnabled: false,
  personalizationConsentAt: '',
});
const testUser = await adminPb.collection('users').getFirstListItem(
  adminPb.filter('email = {:email}', { email: testEmail }),
);

const anonymous = await jsonRequest('/api/recommendation-events', {
  method: 'POST',
  body: JSON.stringify({}),
});
assert(anonymous.response.status === 401, 'Anonymous event ingestion must return 401');
pass('anonymous recommendation ingestion is blocked');

const login = await jsonRequest('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: testEmail, password: testPassword }),
});
assert(login.response.status === 200, 'Local API user login failed');
const setCookie = login.response.headers.get('set-cookie') ?? '';
const cookieMatch = setCookie.match(/pb_auth=([^;]+)/);
assert(cookieMatch, 'Authentication cookie was not returned');
const cookie = `pb_auth=${cookieMatch[1]}`;
pass('authenticated session cookie is issued');

const userPb = new PocketBase(localPb);
await userPb.collection('users').authWithPassword(testEmail, testPassword);

for (let attempt = 0; attempt < 2; attempt += 1) {
  const provisioning = await execFileAsync(
    process.execPath,
    [
      'scripts/provision-local-app-admin.mjs',
      '--user-id',
      testUser.id,
      '--role',
      'viewer',
    ],
    { env: process.env },
  );
  assert(
    provisioning.stdout.includes('role=viewer, enabled=true'),
    'Local admin provisioning did not return its non-sensitive success status',
  );
  assert(!provisioning.stdout.includes(testUser.id), 'Provisioning output exposed the user ID');
  assert(!provisioning.stdout.includes(testEmail), 'Provisioning output exposed the user email');
}

const appAdminRows = await adminPb.collection('app_admins').getFullList({
  filter: adminPb.filter('user = {:userId}', { userId: testUser.id }),
});
assert(appAdminRows.length === 1, 'Idempotent provisioning created duplicate app admin rows');
assert(appAdminRows[0].role === 'viewer' && appAdminRows[0].enabled === true, 'Provisioned role is invalid');

for (const operation of ['list', 'create', 'update', 'delete']) {
  let status = 0;
  try {
    if (operation === 'list') await userPb.collection('app_admins').getList(1, 1);
    if (operation === 'create') {
      await userPb.collection('app_admins').create({ user: testUser.id, role: 'owner', enabled: true });
    }
    if (operation === 'update') {
      await userPb.collection('app_admins').update(appAdminRows[0].id, { role: 'owner' });
    }
    if (operation === 'delete') {
      await userPb.collection('app_admins').delete(appAdminRows[0].id);
    }
  } catch (error) {
    status = error?.status ?? 0;
  }
  assert(status === 403, `Direct PocketBase app_admins ${operation} was not blocked`);
}

let duplicateMembershipStatus = 0;
try {
  await adminPb.collection('app_admins').create({
    user: testUser.id,
    role: 'admin',
    enabled: true,
  });
} catch (error) {
  duplicateMembershipStatus = error?.status ?? 0;
}
assert(duplicateMembershipStatus === 400, 'Unique app admin membership was not enforced');
await adminPb.collection('app_admins').update(appAdminRows[0].id, { enabled: false });
pass('app admin provisioning is idempotent, private, unique and disableable');

const beforeDisabledEvents = await adminPb.collection('recommendation_events').getFullList({
  filter: adminPb.filter('userId = {:userId}', { userId: testUser.id }),
});
const disabledFeed = await jsonRequest(`/api/recommended?limit=3&feedId=${feedId}`, { cookie });
assert(disabledFeed.response.status === 200, 'Disabled recommendation feed request failed');
assert(disabledFeed.body.personalizationEnabled === false, 'Test user must start opted out');
assert(disabledFeed.body.articles.length === 3, 'Baseline feed did not return three articles');
const afterDisabledEvents = await adminPb.collection('recommendation_events').getFullList({
  filter: adminPb.filter('userId = {:userId}', { userId: testUser.id }),
});
assert(afterDisabledEvents.length === beforeDisabledEvents.length, 'Opted-out feed created events');

const disabledEvent = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `share:disabled:${runId}`,
    articleId: article.id,
    eventType: 'share',
    surface: 'article',
  }),
});
assert(disabledEvent.response.status === 403, 'Opted-out event ingestion must return 403');
pass('consent opt-out blocks all recommendation writes');

const enable = await jsonRequest('/api/profile/personalization', {
  cookie,
  method: 'PATCH',
  body: JSON.stringify({ enabled: true }),
});
assert(enable.response.status === 200 && enable.body.personalizationEnabled === true, 'Consent enable failed');
const enabledUser = await adminPb.collection('users').getOne(testUser.id);
assert(enabledUser.personalizationEnabled === true, 'Consent bool was not persisted');
assert(Boolean(enabledUser.personalizationConsentAt), 'Consent timestamp was not persisted');
pass('explicit consent is persisted with timestamp');

const feedRequestId = crypto.randomUUID();
const feed = await jsonRequest(`/api/recommended?limit=3&feedId=${feedId}`, {
  cookie,
  headers: { 'x-request-id': feedRequestId },
});
assert(feed.response.status === 200, 'Recommendation feed failed after consent');
assert(
  feed.response.headers.get('x-request-id') === feedRequestId,
  'Recommendation request ID was not propagated',
);
assert(feed.body.feedId === feedId, 'Feed ID was not preserved');
assert(feed.body.algorithmVersion === algorithmVersion, 'Baseline algorithm version changed');
assert(feed.body.personalizationEnabled === true, 'Consent state missing from feed response');
assert(feed.body.articles.length === 3, 'Baseline recommendation count changed');

let served = await adminPb.collection('recommendation_events').getFullList({
  filter: adminPb.filter('userId = {:userId} && feedId = {:feedId} && eventType = "served"', {
    userId: testUser.id,
    feedId,
  }),
  sort: 'rank',
});
if (
  served.length === 3 &&
  served.every((event, index) => event.rank === index + 1) &&
  served.every((event) => event.algorithmVersion === algorithmVersion)
) {
  pass('trusted baseline feed creates one ranked served batch');
} else {
  functionalFailure(
    'trusted served batch',
    `expected 3 ranked events, found ${served.length}`,
  );
}

const batchBody = {
  feedId,
  surface: 'for_you',
  algorithmVersion,
  offset: 0,
  articleIds: feed.body.articles.map((item) => item.id),
};
const batchRetry = await jsonRequest('/api/recommendation-events/served', {
  cookie,
  method: 'POST',
  body: JSON.stringify(batchBody),
});
if (
  batchRetry.response.status === 200 &&
  batchRetry.body.total === 3 &&
  batchRetry.body.created === 0 &&
  batchRetry.body.duplicates === 3 &&
  Array.isArray(batchRetry.body.failures) &&
  batchRetry.body.failures.length === 0
) {
  served = await adminPb.collection('recommendation_events').getFullList({
    filter: adminPb.filter('userId = {:userId} && feedId = {:feedId} && eventType = "served"', {
      userId: testUser.id,
      feedId,
    }),
  });
  if (served.length === 3) pass('served batch retry is idempotent');
  else functionalFailure('served batch idempotency', `expected 3 events, found ${served.length}`);
} else {
  functionalFailure(
    'served batch endpoint',
    `expected 200, received ${batchRetry.response.status}`,
  );
}

const forged = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `forged:${runId}`,
    userId: 'aaaaaaaaaaaaaaa',
    articleId: article.id,
    eventType: 'share',
    surface: 'article',
  }),
});
assert(forged.response.status === 400, 'Forged userId must be rejected');

const serverOnly = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `served-public:${runId}`,
    articleId: article.id,
    eventType: 'served',
    surface: 'for_you',
    feedId,
    rank: 1,
    algorithmVersion,
  }),
});
assert(serverOnly.response.status === 400, 'Client must not create served events directly');
pass('user forging and server-only event creation are rejected');

const missingArticle = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `share:missing:${runId}`,
    articleId: 'zzzzzzzzzzzzzzz',
    eventType: 'share',
    surface: 'article',
  }),
});
assert(missingArticle.response.status === 400, 'Nonexistent article event was accepted');

const forgedImpression = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `impression:forged:${runId}`,
    articleId: feed.body.articles[0].id,
    eventType: 'impression',
    surface: 'for_you',
    feedId: `forged_${runId}`,
    rank: 1,
    algorithmVersion,
  }),
});
assert(forgedImpression.response.status === 400, 'Impression without matching served evidence was accepted');

const incompleteAttribution = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `share:incomplete:${runId}`,
    articleId: feed.body.articles[0].id,
    eventType: 'share',
    surface: 'for_you',
    feedId,
  }),
});
assert(incompleteAttribution.response.status === 400, 'Incomplete recommendation attribution was accepted');

const progressBeforeOpen = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `progress:before-open:${runId}:25`,
    articleId: feed.body.articles[1].id,
    eventType: 'progress_milestone',
    surface: 'for_you',
    feedId,
    rank: 2,
    algorithmVersion,
    engagedSeconds: 6,
    maxProgress: 25,
  }),
});
assert(progressBeforeOpen.response.status === 400, 'Progress without a matching open was accepted');
pass('forged article, attribution and reading state are rejected');

const impressionBody = {
  idempotencyKey: `impression:${runId}`,
  articleId: feed.body.articles[0].id,
  eventType: 'impression',
  surface: 'for_you',
  feedId,
  rank: 1,
  algorithmVersion,
  occurredAt: new Date().toISOString(),
};
const impression = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify(impressionBody),
});
assert(impression.response.status === 201 && impression.body.duplicate === false, 'Impression create failed');
const impressionRetry = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify(impressionBody),
});
assert(impressionRetry.response.status === 200, 'Impression retry failed');
assert(impressionRetry.body.duplicate === true, 'Impression retry was not marked duplicate');
assert(impressionRetry.body.eventId === impression.body.eventId, 'Duplicate did not return original eventId');
const poisonedDuplicate = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    ...impressionBody,
    articleId: feed.body.articles[1].id,
    rank: 2,
  }),
});
assert(poisonedDuplicate.response.status === 400, 'Idempotency key was reused for different coordinates');
const storedImpression = await adminPb.collection('recommendation_events').getFirstListItem(
  adminPb.filter('eventId = {:eventId}', { eventId: impression.body.eventId }),
);
assert(storedImpression.userId === testUser.id, 'Stored event user was not derived from session');
pass('event idempotency and session-derived user are enforced');

const legacyOpenBucket = Math.floor(Date.now() / 300_000);
const legacyOpenKey = `open:${feedId}:${feed.body.articles[0].id}:${legacyOpenBucket}`;
const legacyOpenAt = new Date().toISOString();
await adminPb.collection('recommendation_events').create({
  eventId: crypto.randomUUID(),
  idempotencyKey: legacyOpenKey,
  userId: testUser.id,
  articleId: feed.body.articles[0].id,
  eventType: 'open',
  surface: 'for_you',
  feedId,
  rank: 1,
  algorithmVersion,
  occurredAt: legacyOpenAt,
  receivedAt: legacyOpenAt,
});
const attributedOpen = await jsonRequest('/api/history', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    articleId: feed.body.articles[0].id,
    attribution: { feedId, rank: 1, surface: 'for_you', algorithmVersion },
  }),
});
assert(attributedOpen.response.status === 200, 'Attributed history/open failed');
assert(
  attributedOpen.body.openRecorded === true && attributedOpen.body.attribution?.feedId === feedId,
  'History did not confirm the accepted recommendation open channel',
);
const incompleteOpen = await jsonRequest('/api/history', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    articleId: feed.body.articles[1].id,
    attribution: { feedId, rank: 2, surface: 'for_you' },
  }),
});
assert(incompleteOpen.response.status === 200, 'Incomplete-attribution history/open failed');
assert(
  incompleteOpen.body.openRecorded === true && incompleteOpen.body.attribution === null,
  'Incomplete attribution was not confirmed as direct',
);
const forgedOpen = await jsonRequest('/api/history', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    articleId: feed.body.articles[2].id,
    attribution: {
      feedId: `forged_${runId}`,
      rank: 3,
      surface: 'for_you',
      algorithmVersion,
    },
  }),
});
assert(forgedOpen.response.status === 200, 'Forged-attribution history/open failed');
assert(
  forgedOpen.body.openRecorded === true && forgedOpen.body.attribution === null,
  'Forged attribution was not confirmed as direct',
);
const directArticle = articles.find((item) => !feed.body.articles.some((feedItem) => feedItem.id === item.id));
assert(directArticle, 'A non-feed article is required for direct-open validation');
const directOpen = await jsonRequest('/api/history', {
  cookie,
  method: 'POST',
  body: JSON.stringify({ articleId: directArticle.id }),
});
assert(directOpen.response.status === 200, 'Direct history/open failed');
assert(
  directOpen.body.openRecorded === true && directOpen.body.attribution === null,
  'Direct open confirmation was missing',
);
const openEvents = await adminPb.collection('recommendation_events').getFullList({
  filter: adminPb.filter('userId = {:userId} && eventType = "open"', { userId: testUser.id }),
});
const recommendationOpen = openEvents.find((event) => event.articleId === feed.body.articles[0].id);
const incompleteRecommendationOpen = openEvents.find((event) => event.articleId === feed.body.articles[1].id);
const forgedRecommendationOpen = openEvents.find((event) => event.articleId === feed.body.articles[2].id);
const nonRecommendationOpen = openEvents.find((event) => event.articleId === directArticle.id);
if (recommendationOpen?.feedId === feedId && recommendationOpen?.rank === 1) {
  pass('recommendation open preserves feed attribution');
} else {
  functionalFailure(
    'recommendation open attribution',
    `stored feedId=${recommendationOpen?.feedId || '(empty)'} rank=${recommendationOpen?.rank ?? '(missing)'}`,
  );
}
assert(
  openEvents.filter((event) => event.articleId === feed.body.articles[0].id).length === 1,
  'A compatible legacy attributed-open retry created a duplicate event',
);
pass('legacy attributed-open retries remain idempotent after the key hardening');
assert(
  !incompleteRecommendationOpen?.feedId && incompleteRecommendationOpen?.surface === 'direct',
  'Incomplete query parameters received recommendation attribution',
);
assert(
  !forgedRecommendationOpen?.feedId && forgedRecommendationOpen?.surface === 'direct',
  'Forged query parameters received recommendation attribution',
);
assert(
  !nonRecommendationOpen?.feedId && nonRecommendationOpen?.surface === 'direct',
  'Direct traffic received recommendation attribution',
);
pass('direct, incomplete and forged open traffic remains unattributed');

const directProgress = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `progress:direct:${runId}:25`,
    articleId: directArticle.id,
    eventType: 'progress_milestone',
    surface: 'article',
    engagedSeconds: 6,
    maxProgress: 25,
  }),
});
assert(directProgress.response.status === 201, 'Direct progress with a recent direct open was rejected');
const directEngagedBody = {
  idempotencyKey: `engaged:direct-zero:${runId}`,
  articleId: directArticle.id,
  eventType: 'engaged',
  surface: 'article',
  engagedSeconds: 8,
  maxProgress: 0,
};
const directEngaged = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify(directEngagedBody),
});
assert(directEngaged.response.status === 201, 'Direct engaged event with zero progress was rejected');
const directEngagedRetry = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify(directEngagedBody),
});
assert(
  directEngagedRetry.response.status === 200 && directEngagedRetry.body.duplicate === true,
  'Direct engaged retry with zero progress lost idempotency',
);
const mixedDirect = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `share:mixed-direct:${runId}`,
    articleId: directArticle.id,
    eventType: 'share',
    surface: 'for_you',
  }),
});
assert(mixedDirect.response.status === 400, 'Direct data was mixed with a recommendation surface');
pass('direct reading remains separate from recommendation attribution');

const expiredFeedId = `expired_${runId}`;
const expiredAt = new Date(Date.now() - 31 * 60_000).toISOString();
await adminPb.collection('recommendation_events').create({
  eventId: crypto.randomUUID(),
  idempotencyKey: `served:${expiredFeedId}:${directArticle.id}:1`,
  userId: testUser.id,
  articleId: directArticle.id,
  eventType: 'served',
  surface: 'for_you',
  feedId: expiredFeedId,
  rank: 1,
  algorithmVersion,
  occurredAt: expiredAt,
  receivedAt: expiredAt,
});
const expiredImpression = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `impression:expired:${runId}`,
    articleId: directArticle.id,
    eventType: 'impression',
    surface: 'for_you',
    feedId: expiredFeedId,
    rank: 1,
    algorithmVersion,
  }),
});
assert(expiredImpression.response.status === 400, 'Expired served evidence was accepted for impression');
const expiredOpen = await jsonRequest('/api/history', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    articleId: directArticle.id,
    attribution: { feedId: expiredFeedId, rank: 1, surface: 'for_you', algorithmVersion },
  }),
});
assert(expiredOpen.response.status === 200, 'Expired-attribution history/open failed');
const expiredAttributedOpens = await adminPb.collection('recommendation_events').getFullList({
  filter: adminPb.filter(
    'userId = {:userId} && eventType = "open" && feedId = {:feedId}',
    { userId: testUser.id, feedId: expiredFeedId },
  ),
});
assert(expiredAttributedOpens.length === 0, 'Expired served evidence was accepted for open attribution');
pass('served attribution expires after 30 minutes');

for (const [eventType, extra] of [
  ['progress_milestone', { engagedSeconds: 6, maxProgress: 25 }],
  ['progress_milestone', { engagedSeconds: 8, maxProgress: 50 }],
  ['engaged', { engagedSeconds: 8, maxProgress: 50 }],
  ['share', {}],
  ['not_interested', { reasonCode: 'generic' }],
]) {
  const idempotencyPrefix = eventType === 'progress_milestone' ? 'progress' : eventType;
  const event = await jsonRequest('/api/recommendation-events', {
    cookie,
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: `${idempotencyPrefix}:${runId}:${extra.maxProgress ?? 'once'}`,
      articleId: feed.body.articles[0].id,
      eventType,
      surface: 'for_you',
      feedId,
      rank: 1,
      algorithmVersion,
      occurredAt: new Date().toISOString(),
      ...extra,
    }),
  });
  assert(event.response.status === 201, `${eventType} ingestion failed`);
}
pass('progress, engaged, share and not_interested contracts persist');

const backwardsMilestone = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    idempotencyKey: `progress:backwards:${runId}:25`,
    articleId: feed.body.articles[0].id,
    eventType: 'progress_milestone',
    surface: 'for_you',
    feedId,
    rank: 1,
    algorithmVersion,
    engagedSeconds: 9,
    maxProgress: 25,
  }),
});
assert(backwardsMilestone.response.status === 400, 'Repeated or backwards progress was accepted');
pass('progress milestones must advance within the same feed');

const bookmarkAdd = await jsonRequest('/api/bookmarks', {
  cookie,
  method: 'POST',
  body: JSON.stringify({ articleId: feed.body.articles[2].id }),
});
assert(bookmarkAdd.response.status === 200, 'Bookmark add failed');
const bookmarkRemove = await jsonRequest('/api/bookmarks', {
  cookie,
  method: 'DELETE',
  body: JSON.stringify({ articleId: feed.body.articles[2].id }),
});
assert(bookmarkRemove.response.status === 200, 'Bookmark remove failed');
let directCommentStatus = 0;
try {
  await userPb.collection('comments').create({
    user: testUser.id,
    article: feed.body.articles[2].id,
    content: `direct approved ${runId}`,
    status: 'approved',
  });
} catch (error) {
  directCommentStatus = error?.status ?? 0;
}
assert(directCommentStatus === 403, 'Direct PocketBase comment creation was not locked');

const approvedAttempt = await jsonRequest('/api/comments', {
  cookie,
  method: 'POST',
  body: JSON.stringify({
    articleId: feed.body.articles[2].id,
    body: `نظر تایید نشده ${runId}`,
    status: 'approved',
  }),
});
assert(approvedAttempt.response.status === 400, 'Comment API accepted a client status field');

const commentCreate = await jsonRequest('/api/comments', {
  cookie,
  method: 'POST',
  body: JSON.stringify({ articleId: feed.body.articles[2].id, body: `نظر تست محلی ${runId}` }),
});
assert(commentCreate.response.status === 200, 'Comment create failed');
const pendingComment = await adminPb.collection('comments').getFirstListItem(
  adminPb.filter('user = {:userId} && content = {:content}', {
    userId: testUser.id,
    content: `نظر تست محلی ${runId}`,
  }),
);
assert(pendingComment.status === 'pending', 'New comment was not forced to pending');
const otherUser = await adminPb.collection('users').create({
  email: `other-${runId}@fanzoom.local`,
  password: `OtherLocal-${runId}!Z9`,
  passwordConfirm: `OtherLocal-${runId}!Z9`,
  verified: true,
  displayName: 'Other integration user',
});
const otherComment = await adminPb.collection('comments').create({
  user: otherUser.id,
  article: feed.body.articles[2].id,
  content: `other pending ${runId}`,
  status: 'pending',
});
let otherCommentUpdateStatus = 0;
try {
  await userPb.collection('comments').update(otherComment.id, { status: 'approved' });
} catch (error) {
  otherCommentUpdateStatus = error?.status ?? 0;
}
assert(otherCommentUpdateStatus === 403, 'User changed another user comment');
const trustedEvents = await adminPb.collection('recommendation_events').getFullList({
  filter: adminPb.filter(
    'userId = {:userId} && (eventType = "bookmark_add" || eventType = "bookmark_remove" || eventType = "comment")',
    { userId: testUser.id },
  ),
});
assert(new Set(trustedEvents.map((event) => event.eventType)).size === 3, 'Trusted interaction events are incomplete');
pass('comment creation is server-only, pending and not user-moderatable');
pass('bookmark and pending comment flows create trusted events');

let privateReadStatus = 0;
try {
  await userPb.collection('recommendation_events').getList(1, 1);
} catch (error) {
  privateReadStatus = error?.status ?? 0;
}
assert(privateReadStatus === 403, 'Authenticated client can read private recommendation_events');
let privateWriteStatus = 0;
try {
  await userPb.collection('recommendation_events').create({
    ...impressionBody,
    idempotencyKey: `direct-write:${runId}`,
    eventId: crypto.randomUUID(),
    userId: testUser.id,
    receivedAt: new Date().toISOString(),
  });
} catch (error) {
  privateWriteStatus = error?.status ?? 0;
}
assert(privateWriteStatus === 403, 'Authenticated client can write private recommendation_events');
pass('PocketBase collection denies direct client read and write');

const initialViews = Number((await adminPb.collection('articles').getOne(article.id)).views ?? 0);
const invalidView = await jsonRequest('/api/views', {
  method: 'POST',
  body: JSON.stringify({ id: 'invalid' }),
});
assert(invalidView.response.status === 400, 'Invalid view ID must return 400');
assert(!invalidView.response.headers.get('set-cookie'), 'Invalid article ID minted a visitor cookie');
const bootstrapArticle = articles.find((item) => item.id !== article.id);
assert(bootstrapArticle, 'A second article is required for visitor cookie bootstrap');
const visitorBootstrap = await jsonRequest('/api/views', {
  method: 'POST',
  headers: { 'User-Agent': `fanzoom-integration-${runId}` },
  body: JSON.stringify({ id: bootstrapArticle.id }),
});
assert(visitorBootstrap.response.status === 200, 'Valid view visitor bootstrap failed');
const visitorSetCookie = visitorBootstrap.response.headers.get('set-cookie') ?? '';
const visitorCookieMatch = visitorSetCookie.match(/fz_view_visitor=([^;]+)/);
assert(visitorCookieMatch && /httponly/i.test(visitorSetCookie), 'Signed HttpOnly visitor cookie was not issued');
const sameVisitorCookie = `fz_view_visitor=${visitorCookieMatch[1]}`;

const sameVisitorResponses = await Promise.all(
  Array.from({ length: 20 }, () => jsonRequest('/api/views', {
    cookie: sameVisitorCookie,
    method: 'POST',
    body: JSON.stringify({ id: article.id }),
  })),
);
const sameVisitorCounted = sameVisitorResponses.filter((item) => item.body?.counted === true).length;
assert(sameVisitorCounted === 1, 'Same visitor concurrent views were counted more than once');
const afterDedupeViews = Number((await adminPb.collection('articles').getOne(article.id)).views ?? 0);
assert(afterDedupeViews === initialViews + 1, 'View dedupe count does not match stored value');
pass('concurrent same-visitor views are deduplicated');

let afterConcurrentViews = afterDedupeViews;
for (let round = 1; round <= 3; round += 1) {
  const uniqueCookies = Array.from({ length: 20 }, (_, index) =>
    createTestViewVisitorCookie(`fanzoom-atomic-${runId}-${round}-${index}`));
  const beforeRound = Number((await adminPb.collection('articles').getOne(article.id)).views ?? 0);
  const uniqueVisitorResponses = await Promise.all(
    uniqueCookies.map((visitorCookie) => jsonRequest('/api/views', {
      cookie: visitorCookie,
      method: 'POST',
      body: JSON.stringify({ id: article.id }),
    })),
  );
  const counted = uniqueVisitorResponses.filter((item) => item.body?.counted === true);
  afterConcurrentViews = Number((await adminPb.collection('articles').getOne(article.id)).views ?? 0);
  const delta = afterConcurrentViews - beforeRound;
  const responseCounts = counted.map((item) => Number(item.body.views));
  assert(counted.length === 20, `Concurrency round ${round} did not count all 20 visitors`);
  assert(delta === 20, `Concurrency round ${round} stored delta ${delta} instead of 20`);
  assert(new Set(responseCounts).size === 20, `Concurrency round ${round} returned duplicate view counts`);
  assert(Math.max(...responseCounts) === afterConcurrentViews, `Concurrency round ${round} response count was stale`);
  pass(`PocketBase atomic increment round ${round}: responses=20 stored_delta=20`);
}

const spoofCookie = createTestViewVisitorCookie(`fanzoom-xff-spoof-${runId}`);
const beforeSpoof = Number((await adminPb.collection('articles').getOne(article.id)).views ?? 0);
const spoofResponses = await Promise.all(
  Array.from({ length: 20 }, (_, index) => jsonRequest('/api/views', {
    cookie: spoofCookie,
    method: 'POST',
    headers: { 'X-Forwarded-For': `198.51.100.${index + 1}` },
    body: JSON.stringify({ id: article.id }),
  })),
);
const spoofCounted = spoofResponses.filter((item) => item.body?.counted === true).length;
const afterSpoof = Number((await adminPb.collection('articles').getOne(article.id)).views ?? 0);
assert(spoofCounted === 1, 'Changing X-Forwarded-For created a new signed visitor identity');
assert(afterSpoof - beforeSpoof === 1, 'X-Forwarded-For spoof changed the stored view delta');
pass('client X-Forwarded-For spoofing cannot create a new visitor');

let servedRateLimited = null;
for (let index = 0; index < 35; index += 1) {
  const attempt = await jsonRequest('/api/recommendation-events/served', {
    cookie,
    method: 'POST',
    body: JSON.stringify(batchBody),
  });
  if (attempt.response.status === 429) {
    servedRateLimited = attempt;
    break;
  }
}
assert(servedRateLimited?.body?.error === 'rate_limited', 'Served batch rate limit did not return 429');
assert(Number(servedRateLimited.response.headers.get('retry-after')) >= 1, 'Served rate limit lacks Retry-After');
pass('served batch rate limit returns 429 and Retry-After');

let invalidEventRateLimited = null;
for (let index = 0; index < 130; index += 1) {
  const attempt = await jsonRequest('/api/recommendation-events', {
    cookie,
    method: 'POST',
    body: JSON.stringify({ invalid: index }),
  });
  if (attempt.response.status === 429) {
    invalidEventRateLimited = attempt;
    break;
  }
}
assert(invalidEventRateLimited?.body?.error === 'rate_limited', 'Invalid payload flood did not return 429');
assert(Number(invalidEventRateLimited.response.headers.get('retry-after')) >= 1, 'Invalid flood lacks Retry-After');
const duplicateAfterLimit = await jsonRequest('/api/recommendation-events', {
  cookie,
  method: 'POST',
  body: JSON.stringify(impressionBody),
});
assert(duplicateAfterLimit.response.status === 429, 'Duplicate bypassed an exhausted user rate limit');
pass('invalid payloads and duplicates cannot bypass an exhausted user limit');

const duplicateFloodEmail = `duplicate-${runId}@fanzoom.local`;
const duplicateFloodPassword = `DuplicateLocal-${runId}!Z9`;
const duplicateFloodUser = await adminPb.collection('users').create({
  email: duplicateFloodEmail,
  password: duplicateFloodPassword,
  passwordConfirm: duplicateFloodPassword,
  verified: true,
  displayName: 'Duplicate flood user',
  personalizationEnabled: true,
  personalizationConsentAt: new Date().toISOString(),
});
const duplicateFloodLogin = await jsonRequest('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: duplicateFloodEmail, password: duplicateFloodPassword }),
});
const duplicateFloodSetCookie = duplicateFloodLogin.response.headers.get('set-cookie') ?? '';
const duplicateFloodCookieMatch = duplicateFloodSetCookie.match(/pb_auth=([^;]+)/);
assert(duplicateFloodCookieMatch, 'Duplicate flood user did not receive a session');
const duplicateFloodCookie = `pb_auth=${duplicateFloodCookieMatch[1]}`;
const duplicateFloodBody = {
  idempotencyKey: `share:duplicate-flood:${runId}`,
  articleId: article.id,
  eventType: 'share',
  surface: 'article',
  occurredAt: new Date().toISOString(),
};
const duplicateFloodFirst = await jsonRequest('/api/recommendation-events', {
  cookie: duplicateFloodCookie,
  method: 'POST',
  body: JSON.stringify(duplicateFloodBody),
});
assert(duplicateFloodFirst.response.status === 201, 'Duplicate flood setup event failed');
let duplicateFloodLimited = null;
for (let index = 0; index < 130; index += 1) {
  const attempt = await jsonRequest('/api/recommendation-events', {
    cookie: duplicateFloodCookie,
    method: 'POST',
    body: JSON.stringify(duplicateFloodBody),
  });
  if (attempt.response.status === 429) {
    duplicateFloodLimited = attempt;
    break;
  }
}
assert(duplicateFloodLimited?.body?.error === 'rate_limited', 'Duplicate flood did not return 429');
assert(Number(duplicateFloodLimited.response.headers.get('retry-after')) >= 1, 'Duplicate flood lacks Retry-After');
const duplicateRows = await adminPb.collection('recommendation_events').getFullList({
  filter: adminPb.filter(
    'userId = {:userId} && idempotencyKey = {:idempotencyKey}',
    { userId: duplicateFloodUser.id, idempotencyKey: duplicateFloodBody.idempotencyKey },
  ),
});
assert(duplicateRows.length === 1, 'Duplicate flood created more than one event');
pass('duplicate flood is bounded and remains idempotent');

await adminPb.collection('users').update(testUser.id, {
  personalizationEnabled: false,
});
pass('integration user returned to opt-out state');

console.log(`\nIntegration assertions passed: ${results.length}`);
if (functionalFailures.length > 0) {
  console.error(`Functional failures: ${functionalFailures.length}`);
  for (const failure of functionalFailures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
if (securityFindings.length > 0) {
  console.error(`Security findings: ${securityFindings.length}`);
  for (const finding of securityFindings) console.error(`- ${finding}`);
  if (!process.exitCode) process.exitCode = 2;
}
} catch (error) {
  const status = error?.status ? ` (status ${error.status})` : '';
  console.error(`❌ Integration test failed${status}: ${error?.message ?? String(error)}`);
  process.exitCode = 1;
}
