param(
    [string]$PilotOrganizationId = '',
    [string]$PlatformOrganizationId = '',
    [switch]$Force
)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DockerReady

function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if ($line -match "^$([regex]::Escape($Name))=(.*)$") {
            return $matches[1]
        }
    }
    return $null
}

$example = Join-Path $script:PlatformRoot '.env.local-server.example'
if ((Test-Path -LiteralPath $script:EnvFile) -and -not $Force) {
    Write-Host "Existing local-server configuration retained: $script:EnvFile"
} else {
    $postgresPassword = New-LocalSecret 36
    $postgresAppPassword = New-LocalSecret 36
    $accessSecret = New-LocalSecret 48
    $refreshSecret = New-LocalSecret 48
    $tempSecret = New-LocalSecret 48
    $agentKey = New-LocalSecret 48
    $webhookSecret = New-LocalSecret 32
    $encryptionKey = New-LocalSecret 32
    $adminPassword = "Sm!$((New-LocalSecret 18))"
    $activeEncryptionKeyId = 'local-server-v1'
    $keyring = "{`"$activeEncryptionKeyId`":`"$encryptionKey`"}"

    # Existing local databases contain ciphertext tied to the previous keyring.
    # Reuse it during an in-place migration so connected stores remain readable.
    $legacyEnv = Join-Path $script:PlatformRoot 'backend\.env'
    $legacyActiveKeyId = Get-EnvValue -Path $legacyEnv -Name 'ENCRYPTION_ACTIVE_KEY_ID'
    $legacyKeyring = Get-EnvValue -Path $legacyEnv -Name 'ENCRYPTION_KEYS'
    if ($legacyActiveKeyId -and $legacyKeyring) {
        $activeEncryptionKeyId = $legacyActiveKeyId
        $keyring = $legacyKeyring
        Write-Host 'Reusing the existing backend encryption keyring for local data migration.'
    }

    $content = Get-Content -LiteralPath $example -Encoding UTF8 -Raw
    $content = $content.Replace('POSTGRES_PASSWORD=__GENERATE__', "POSTGRES_PASSWORD=$postgresPassword")
    $content = $content.Replace('POSTGRES_APP_PASSWORD=__GENERATE__', "POSTGRES_APP_PASSWORD=$postgresAppPassword")
    $content = $content.Replace('JWT_ACCESS_SECRET=__GENERATE__', "JWT_ACCESS_SECRET=$accessSecret")
    $content = $content.Replace('JWT_REFRESH_SECRET=__GENERATE__', "JWT_REFRESH_SECRET=$refreshSecret")
    $content = $content.Replace('JWT_2FA_TEMP_SECRET=__GENERATE__', "JWT_2FA_TEMP_SECRET=$tempSecret")
    $content = $content.Replace('AGENT_API_KEY=__GENERATE__', "AGENT_API_KEY=$agentKey")
    $content = $content.Replace('AGENT_WEBHOOK_SECRET=__GENERATE__', "AGENT_WEBHOOK_SECRET=$webhookSecret")
    $content = $content.Replace('ENCRYPTION_ACTIVE_KEY_ID=local-server-v1', "ENCRYPTION_ACTIVE_KEY_ID=$activeEncryptionKeyId")
    $content = $content.Replace('ENCRYPTION_KEYS=__GENERATE_KEYRING__', "ENCRYPTION_KEYS=$keyring")
    $content = $content.Replace('SEED_ADMIN_PASSWORD=__GENERATE_PASSWORD__', "SEED_ADMIN_PASSWORD=$adminPassword")
    if ($PilotOrganizationId) {
        $content = $content.Replace('DAILY_PRODUCT_RESEARCH_PILOT_ORGANIZATION_IDS=', "DAILY_PRODUCT_RESEARCH_PILOT_ORGANIZATION_IDS=$PilotOrganizationId")
    }
    $resolvedPlatformOrganizationId = $PlatformOrganizationId
    if (-not $resolvedPlatformOrganizationId -and $PilotOrganizationId) {
        $resolvedPlatformOrganizationId = ($PilotOrganizationId.Split(',')[0]).Trim()
    }
    if ($resolvedPlatformOrganizationId) {
        $content = $content.Replace('PLATFORM_ORG_ID=', "PLATFORM_ORG_ID=$resolvedPlatformOrganizationId")
    }
    [System.IO.File]::WriteAllText($script:EnvFile, $content, [System.Text.UTF8Encoding]::new($false))

    New-Item -ItemType Directory -Force -Path $script:RuntimeRoot | Out-Null
    $firstLoginPath = Join-Path $script:RuntimeRoot 'first-login.txt'
    $firstLogin = @"
Local server first login
URL: http://127.0.0.1
Email: admin@shopmate.ai
Password: $adminPassword

Delete this file after the first successful login and password change.
"@
    [System.IO.File]::WriteAllText($firstLoginPath, $firstLogin, [System.Text.UTF8Encoding]::new($false))
    if (Get-Command icacls.exe -ErrorAction SilentlyContinue) {
        & icacls.exe $firstLoginPath /inheritance:r /grant:r "$env:USERNAME`:(F)" 'SYSTEM:(F)' | Out-Null
    }
    Write-Host "Generated local configuration and one-time login file: $firstLoginPath"
}

New-Item -ItemType Directory -Force -Path (Join-Path $script:RuntimeRoot 'backups') | Out-Null
& docker compose --env-file $script:EnvFile -f $script:ComposeFile config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Local-server compose validation failed.' }
Write-Host 'Local-server setup is valid. Run scripts/local-server/start.ps1.'
