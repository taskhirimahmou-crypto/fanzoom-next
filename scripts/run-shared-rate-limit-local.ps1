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

$env:SHARED_RATE_LIMIT_HOOK_SECRET = New-TestSecret
$env:SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS = New-TestSecret
$env:RATE_LIMIT_KEY_SECRET = New-TestSecret
$compose = @('compose', '-f', $resolvedCompose)

try {
  # The project name is fixed in the compose file; only its isolated named test
  # volumes are removed to prove a fresh migration.
  & docker @compose down --volumes --remove-orphans
  if ($LASTEXITCODE -ne 0) { throw 'Could not reset the isolated rate-limit test stack.' }

  $env:SHARED_RATE_LIMIT_MODE = 'shadow'
  & docker @compose up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the shadow topology.' }

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $ready = Invoke-WebRequest -Uri 'http://127.0.0.1:3100/' -UseBasicParsing -TimeoutSec 2
      if ($ready.StatusCode -lt 500) { break }
    } catch {}
    Start-Sleep -Seconds 1
  }
  & node (Join-Path $PSScriptRoot 'test-shared-rate-limit.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Shadow shared limiter tests failed.' }

  $env:SHARED_RATE_LIMIT_MODE = 'enforce'
  & docker @compose up -d --force-recreate web1 web2 web3 proxy
  if ($LASTEXITCODE -ne 0) { throw 'Could not switch the three Next instances to enforce mode.' }
  Start-Sleep -Seconds 3
  & node (Join-Path $PSScriptRoot 'test-shared-rate-limit.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Enforce shared limiter tests failed.' }

  & docker @compose exec -T pocketbase /pb/pocketbase migrate up --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
  if ($LASTEXITCODE -ne 0) { throw 'Idempotent migration rerun failed.' }

  & docker @compose stop pocketbase
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop the isolated PocketBase failure probe.' }
  $failClosedStatus = 0
  try {
    $failedClosed = Invoke-WebRequest -Uri 'http://127.0.0.1:3100/api/health' -UseBasicParsing -TimeoutSec 10
    $failClosedStatus = [int]$failedClosed.StatusCode
  } catch {
    if ($_.Exception.Response) { $failClosedStatus = [int]$_.Exception.Response.StatusCode }
  }
  if ($failClosedStatus -ne 503) { throw "PocketBase-down probe returned $failClosedStatus, expected 503." }
  & docker @compose start pocketbase
  if ($LASTEXITCODE -ne 0) { throw 'Could not restore isolated PocketBase after failure probe.' }

  $logs = & docker @compose logs --no-color web1 web2 web3
  $unlimited = @($logs | Select-String -SimpleMatch 'privileged_operation_without_shared_limiter').Count
  if ($unlimited -ne 0) { throw "Found $unlimited privileged operations without shared limiter." }
  Write-Output '{"freshMigration":true,"idempotentMigration":true,"failClosed503":true,"privilegedWithoutSharedLimiter":0}'
} finally {
  Remove-Item Env:SHARED_RATE_LIMIT_HOOK_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS -ErrorAction SilentlyContinue
  Remove-Item Env:RATE_LIMIT_KEY_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:SHARED_RATE_LIMIT_MODE -ErrorAction SilentlyContinue
}
