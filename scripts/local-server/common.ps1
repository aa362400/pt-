Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:PlatformRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:ComposeFile = Join-Path $script:PlatformRoot 'docker-compose.local-server.yml'
$script:EnvFile = Join-Path $script:PlatformRoot '.env.local-server'
$script:RuntimeRoot = Join-Path $script:PlatformRoot '.local-server'

function Assert-DockerReady {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop is not installed or docker.exe is not on PATH.'
    }
    & docker info --format '{{.ServerVersion}}' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Desktop is not running or the current user cannot access it.'
    }
}

function Assert-LocalServerConfigured {
    if (-not (Test-Path -LiteralPath $script:EnvFile)) {
        throw "Missing $script:EnvFile. Run scripts/local-server/setup.ps1 first."
    }
}

function Invoke-LocalCompose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ComposeArgs)
    & docker compose --env-file $script:EnvFile -f $script:ComposeFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose failed with exit code $LASTEXITCODE"
    }
}

function Read-LocalServerEnv {
    $result = @{}
    Get-Content -LiteralPath $script:EnvFile -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { return }
        $key, $value = $line.Split('=', 2)
        $result[$key.Trim()] = $value.Trim()
    }
    return $result
}

function Get-LocalServerUrl {
    $envMap = Read-LocalServerEnv
    $port = if ($envMap.LOCAL_SERVER_PORT) { [int]$envMap.LOCAL_SERVER_PORT } else { 80 }
    if ($port -eq 80) { return 'http://127.0.0.1' }
    return "http://127.0.0.1:$port"
}

function Wait-HttpReady {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 240
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { return }
        } catch {
            Start-Sleep -Seconds 2
        }
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for $Url"
}

function Wait-ContainerHealthy {
    param(
        [Parameter(Mandatory = $true)][string]$ContainerName,
        [int]$TimeoutSeconds = 120
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $stateJson = & docker inspect --format '{{json .State}}' $ContainerName 2>$null
        if ($LASTEXITCODE -ne 0) {
            Start-Sleep -Seconds 2
            continue
        }
        $state = $stateJson | ConvertFrom-Json
        if ($state.Status -ne 'running') {
            throw "$ContainerName exited before becoming healthy (status=$($state.Status))."
        }
        $health = if ($null -eq $state.Health) { 'missing' } else { $state.Health.Status }
        if ($health -eq 'healthy') { return }
        if ($health -eq 'unhealthy') {
            throw "$ContainerName reported unhealthy during startup."
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for $ContainerName health."
}

function New-LocalSecret {
    param([int]$Bytes = 48)
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
