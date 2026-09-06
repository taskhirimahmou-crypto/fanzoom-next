[CmdletBinding()]
param(
    [string]$OutputRoot = ".local-observability/release-bundles"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputRoot))
$workspacePrefix = $workspace.TrimEnd('\') + '\'
if (-not $resolvedRoot.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputRoot must remain inside the workspace."
}

New-Item -ItemType Directory -Force -Path $resolvedRoot | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$bundleDirectory = Join-Path $resolvedRoot "fanzoom-pocketbase-0.30.0-$stamp"

Push-Location $workspace
try {
    & node "scripts/deployment/build-pocketbase-release.mjs" --output $bundleDirectory
    if ($LASTEXITCODE -ne 0) { throw "Bundle validation failed." }

    $zipPath = "$bundleDirectory.zip"
    Compress-Archive -LiteralPath $bundleDirectory -DestinationPath $zipPath -CompressionLevel Optimal
    $zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
    [System.IO.File]::WriteAllText("$zipPath.sha256", "$zipHash  $([System.IO.Path]::GetFileName($zipPath))`n", [System.Text.UTF8Encoding]::new($false))

    $verificationDirectory = Join-Path $resolvedRoot "verify-$stamp"
    Expand-Archive -LiteralPath $zipPath -DestinationPath $verificationDirectory
    $expandedBundle = Join-Path $verificationDirectory ([System.IO.Path]::GetFileName($bundleDirectory))
    $manifest = Get-Content -Raw -LiteralPath (Join-Path $expandedBundle "manifest.json") | ConvertFrom-Json
    foreach ($file in $manifest.files) {
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $expandedBundle $file.path)).Hash.ToLowerInvariant()
        if ($actual -ne $file.sha256) { throw "Archive verification failed for $($file.path)." }
    }
    Remove-Item -LiteralPath $verificationDirectory -Recurse -Force

    [pscustomobject]@{
        BundleDirectory = $bundleDirectory
        ZipPath = $zipPath
        ZipSha256 = $zipHash
        MigrationCount = $manifest.counts.migrations
        HookCount = $manifest.counts.hooks
    } | Format-List
}
finally {
    Pop-Location
}
