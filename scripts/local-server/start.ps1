param([switch]$NoBuild)

. (Join-Path $PSScriptRoot 'common.ps1')

New-Item -ItemType Directory -Force -Path $script:RuntimeRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $script:PlatformRoot 'backend\.agent-runtime\enterprise-readiness') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $script:PlatformRoot 'backend\.agent-runtime\judge-approval') | Out-Null
$startLog = Join-Path $script:RuntimeRoot 'start.log'
function Write-StartCheckpoint([string]$Message) {
    Add-Content -LiteralPath $startLog -Encoding UTF8 -Value ("{0:o} {1}" -f (Get-Date), $Message)
}

Write-StartCheckpoint 'start requested'
Assert-DockerReady
Write-StartCheckpoint 'docker ready'
Assert-LocalServerConfigured

if ($NoBuild) {
    Invoke-LocalCompose -ComposeArgs @('up', '-d')
} else {
    Invoke-LocalCompose -ComposeArgs @('up', '-d', '--build')
}
Write-StartCheckpoint 'compose up complete'

# Re-resolve service addresses after agent/backend/frontend containers are recreated.
Invoke-LocalCompose -ComposeArgs @('restart', 'nginx')
Write-StartCheckpoint 'nginx restarted after upstream recreation'
Wait-ContainerHealthy -ContainerName 'shopmate-local-nginx' -TimeoutSeconds 120
Write-StartCheckpoint 'nginx container health complete'

$url = Get-LocalServerUrl
Wait-HttpReady -Url "$url/api/v1/ready" -TimeoutSeconds 360
Write-StartCheckpoint 'gateway ready endpoint complete'

$envMap = Read-LocalServerEnv
$postgresUser = if ($envMap.POSTGRES_USER) { $envMap.POSTGRES_USER } else { 'postgres' }
$postgresDb = if ($envMap.POSTGRES_DB) { $envMap.POSTGRES_DB } else { 'shopmate_codex' }
$userCount = (& docker compose --env-file $script:EnvFile -f $script:ComposeFile exec -T postgres psql -U $postgresUser -d $postgresDb -Atc 'SELECT count(*) FROM users;' | Select-Object -Last 1).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect bootstrap user state.' }
Write-StartCheckpoint "bootstrap user count inspected: $userCount"
if ($userCount -eq '0') {
    Invoke-LocalCompose -ComposeArgs @('exec', '-T', 'backend', 'npm', 'run', 'db:seed')
    Write-StartCheckpoint 'fresh database seed complete'
} else {
    $firstLoginPath = Join-Path $script:RuntimeRoot 'first-login.txt'
    if (Test-Path -LiteralPath $firstLoginPath) {
        if (Get-Command icacls.exe -ErrorAction SilentlyContinue) {
            & icacls.exe $firstLoginPath /grant:r "$env:USERNAME`:(F)" | Out-Null
        }
        Remove-Item -LiteralPath $firstLoginPath -Force
        Write-Host 'Existing users retained; removed the fresh-database one-time login file.'
    }
}

Wait-HttpReady -Url $url -TimeoutSeconds 60
Write-StartCheckpoint 'frontend gateway complete'
Write-Host "Local server is ready: $url"
Write-Host "Readiness: $url/api/v1/ready"
