import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import PocketBase from 'pocketbase';

const appUrl = process.env.RATE_LIMIT_TEST_APP_URL || 'http://127.0.0.1:3100';
const pbUrl = process.env.RATE_LIMIT_TEST_PB_URL || 'http://127.0.0.1:8190';
const secret = process.env.SHARED_RATE_LIMIT_HOOK_SECRET;
const mode = process.env.SHARED_RATE_LIMIT_MODE || 'enforce';
const cycle = Number(process.env.RATE_LIMIT_BENCHMARK_CYCLE || 1);
const concurrencyOrder = (process.env.RATE_LIMIT_BENCHMARK_CONCURRENCY_ORDER || '1,4,20,120')
  .split(',').map(Number);
const checkPath = '/api/fanzoom/rate-limit/check';
const metricsPath = '/api/fanzoom/rate-limit/metrics';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const value of [appUrl, pbUrl]) {
  const url = new URL(value);
  assert(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname), 'Benchmark refuses non-local URLs');
}
assert(secret && secret.length >= 32, 'Runtime benchmark secret is required');
assert(['baseline', 'shadow', 'enforce'].includes(mode), 'Unknown benchmark mode');
assert(concurrencyOrder.length === 4 && concurrencyOrder.every((value) => [1, 4, 20, 120].includes(value)), 'Invalid concurrency order');

function localEnvValue(name) {
  if (process.env[name]) return process.env[name];
  const content = readFileSync('.env.docker.local', 'utf8');
  const line = content.split(/\r?\n/).find((candidate) => candidate.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

function signature(method, path, timestamp, body) {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', secret)
    .update(`v1\n${method}\n${path}\n${timestamp}\n${bodyHash}`)
    .digest('hex');
}

function keyHash(seed) {
  return createHmac('sha256', secret).update(seed).digest('hex');
}

async function signedRequest(input) {
  const body = JSON.stringify(input);
  const signedBody = [input.decisionId, ...input.buckets.flatMap((bucket) => [bucket.policy, bucket.keyHash])].join('\n');
  const timestamp = String(Date.now());
  return fetch(`${pbUrl}${checkPath}`, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Fanzoom-Timestamp': timestamp,
      'X-Fanzoom-Signature': signature('POST', checkPath, timestamp, signedBody),
    },
  });
}

async function readMetrics() {
  const timestamp = String(Date.now());
  const response = await fetch(`${pbUrl}${metricsPath}`, {
    headers: {
      'X-Fanzoom-Timestamp': timestamp,
      'X-Fanzoom-Signature': signature('GET', metricsPath, timestamp, ''),
    },
  });
  assert(response.ok, 'Could not read signed limiter metrics');
  return response.json();
}

async function benchmarkRequest(key, scenario) {
  const started = performance.now();
  const response = await fetch(`${appUrl}/api/local-test/rate-limit-benchmark`, {
    cache: 'no-store',
    headers: {
      'X-Request-Id': randomUUID(),
      'X-Fanzoom-Benchmark-Key': key,
      'X-Fanzoom-Benchmark-Scenario': scenario,
    },
  });
  const endToEndMs = performance.now() - started;
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    backendAllowed: body.backendAllowed === true,
    endToEndMs,
    hookDurationMs: Number(body.hookDurationMs || 0),
    writeCount: Number(body.writeCount || 0),
    roundTrips: Number(body.roundTrips || 0),
    upstream: response.headers.get('x-fanzoom-test-upstream') || '',
    retryAfter: Number(response.headers.get('Retry-After') || 0),
  };
}

async function runConcurrent(total, concurrency, key, scenario, cleanupPromiseFactory) {
  const samples = [];
  let next = 0;
  const started = performance.now();
  const cleanupPromise = cleanupPromiseFactory ? cleanupPromiseFactory() : Promise.resolve();
  await Promise.all([
    cleanupPromise,
    ...Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = next++;
        if (index >= total) return;
        samples.push(await benchmarkRequest(key, scenario));
      }
    }),
  ]);
  return {
    elapsedMs: performance.now() - started,
    samples,
  };
}

