param([string]$Destination)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DockerReady
Assert-LocalServerConfigured

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $Destination) { $Destination = Join-Path $script:RuntimeRoot "backups\$stamp" }
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$postgresId = (& docker compose --env-file $script:EnvFile -f $script:ComposeFile ps -q postgres).Trim()
$agentId = (& docker compose --env-file $script:EnvFile -f $script:ComposeFile ps -q agent).Trim()
$backendId = (& docker compose --env-file $script:EnvFile -f $script:ComposeFile ps -q backend).Trim()
if (-not $postgresId) { throw 'PostgreSQL container is not running.' }

& docker exec $postgresId sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/shopmate-local.dump'
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
& docker cp "${postgresId}:/tmp/shopmate-local.dump" (Join-Path $Destination 'database.dump')
if ($LASTEXITCODE -ne 0) { throw 'Unable to copy database backup.' }

$sql = @'
SELECT json_build_object(
  'organizations', (SELECT count(*) FROM organizations),
  'users', (SELECT count(*) FROM users),
  'researchRuns', (SELECT count(*) FROM product_research_runs),
  'candidates', (SELECT count(*) FROM product_candidates),
  'artifacts', (SELECT count(*) FROM research_report_artifacts)
)::text;
SELECT coalesce(json_agg(json_build_object('id', id, 'hash', "contentHash") ORDER BY id)::text, '[]')
FROM research_report_artifacts;
'@
$sqlPath = Join-Path $Destination 'verification.sql'
[System.IO.File]::WriteAllText($sqlPath, $sql, [System.Text.UTF8Encoding]::new($false))
& docker cp $sqlPath "${postgresId}:/tmp/verification.sql" | Out-Null
$verification = & docker exec $postgresId sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -f /tmp/verification.sql'
if ($LASTEXITCODE -ne 0) { throw 'Backup verification query failed.' }
$verification | Set-Content -LiteralPath (Join-Path $Destination 'database-verification.txt') -Encoding UTF8

if ($agentId) {
    & docker exec $agentId sh -lc 'tar -czf /tmp/agent-runtime.tgz -C /data runtime'
    if ($LASTEXITCODE -eq 0) { & docker cp "${agentId}:/tmp/agent-runtime.tgz" (Join-Path $Destination 'agent-runtime.tgz') | Out-Null }
}
if ($backendId) {
    & docker exec $backendId sh -lc 'tar -czf /tmp/backend-uploads.tgz -C /app uploads'
    if ($LASTEXITCODE -eq 0) { & docker cp "${backendId}:/tmp/backend-uploads.tgz" (Join-Path $Destination 'backend-uploads.tgz') | Out-Null }
}

$files = Get-ChildItem -LiteralPath $Destination -File | Where-Object { $_.Name -ne 'manifest.json' }
$manifest = [ordered]@{
    schemaVersion = 'local-server-backup.v1'
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    gitRevision = (& git -C $script:PlatformRoot rev-parse HEAD).Trim()
    files = @($files | ForEach-Object {
        [ordered]@{ name = $_.Name; bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Destination 'manifest.json') -Encoding UTF8
Write-Host "Backup completed: $Destination"
