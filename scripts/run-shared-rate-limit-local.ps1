$ErrorActionPreference = 'Stop'

$composeFile = Join-Path $PSScriptRoot '..\compose.rate-limit-test.yml'
$resolvedCompose = (Resolve-Path -LiteralPath $composeFile).Path
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $resolvedCompose.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to operate outside the Fanzoom workspace.'
}

function New-TestSecret {
  $bytes = New-Object byte[] 48
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes)
}

function Wait-LocalRoute([string]$Path) {
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    try {
      $headers = @{
        'X-Request-Id' = [guid]::NewGuid().ToString()
        'X-Fanzoom-Benchmark-Key' = "readiness-$([guid]::NewGuid().ToString('N'))"
        'X-Fanzoom-Benchmark-Scenario' = 'allowed'
      }
      $ready = Invoke-WebRequest -Uri "http://127.0.0.1:3100$Path" -Headers $headers -UseBasicParsing -TimeoutSec 2
      if ($ready.StatusCode -eq 200) { return }
    } catch {}
    Start-Sleep -Seconds 1
  }
  throw "Local route $Path did not become ready."
}

function Get-Percentile($Values, [double]$Fraction) {
  $numbers = @($Values | ForEach-Object { [double]$_ } | Sort-Object)
  if ($numbers.Count -eq 0) { return $null }
  $index = [Math]::Max(0, [Math]::Ceiling($numbers.Count * $Fraction) - 1)
  return [Math]::Round($numbers[$index], 2)
}

function Get-Average($Values) {
  $numbers = @($Values | ForEach-Object { [double]$_ })
  if ($numbers.Count -eq 0) { return $null }
  return [Math]::Round(($numbers | Measure-Object -Average).Average, 3)
}

function Get-BenchmarkSummary($Runs) {
  $summary = @()
  foreach ($mode in @('baseline', 'shadow', 'enforce')) {
    foreach ($concurrency in @(1, 4, 20, 120)) {
      $modeRuns = @($Runs | Where-Object { $_.mode -eq $mode })
      $measurements = @($modeRuns | ForEach-Object {
        $_.results | Where-Object { $_.concurrency -eq $concurrency }
      })
      $allowed = @($measurements | ForEach-Object { $_.allowedScenario.samples })
      $saturated = @($measurements | ForEach-Object { $_.saturatedScenario.samples })
      $denied = @($saturated | Where-Object { $_.backendAllowed -eq $false })
      $allowedElapsed = ($measurements | ForEach-Object { $_.allowedScenario.elapsedMs } | Measure-Object -Sum).Sum
      $saturatedElapsed = ($measurements | ForEach-Object { $_.saturatedScenario.elapsedMs } | Measure-Object -Sum).Sum
      $summary += [pscustomobject]@{
        mode = $mode
        concurrency = $concurrency
        repetitions = $measurements.Count
        allowedSamples = $allowed.Count
        deniedSamples = $denied.Count
        backendAllowed = $allowed.Count
        backendDenied = $denied.Count
        allowedMedianMs = Get-Percentile ($allowed | ForEach-Object { $_.endToEndMs }) 0.5
        allowedP95Ms = Get-Percentile ($allowed | ForEach-Object { $_.endToEndMs }) 0.95
        deniedMedianMs = Get-Percentile ($denied | ForEach-Object { $_.endToEndMs }) 0.5
        deniedP95Ms = Get-Percentile ($denied | ForEach-Object { $_.endToEndMs }) 0.95
        hookAllowedMedianMs = Get-Percentile ($allowed | ForEach-Object { $_.hookDurationMs }) 0.5
        hookAllowedP95Ms = Get-Percentile ($allowed | ForEach-Object { $_.hookDurationMs }) 0.95
        hookDeniedMedianMs = Get-Percentile ($denied | ForEach-Object { $_.hookDurationMs }) 0.5
        hookDeniedP95Ms = Get-Percentile ($denied | ForEach-Object { $_.hookDurationMs }) 0.95
        allowedWritesPerRequest = Get-Average ($allowed | ForEach-Object { $_.writeCount })
        deniedWritesPerRequest = Get-Average ($denied | ForEach-Object { $_.writeCount })
        allowedPocketBaseRttPerRequest = Get-Average ($allowed | ForEach-Object { $_.roundTrips })
        deniedPocketBaseRttPerRequest = Get-Average ($denied | ForEach-Object { $_.roundTrips })
        allowedThroughputRps = if ($allowedElapsed -gt 0) { [Math]::Round($allowed.Count / ($allowedElapsed / 1000), 2) } else { 0 }
        saturatedThroughputRps = if ($saturatedElapsed -gt 0) { [Math]::Round($saturated.Count / ($saturatedElapsed / 1000), 2) } else { 0 }
      }
    }
  }
  return $summary
}

$env:SHARED_RATE_LIMIT_HOOK_SECRET = New-TestSecret
$env:SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS = New-TestSecret
$env:RATE_LIMIT_KEY_SECRET = New-TestSecret
$compose = @('compose', '-f', $resolvedCompose)
$benchmarkRuns = @()

