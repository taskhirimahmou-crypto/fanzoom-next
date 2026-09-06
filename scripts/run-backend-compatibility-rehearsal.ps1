param(
  [Parameter(Mandatory = $true)][string]$SchemaPath,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [ValidatePattern('^\d+\.\d+\.\d+$')][string]$PocketBaseVersion = '0.40.0',
  [ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ExpectedSchemaSha256 = '',
  [switch]$KeepEnvironment
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$composeFile = (Resolve-Path -LiteralPath (Join-Path $workspace 'compose.backend-rehearsal.yml')).Path
$resolvedSchema = (Resolve-Path -LiteralPath $SchemaPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)

if (-not $composeFile.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to use a compose file outside the Fanzoom workspace.'
}
if (-not $resolvedSchema.EndsWith('.json', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'The rehearsal schema must be a JSON file.'
}
$actualSchemaSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedSchema).Hash.ToLowerInvariant()
if ($ExpectedSchemaSha256 -and $actualSchemaSha256 -ne $ExpectedSchemaSha256.ToLowerInvariant()) {
  throw "Schema SHA-256 mismatch. Expected $ExpectedSchemaSha256; received $actualSchemaSha256"
}
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

function New-RehearsalSecret {
  $bytes = New-Object byte[] 48
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes)
}

function Wait-PocketBase {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri "$env:PB_REHEARSAL_URL/api/health" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return }
    } catch {}
    Start-Sleep -Seconds 1
  }
  throw 'The isolated PocketBase did not become healthy.'
}

function Wait-Next {
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri "$env:PB_REHEARSAL_WEB_URL/api/health" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return }
    } catch {}
    Start-Sleep -Seconds 1
  }
  throw 'The isolated Next.js application did not become healthy.'
}

function Invoke-RehearsalNode([string]$Mode) {
  & node (Join-Path $workspace 'scripts/backend-rehearsal/run.mjs') $Mode
  if ($LASTEXITCODE -ne 0) { throw "Backend rehearsal phase failed: $Mode" }
}

$env:PB_REHEARSAL_URL = 'http://127.0.0.1:18090'
$env:PB_REHEARSAL_PORT = '18090'
$env:PB_REHEARSAL_WEB_URL = 'http://127.0.0.1:18100'
$env:PB_REHEARSAL_WEB_PORT = '18100'
$env:PB_REHEARSAL_VERSION = $PocketBaseVersion
$env:PB_REHEARSAL_EXPECTED_SCHEMA_SHA256 = if ($ExpectedSchemaSha256) { $ExpectedSchemaSha256.ToLowerInvariant() } else { $actualSchemaSha256 }
$env:PB_REHEARSAL_SCHEMA_PATH = $resolvedSchema
$env:PB_REHEARSAL_OUTPUT_DIR = $resolvedOutput
$env:PB_REHEARSAL_SUPERUSER_EMAIL = 'rehearsal-superuser@fanzoom.local'
$env:PB_REHEARSAL_SUPERUSER_PASSWORD = New-RehearsalSecret
$env:PB_REHEARSAL_VIEW_SECRET = New-RehearsalSecret
$env:PB_REHEARSAL_HOOK_SECRET = New-RehearsalSecret
$env:PB_REHEARSAL_HOOK_SECRET_PREVIOUS = New-RehearsalSecret
$env:PB_REHEARSAL_KEY_SECRET = New-RehearsalSecret
$env:PB_REHEARSAL_FIXTURE_PASSWORD = "Local-Rehearsal-$([guid]::NewGuid().ToString('N'))!9"
$compose = @('compose', '-f', $composeFile)

