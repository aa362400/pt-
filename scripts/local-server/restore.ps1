param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [switch]$KeepIsolated
)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DockerReady
$resolved = (Resolve-Path -LiteralPath $BackupPath).Path
$dump = Join-Path $resolved 'database.dump'
$manifestPath = Join-Path $resolved 'manifest.json'
if (-not (Test-Path $dump) -or -not (Test-Path $manifestPath)) { throw 'Backup is missing database.dump or manifest.json.' }

$manifest = Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
foreach ($item in $manifest.files) {
    $filePath = Join-Path $resolved $item.name
    $actual = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $item.sha256) { throw "Backup hash mismatch: $($item.name)" }
}

$suffix = Get-Date -Format 'yyyyMMddHHmmss'
$container = "shopmate-restore-$suffix"
$volume = "shopmate-restore-$suffix"
$password = New-LocalSecret 36
$cleanup = -not $KeepIsolated
try {
    & docker run -d --name $container -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=$password -e POSTGRES_DB=shopmate_codex -v "${volume}:/var/lib/postgresql/data" postgres:16-alpine | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to start isolated restore database.' }
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        & docker exec $container pg_isready -U postgres -d shopmate_codex | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Isolated restore database did not become ready.' }
    & docker exec $container psql -U postgres -d shopmate_codex -c 'CREATE ROLE shopmate_app NOLOGIN;' | Out-Null
    & docker cp $dump "${container}:/tmp/database.dump" | Out-Null
    & docker exec $container pg_restore -U postgres -d shopmate_codex --no-owner --no-privileges /tmp/database.dump
    if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed.' }

    $verificationSql = Join-Path $resolved 'verification.sql'
    & docker cp $verificationSql "${container}:/tmp/verification.sql" | Out-Null
    $restored = & docker exec $container psql -U postgres -d shopmate_codex -At -f /tmp/verification.sql
    if ($LASTEXITCODE -ne 0) { throw 'Restored verification query failed.' }
    $expected = Get-Content -LiteralPath (Join-Path $resolved 'database-verification.txt') -Encoding UTF8
    $match = (($restored -join "`n").Trim() -eq ($expected -join "`n").Trim())
    $report = [ordered]@{
        schemaVersion = 'local-server-restore-evidence.v1'
        restoredAt = (Get-Date).ToUniversalTime().ToString('o')
        backupPath = $resolved
        isolatedContainer = $container
        isolatedVolume = $volume
        rowCountsAndArtifactHashesMatch = $match
        kept = [bool]$KeepIsolated
    }
    $reportPath = Join-Path $resolved "restore-evidence-$suffix.json"
    $report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
    if (-not $match) { throw "Restore data verification failed. Evidence: $reportPath" }
    Write-Host "Isolated restore verified: $reportPath"
} finally {
    if ($cleanup) {
        & docker rm -f $container 2>$null | Out-Null
        & docker volume rm $volume 2>$null | Out-Null
    }
}