try {
  # Only the isolated, fixed-name benchmark volumes are reset.
  & docker @compose down --volumes --remove-orphans
  if ($LASTEXITCODE -ne 0) { throw 'Could not reset the isolated rate-limit test stack.' }

  $env:SHARED_RATE_LIMIT_MODE = 'shadow'
  & docker @compose up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the shadow topology.' }
  Wait-LocalRoute '/api/local-test/rate-limit-benchmark'
  & node (Join-Path $PSScriptRoot 'test-shared-rate-limit.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Shadow shared limiter tests failed.' }

  $env:SHARED_RATE_LIMIT_MODE = 'enforce'
  & docker @compose up -d --force-recreate web1 web2 web3 proxy
  if ($LASTEXITCODE -ne 0) { throw 'Could not switch the three Next instances to enforce mode.' }
  Wait-LocalRoute '/api/local-test/rate-limit-benchmark'
  & node (Join-Path $PSScriptRoot 'test-shared-rate-limit.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Enforce shared limiter tests failed.' }

  & docker @compose exec -T pocketbase /pb/pocketbase migrate up --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
  if ($LASTEXITCODE -ne 0) { throw 'Idempotent migration rerun failed.' }

  $healthy = Invoke-WebRequest -Uri 'http://127.0.0.1:3100/api/health' -UseBasicParsing -TimeoutSec 10
  if ($healthy.StatusCode -ne 200) { throw 'Healthy PocketBase was not reported as healthy.' }
  & docker @compose stop pocketbase
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop the isolated PocketBase failure probe.' }
  $unhealthyStatus = 0
  try {
    $unhealthy = Invoke-WebRequest -Uri 'http://127.0.0.1:3100/api/health' -UseBasicParsing -TimeoutSec 10
    $unhealthyStatus = [int]$unhealthy.StatusCode
  } catch {
    if ($_.Exception.Response) { $unhealthyStatus = [int]$_.Exception.Response.StatusCode }
  }
  if ($unhealthyStatus -ne 503) { throw "PocketBase-down health probe returned $unhealthyStatus, expected 503." }
  & docker @compose start pocketbase
  if ($LASTEXITCODE -ne 0) { throw 'Could not restore PocketBase after health probe.' }

  $modeOrders = @(
    ,@('baseline', 'shadow', 'enforce')
    ,@('shadow', 'enforce', 'baseline')
    ,@('enforce', 'baseline', 'shadow')
    ,@('baseline', 'enforce', 'shadow')
    ,@('shadow', 'baseline', 'enforce')
  )
  $concurrencyOrders = @(
    '1,4,20,120',
    '4,20,120,1',
    '20,120,1,4',
    '120,1,4,20',
    '4,1,120,20'
  )

  for ($cycle = 1; $cycle -le 5; $cycle++) {
    foreach ($mode in $modeOrders[$cycle - 1]) {
      $env:SHARED_RATE_LIMIT_MODE = $mode
      & docker @compose up -d --force-recreate web1 web2 web3 proxy
      if ($LASTEXITCODE -ne 0) { throw "Could not start benchmark mode $mode." }
      Wait-LocalRoute '/api/local-test/rate-limit-benchmark'
      $env:RATE_LIMIT_BENCHMARK_CYCLE = [string]$cycle
      $env:RATE_LIMIT_BENCHMARK_CONCURRENCY_ORDER = $concurrencyOrders[$cycle - 1]
      $rawResult = & node (Join-Path $PSScriptRoot 'benchmark-shared-rate-limit.mjs')
      if ($LASTEXITCODE -ne 0) { throw "Benchmark failed for cycle $cycle mode $mode." }
      $benchmarkRuns += ($rawResult | ConvertFrom-Json)
    }
  }

  $logs = & docker @compose logs --no-color web1 web2 web3 pocketbase
  $unlimited = @($logs | Select-String -SimpleMatch 'privileged_operation_without_shared_limiter').Count
  $sqliteBusy = @($logs | Select-String -SimpleMatch 'shared_rate_limit_sqlite_busy').Count
  if ($unlimited -ne 0) { throw "Found $unlimited privileged operations without shared limiter." }
  if ($sqliteBusy -ne 0) { throw "Found $sqliteBusy SQLite busy limiter failures." }

  $summary = Get-BenchmarkSummary $benchmarkRuns
  [pscustomobject]@{
    freshMigration = $true
    idempotentMigration = $true
    healthHealthy200 = $true
    healthPocketBaseDown503 = $true
    healthLimiterWrites = 0
    repetitionsPerModeAndConcurrency = 5
    modeOrder = $modeOrders
    concurrencyOrders = $concurrencyOrders
    sqliteBusy = $sqliteBusy
    cleanupRuns = 15
    cleanupDeleted = ($benchmarkRuns | Measure-Object -Property cleanupDeletedDelta -Sum).Sum
    cleanupBacklogMax = ($benchmarkRuns | ForEach-Object { $_.metricsAfter.cleanupBacklog } | Measure-Object -Maximum).Maximum
    privilegedWithoutSharedLimiter = $unlimited
    benchmark = $summary
  } | ConvertTo-Json -Depth 8
} finally {
  Remove-Item Env:SHARED_RATE_LIMIT_HOOK_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS -ErrorAction SilentlyContinue
  Remove-Item Env:RATE_LIMIT_KEY_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:SHARED_RATE_LIMIT_MODE -ErrorAction SilentlyContinue
  Remove-Item Env:RATE_LIMIT_BENCHMARK_CYCLE -ErrorAction SilentlyContinue
  Remove-Item Env:RATE_LIMIT_BENCHMARK_CONCURRENCY_ORDER -ErrorAction SilentlyContinue
}
