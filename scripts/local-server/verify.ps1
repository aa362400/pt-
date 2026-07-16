. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DockerReady
Assert-LocalServerConfigured

Invoke-LocalCompose -ComposeArgs @('config', '--quiet')
Invoke-LocalCompose -ComposeArgs @('ps')
$url = Get-LocalServerUrl
Wait-HttpReady -Url "$url/api/v1/ready" -TimeoutSeconds 60
Wait-HttpReady -Url $url -TimeoutSeconds 60

foreach ($service in @('postgres', 'redis', 'agent', 'backend', 'frontend', 'nginx')) {
    $stateJson = & docker inspect --format '{{json .State}}' "shopmate-local-$service"
    if ($LASTEXITCODE -ne 0) { throw "Unable to inspect runtime state for $service." }
    $state = $stateJson | ConvertFrom-Json
    if ($state.Status -ne 'running') {
        throw "$service is not running (status=$($state.Status))."
    }
    if ($null -eq $state.Health -or $state.Health.Status -ne 'healthy') {
        $health = if ($null -eq $state.Health) { 'missing' } else { $state.Health.Status }
        throw "$service is not healthy (health=$health)."
    }
}

$storageInitJson = & docker inspect --format '{{json .State}}' 'shopmate-local-backend-storage-init'
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect backend storage initialization.' }
$storageInit = $storageInitJson | ConvertFrom-Json
if ($storageInit.Status -ne 'exited' -or $storageInit.ExitCode -ne 0) {
    throw "Backend storage initialization failed (status=$($storageInit.Status), exit=$($storageInit.ExitCode))."
}

$published = @{}
foreach ($service in @('postgres', 'redis', 'backend', 'agent', 'frontend')) {
    $bindingsJson = & docker inspect --format '{{json .HostConfig.PortBindings}}' "shopmate-local-$service"
    if ($LASTEXITCODE -ne 0) { throw "Unable to inspect port bindings for $service." }
    $bindings = $bindingsJson | ConvertFrom-Json
    $published[$service] = if ($null -eq $bindings) { 0 } else { @($bindings.PSObject.Properties).Count }
}
$unsafe = @($published.GetEnumerator() | Where-Object { $_.Value -gt 0 })
if ($unsafe.Count -gt 0) {
    throw "Internal services expose host ports: $($unsafe.Name -join ', ')"
}

$nginxBindingsJson = & docker inspect --format '{{json .HostConfig.PortBindings}}' 'shopmate-local-nginx'
$nginxBindings = $nginxBindingsJson | ConvertFrom-Json
if ($null -eq $nginxBindings -or -not $nginxBindings.'80/tcp') {
    throw 'Nginx has no published host port.'
}
$gateway = $nginxBindings.'80/tcp'[0]
Write-Host ("PASS local-server health and port isolation. Gateway: {0}:{1}" -f $gateway.HostIp, $gateway.HostPort)
