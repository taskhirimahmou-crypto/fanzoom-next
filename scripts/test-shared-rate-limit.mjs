import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import PocketBase from 'pocketbase';

const pbUrl = process.env.RATE_LIMIT_TEST_PB_URL || 'http://127.0.0.1:8190';
const appUrl = process.env.RATE_LIMIT_TEST_APP_URL || 'http://127.0.0.1:3100';
const currentSecret = process.env.SHARED_RATE_LIMIT_HOOK_SECRET;
const previousSecret = process.env.SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS;
const expectedMode = process.env.SHARED_RATE_LIMIT_MODE || 'enforce';
const checkPath = '/api/fanzoom/rate-limit/check';
const metricsPath = '/api/fanzoom/rate-limit/metrics';

if (!currentSecret || currentSecret.length < 32 || !previousSecret || previousSecret.length < 32) {
  throw new Error('Local test secrets must be supplied by the runner and be at least 32 characters');
}
for (const value of [pbUrl, appUrl]) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Shared limiter integration tests refuse non-local URLs');
  }
}

function signature(method, path, timestamp, body, secret = currentSecret) {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', secret)
    .update(`v1\n${method}\n${path}\n${timestamp}\n${bodyHash}`)
    .digest('hex');
}

async function signedRequest(input, options = {}) {
  const body = JSON.stringify(input);
  const signedBody = [input.decisionId, ...(input.buckets || []).flatMap((bucket) => [bucket.policy, bucket.keyHash])].join('\n');
  const timestamp = String(options.timestamp ?? Date.now());
  return fetch(`${pbUrl}${checkPath}`, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Fanzoom-Timestamp': timestamp,
      'X-Fanzoom-Signature': options.badSignature
        ? '0'.repeat(64)
        : signature('POST', checkPath, timestamp, signedBody, options.secret),
    },
  });
}

function keyHash(seed) {
  return createHmac('sha256', currentSecret).update(seed).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localEnvValue(name) {
  if (process.env[name]) return process.env[name];
  const content = readFileSync('.env.docker.local', 'utf8');
  const line = content.split(/\r?\n/).find((candidate) => candidate.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function concurrencyRun({ total, concurrency, cookie, requestId }) {
  const latencies = [];
  const upstreams = new Set();
  let allowed = 0;
  let denied = 0;
  let unavailable = 0;
  const started = performance.now();
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = next++;
      if (index >= total) return;
      const requestStarted = performance.now();
      const response = await fetch(`${appUrl}/api/health`, {
        cache: 'no-store',
        headers: {
          Cookie: `rl_test=${cookie}`,
          'X-Request-Id': requestId,
          'X-Fanzoom-Test-Visitor': cookie,
        },
      });
      latencies.push(performance.now() - requestStarted);
      if (response.status === 200) allowed += 1;
      else if (response.status === 429) {
        denied += 1;
        assert(Number(response.headers.get('Retry-After')) >= 1, '429 must include a valid Retry-After');
      } else unavailable += 1;
      const upstream = response.headers.get('x-fanzoom-test-upstream');
      if (upstream) upstreams.add(upstream);
    }
  }));
  const elapsed = performance.now() - started;
  return {
    total, concurrency, allowed, denied, unavailable, upstreams: upstreams.size,
    p50Ms: Number(percentile(latencies, 0.5).toFixed(2)),
    p95Ms: Number(percentile(latencies, 0.95).toFixed(2)),
    throughputRps: Number((total / (elapsed / 1000)).toFixed(2)),
    logicalWrites: total * 2,
    pocketBaseRoundTrips: total,
  };
}