try {
  # Only the fixed, isolated rehearsal project and its named volume are reset.
  & docker @compose down --volumes --remove-orphans
  if ($LASTEXITCODE -ne 0) { throw 'Could not reset the isolated rehearsal stack.' }

  $env:PB_REHEARSAL_MODE = 'legacy'
  & docker @compose build pocketbase web
  if ($LASTEXITCODE -ne 0) { throw 'Could not build the isolated rehearsal images.' }

  $pocketBaseImage = 'fanzoom-backend-rehearsal-pocketbase:latest'
  $versionOutput = (& docker run --rm --entrypoint /pb/pocketbase $pocketBaseImage --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the PocketBase executable version.' }
  if ($versionOutput -notmatch "(?m)(^|\s)v?$([regex]::Escape($PocketBaseVersion))(\s|$)") {
    throw "PocketBase executable version mismatch. Expected $PocketBaseVersion; received: $versionOutput"
  }
  $env:PB_REHEARSAL_EXECUTABLE_VERSION = $PocketBaseVersion
  $env:PB_REHEARSAL_EXECUTABLE_VERSION_RAW = $versionOutput

  & docker @compose up -d pocketbase
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the legacy-schema rehearsal container.' }
  Wait-PocketBase
  Invoke-RehearsalNode 'prepare'

  & docker @compose stop pocketbase
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop PocketBase before offline migrations.' }

  & docker @compose run --rm --no-deps --entrypoint /pb/pocketbase pocketbase migrate up --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
  if ($LASTEXITCODE -ne 0) { throw 'First migration run failed.' }
  & docker @compose run --rm --no-deps --entrypoint /pb/pocketbase pocketbase migrate up --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
  if ($LASTEXITCODE -ne 0) { throw 'Idempotent migration rerun failed.' }
  $env:PB_REHEARSAL_MIGRATION_RERUN_NOOP = 'true'

  $env:PB_REHEARSAL_MODE = 'upgraded'
  & docker @compose up -d --force-recreate pocketbase
  if ($LASTEXITCODE -ne 0) { throw 'Could not start PocketBase with production hooks.' }
  Wait-PocketBase

  & docker @compose run --rm --no-deps -e PB_REHEARSAL_MODE=upgraded -e VIEW_RATE_LIMIT_SECRET= -e SHARED_RATE_LIMIT_HOOK_SECRET= pocketbase
  if ($LASTEXITCODE -eq 0) { throw 'Upgraded PocketBase started without required secrets.' }
  $env:PB_REHEARSAL_STARTUP_SECRET_GUARD = 'true'
  Invoke-RehearsalNode 'verify'

  # Exercise the real Next.js route handlers against the same upgraded database
  # and the same PocketBase executable used for the migration rehearsal.
  & docker @compose up -d --no-deps web
  if ($LASTEXITCODE -ne 0) { throw 'Could not start Next.js for the application-path rehearsal.' }
  Wait-Next
  & docker @compose exec -T `
    -e LOCAL_APP_URL=http://web:3000 `
    -e NEXT_PUBLIC_POCKETBASE_URL=http://pocketbase:8090 `
    web node scripts/test-local-integration.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Next.js application-path integration failed against the rehearsal backend.' }
  $env:PB_REHEARSAL_APP_INTEGRATION = 'true'
  Invoke-RehearsalNode 'verify-preserved'
  & docker @compose stop web
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop Next.js before rollback rehearsal.' }

  # Rollback proof uses the actual pre-migration backup and an empty migration
  # directory so the restored legacy database is not immediately upgraded again.
  & docker @compose stop pocketbase
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop PocketBase before rollback rehearsal.' }
  $env:PB_REHEARSAL_MODE = 'legacy'
  & docker @compose up -d --force-recreate pocketbase
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the restore-only PocketBase process.' }
  Wait-PocketBase
  Invoke-RehearsalNode 'restore'
  # The official restore endpoint returns before the process restart has fully
  # replaced the old listener. Avoid reading the pre-restore process instance.
  Start-Sleep -Seconds 4
  Wait-PocketBase
  Invoke-RehearsalNode 'verify-restored'

  Write-Output "REHEARSAL_REPORT=$resolvedOutput\report.json"
  Write-Output 'REHEARSAL_RESULT=PASS'
} finally {
  if (-not $KeepEnvironment) {
    & docker @compose down --volumes --remove-orphans | Out-Null
  }
  @(
    'PB_REHEARSAL_URL', 'PB_REHEARSAL_PORT', 'PB_REHEARSAL_SCHEMA_PATH',
    'PB_REHEARSAL_WEB_URL', 'PB_REHEARSAL_WEB_PORT', 'PB_REHEARSAL_VERSION',
    'PB_REHEARSAL_EXPECTED_SCHEMA_SHA256',
    'PB_REHEARSAL_EXECUTABLE_VERSION', 'PB_REHEARSAL_EXECUTABLE_VERSION_RAW',
    'PB_REHEARSAL_OUTPUT_DIR', 'PB_REHEARSAL_SUPERUSER_EMAIL',
    'PB_REHEARSAL_SUPERUSER_PASSWORD', 'PB_REHEARSAL_VIEW_SECRET',
    'PB_REHEARSAL_HOOK_SECRET', 'PB_REHEARSAL_HOOK_SECRET_PREVIOUS', 'PB_REHEARSAL_KEY_SECRET',
    'PB_REHEARSAL_FIXTURE_PASSWORD',
    'PB_REHEARSAL_MODE', 'PB_REHEARSAL_MIGRATION_RERUN_NOOP',
    'PB_REHEARSAL_STARTUP_SECRET_GUARD', 'PB_REHEARSAL_APP_INTEGRATION'
  ) | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}
