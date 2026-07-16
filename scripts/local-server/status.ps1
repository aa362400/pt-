. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DockerReady
Assert-LocalServerConfigured
Invoke-LocalCompose -ComposeArgs @('ps')

$url = Get-LocalServerUrl
foreach ($endpoint in @('/', '/api/v1/health', '/api/v1/ready')) {
    try {
        $response = Invoke-WebRequest -Uri "$url$endpoint" -UseBasicParsing -TimeoutSec 10
        Write-Host ("PASS {0} {1}" -f $response.StatusCode, "$url$endpoint")
    } catch {
        Write-Host ("FAIL {0}: {1}" -f "$url$endpoint", $_.Exception.Message)
    }
}

$lanAddresses = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object {
        $_.NetAdapter.Status -eq 'Up' -and
        $null -ne $_.IPv4DefaultGateway -and
        $_.InterfaceAlias -notmatch 'vEthernet|Docker|Loopback|WSL|tun|tap|vpn' -and
        $_.NetAdapter.InterfaceDescription -notmatch 'Virtual|Tunnel|TUN|TAP|VPN'
    } |
    ForEach-Object { $_.IPv4Address.IPAddress } |
    Where-Object { $_ -and $_ -notlike '127.*' -and $_ -notlike '169.254*' } |
    Select-Object -Unique
foreach ($address in $lanAddresses) {
    $port = ([Uri]$url).Port
    $lanUrl = if ($port -eq 80) { "http://$address" } else { "http://${address}:$port" }
    try {
        $response = Invoke-WebRequest -Uri "$lanUrl/api/v1/ready" -UseBasicParsing -TimeoutSec 5
        Write-Host ("PASS LAN {0} {1}" -f $response.StatusCode, $lanUrl)
    } catch {
        Write-Host ("FAIL LAN {0}: {1}" -f $lanUrl, $_.Exception.Message)
    }
}

$envMap = Read-LocalServerEnv
$scheduleSql = @"
SELECT status || '|' || coalesce(to_jsonb(automation_flows)->>'nextRunAt','') || '|' ||
       coalesce(to_jsonb(automation_flows)->'triggerConfig'->>'dailyAt','') || '|' ||
       coalesce(to_jsonb(automation_flows)->'triggerConfig'->>'timezone','')
FROM automation_flows
WHERE to_jsonb(automation_flows)->'triggerConfig'->>'source' = 'daily_product_research'
ORDER BY to_jsonb(automation_flows)->>'createdAt' DESC
LIMIT 1;
"@
$schedule = & docker exec shopmate-local-postgres psql -U $envMap.POSTGRES_USER -d $envMap.POSTGRES_DB -Atc $scheduleSql
if ($LASTEXITCODE -eq 0 -and $schedule) {
    $status, $nextRunAt, $dailyAt, $timezone = $schedule.Trim().Split('|', 4)
    Write-Host "Daily research: status=$status nextRunAtUtc=$nextRunAt dailyAt=$dailyAt timezone=$timezone"
} else {
    Write-Host 'Daily research: no persisted schedule found.'
}

$driveName = [System.IO.Path]::GetPathRoot($script:PlatformRoot).TrimEnd('\')
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$driveName'" -ErrorAction SilentlyContinue
if ($disk) {
    Write-Host ("Disk {0} free={1:N1} GB total={2:N1} GB" -f $driveName, ($disk.FreeSpace / 1GB), ($disk.Size / 1GB))
}

$startupLauncher = Join-Path ([Environment]::GetFolderPath('Startup')) 'ShopMateLocalServer.cmd'
$scheduledTask = Get-ScheduledTask -TaskName ShopMateLocalServer -ErrorAction SilentlyContinue
if ($scheduledTask) {
    Write-Host 'Autostart: Task Scheduler registration present.'
} elseif (Test-Path -LiteralPath $startupLauncher) {
    Write-Host "Autostart: current-user Startup launcher present at $startupLauncher"
} else {
    Write-Host 'Autostart: NOT_INSTALLED'
}