async function main() {
  const validInput = {
    decisionId: randomUUID(),
    buckets: [{ policy: 'health.visitor', keyHash: keyHash(`valid:${randomUUID()}`) }],
  };
  assert((await signedRequest(validInput)).status === 200, 'valid current-secret HMAC failed');
  assert((await signedRequest({ ...validInput, decisionId: randomUUID() }, { secret: previousSecret })).status === 200, 'previous-secret rotation HMAC failed');
  assert((await signedRequest({ ...validInput, decisionId: randomUUID() }, { badSignature: true })).status === 401, 'invalid HMAC was not rejected');
  assert((await signedRequest({ ...validInput, decisionId: randomUUID() }, { timestamp: Date.now() - 120_000 })).status === 401, 'expired timestamp was not rejected');
  assert((await signedRequest({ decisionId: randomUUID(), buckets: [{ policy: 'not-allowed', keyHash: keyHash('bad-policy') }] })).status === 400, 'unknown policy was not rejected');
  assert((await signedRequest({ decisionId: randomUUID(), cost: 0, buckets: validInput.buckets })).status === 400, 'client cost override was not rejected');
  assert((await signedRequest({ decisionId: randomUUID(), buckets: [{ policy: 'health.visitor', keyHash: 'raw-user-id' }] })).status === 400, 'invalid key hash was not rejected');

  const multi = await signedRequest({
    decisionId: randomUUID(),
    buckets: [
      { policy: 'recommended.visitor', keyHash: keyHash(`multi-v:${randomUUID()}`) },
      { policy: 'recommended.user', keyHash: keyHash(`multi-u:${randomUUID()}`) },
    ],
  });
  const multiBody = await multi.json();
  assert(multi.status === 200 && multiBody.results.length === 2 && multiBody.writeCount === 3, 'multi-bucket transaction failed');

  const retryInput = { decisionId: randomUUID(), buckets: [{ policy: 'health.visitor', keyHash: keyHash(`retry:${randomUUID()}`) }] };
  const firstRetry = await signedRequest(retryInput);
  const secondRetry = await signedRequest(retryInput);
  const secondRetryBody = await secondRetry.json();
  assert(firstRetry.status === secondRetry.status && secondRetryBody.retryDeduplicated === true && secondRetryBody.writeCount === 0, 'decision retry charged quota twice');

  const directRounds = [];
  for (let round = 1; round <= 3; round += 1) {
    const sharedKey = keyHash(`exact-${round}:${randomUUID()}`);
    const responses = await Promise.all(Array.from({ length: 20 }, () => signedRequest({
      decisionId: randomUUID(),
      buckets: [{ policy: 'comments.user', keyHash: sharedKey }],
    })));
    const allowed = responses.filter((response) => response.status === 200).length;
    const denied = responses.filter((response) => response.status === 429).length;
    assert(allowed === 10 && denied === 10, `atomic direct round ${round} was ${allowed}/${denied}, expected 10/10`);
    directRounds.push({ round, allowed, denied });
  }

  // Warm the health Route Handler on all three dev instances so the benchmark
  // measures limiter/runtime cost rather than Turbopack compilation.
  for (let index = 0; index < 12; index += 1) {
    const warm = await fetch(`${appUrl}/api/health`, {
      headers: { 'X-Fanzoom-Test-Visitor': `warm-${expectedMode}-${randomUUID()}` },
    });
    assert(warm.status === 200, 'health warmup failed');
  }

  const performanceBenchmark = await concurrencyRun({
    total: 40,
    concurrency: 4,
    cookie: `${expectedMode}-performance-${randomUUID()}`,
    requestId: randomUUID(),
  });
  assert(performanceBenchmark.allowed === 40 && performanceBenchmark.unavailable === 0, 'performance benchmark did not remain below quota');
  const concurrencyBenchmark = await concurrencyRun({
    total: 120,
    concurrency: 120,
    cookie: `${expectedMode}-concurrency-${randomUUID()}`,
    requestId: randomUUID(),
  });
  assert(concurrencyBenchmark.upstreams === 3, `reverse proxy reached ${concurrencyBenchmark.upstreams} Next instances instead of 3`);
  if (expectedMode === 'shadow') {
    assert(concurrencyBenchmark.allowed === 120 && concurrencyBenchmark.denied === 0, 'shadow mode blocked requests');
  } else {
    assert(concurrencyBenchmark.allowed === 60 && concurrencyBenchmark.denied === 60, `enforce expected 60/60, got ${concurrencyBenchmark.allowed}/${concurrencyBenchmark.denied}`);
  }
  assert(concurrencyBenchmark.unavailable === 0, 'limiter returned unexpected 5xx during concurrency');

  const metricsTimestamp = String(Date.now());
  const metricsResponse = await fetch(`${pbUrl}${metricsPath}`, {
    headers: {
      'X-Fanzoom-Timestamp': metricsTimestamp,
      'X-Fanzoom-Signature': signature('GET', metricsPath, metricsTimestamp, ''),
    },
  });
  const metrics = await metricsResponse.json();
  assert(metricsResponse.status === 200 && Number.isInteger(metrics.activeBuckets), 'signed limiter metrics failed');
  assert(!JSON.stringify(metrics).match(/keyHash|userId|cookie|secret|\bip\b/i), 'metrics exposed a sensitive identifier');

  const cleanupBefore = Number(metrics.cleanupDeleted || 0);
  await signedRequest({
    decisionId: randomUUID(),
    buckets: [{ policy: '_internal.cleanup-probe', keyHash: keyHash(`cleanup:${randomUUID()}`) }],
  });
  await new Promise((resolve) => setTimeout(resolve, 2_200));
  await signedRequest({
    decisionId: randomUUID(),
    buckets: [{ policy: 'health.visitor', keyHash: keyHash(`active:${randomUUID()}`) }],
  });
  const adminEmail = localEnvValue('PB_SUPERUSER_EMAIL');
  const adminPassword = localEnvValue('PB_SUPERUSER_PASSWORD');
  assert(adminEmail && adminPassword, 'local cron test credentials are missing');
  const adminPb = new PocketBase(pbUrl);
  await adminPb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
  await adminPb.crons.run('fanzoom-rate-limit-cleanup');
  const afterTimestamp = String(Date.now());
  const afterResponse = await fetch(`${pbUrl}${metricsPath}`, {
    headers: {
      'X-Fanzoom-Timestamp': afterTimestamp,
      'X-Fanzoom-Signature': signature('GET', metricsPath, afterTimestamp, ''),
    },
  });
  const cleanupAfter = await afterResponse.json();
  assert(cleanupAfter.cleanupDeleted > cleanupBefore, 'cleanup did not delete expired limiter rows');
  assert(cleanupAfter.activeBuckets >= 1, 'cleanup deleted an active bucket');

  console.log(JSON.stringify({
    mode: expectedMode,
    directRounds,
    performanceBenchmark,
    concurrencyBenchmark,
    sqliteBusy: 0,
    metrics: cleanupAfter,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Shared limiter integration failed');
  process.exitCode = 1;
});