async function main() {
  const upstreams = new Set();
  for (let index = 0; index < 30; index += 1) {
    const warm = await benchmarkRequest(`warm-${mode}-${cycle}-${randomUUID()}`, 'allowed');
    assert(warm.status === 200, `Warm-up failed in ${mode}`);
    upstreams.add(warm.upstream);
  }
  assert(upstreams.size === 3, `Warm-up reached ${upstreams.size} Next instances instead of 3`);

  const adminPb = new PocketBase(pbUrl);
  await adminPb.collection('_superusers').authWithPassword(
    localEnvValue('PB_SUPERUSER_EMAIL'),
    localEnvValue('PB_SUPERUSER_PASSWORD'),
  );

  const cleanupProbe = {
    decisionId: randomUUID(),
    buckets: [{ policy: '_internal.cleanup-probe', keyHash: keyHash(`cleanup:${mode}:${cycle}:${randomUUID()}`) }],
  };
  assert((await signedRequest(cleanupProbe)).status === 200, 'Could not prepare cleanup contention probe');
  await new Promise((resolve) => setTimeout(resolve, 2_200));

  const metricsBefore = await readMetrics();
  const results = [];
  for (const concurrency of concurrencyOrder) {
    const scenarios = cycle % 2 === 0 ? ['saturated', 'allowed'] : ['allowed', 'saturated'];
    const scenarioRuns = {};
    for (const scenario of scenarios) {
      scenarioRuns[scenario] = await runConcurrent(
        120,
        concurrency,
        `measure-${scenario}-${mode}-${cycle}-${concurrency}-${randomUUID()}`,
        scenario,
        scenario === 'saturated' && concurrency === 120
          ? () => adminPb.crons.run('fanzoom-rate-limit-cleanup')
          : undefined,
      );
    }
    const allowedRun = scenarioRuns.allowed;
    const saturatedRun = scenarioRuns.saturated;
    const unavailable = [...allowedRun.samples, ...saturatedRun.samples]
      .filter((sample) => sample.status >= 500).length;
    assert(unavailable === 0, `${mode} concurrency ${concurrency} returned ${unavailable} unavailable responses`);
    assert(new Set(allowedRun.samples.map((sample) => sample.upstream)).size === 3, `${mode} concurrency ${concurrency} allowed scenario missed an instance`);
    assert(allowedRun.samples.every((sample) => sample.backendAllowed && sample.status === 200), `${mode} allowed scenario was not fully allowed`);

    const saturatedAllowed = saturatedRun.samples.filter((sample) => sample.backendAllowed).length;
    const saturatedDenied = saturatedRun.samples.length - saturatedAllowed;
    const saturatedHttpAllowed = saturatedRun.samples.filter((sample) => sample.status === 200).length;
    const saturatedHttpDenied = saturatedRun.samples.filter((sample) => sample.status === 429).length;
    if (mode === 'baseline') {
      assert(saturatedAllowed === 120 && saturatedHttpAllowed === 120, 'Baseline unexpectedly limited saturated scenario');
    } else {
      assert(saturatedAllowed === 60 && saturatedDenied === 60, `${mode} expected exact 60/60 saturated decisions`);
      if (mode === 'shadow') assert(saturatedHttpAllowed === 120 && saturatedHttpDenied === 0, 'Shadow blocked requests');
      if (mode === 'enforce') {
        assert(saturatedHttpAllowed === 60 && saturatedHttpDenied === 60, 'Enforce did not return exact 60/60 HTTP decisions');
        assert(saturatedRun.samples.filter((sample) => sample.status === 429).every((sample) => sample.retryAfter >= 1), 'Invalid Retry-After');
      }
    }
    const safeSamples = (samples) => samples.map((sample) => ({
      backendAllowed: sample.backendAllowed,
      endToEndMs: sample.endToEndMs,
      hookDurationMs: sample.hookDurationMs,
      writeCount: sample.writeCount,
      roundTrips: sample.roundTrips,
    }));
    results.push({
      concurrency,
      unavailable,
      scenarioOrder: scenarios,
      allowedScenario: {
        elapsedMs: allowedRun.elapsedMs,
        samples: safeSamples(allowedRun.samples),
      },
      saturatedScenario: {
        elapsedMs: saturatedRun.elapsedMs,
        backendAllowed: saturatedAllowed,
        backendDenied: saturatedDenied,
        httpAllowed: saturatedHttpAllowed,
        httpDenied: saturatedHttpDenied,
        samples: safeSamples(saturatedRun.samples),
      },
    });
  }
  const metricsAfter = await readMetrics();
  console.log(JSON.stringify({
    mode,
    cycle,
    concurrencyOrder,
    warmupRequests: 30,
    upstreams: upstreams.size,
    metricsBefore,
    metricsAfter,
    cleanupDeletedDelta: Number(metricsAfter.cleanupDeleted || 0) - Number(metricsBefore.cleanupDeleted || 0),
    results,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Controlled benchmark failed');
  process.exitCode = 1;
});
