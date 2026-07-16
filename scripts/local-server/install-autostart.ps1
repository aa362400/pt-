. (Join-Path $PSScriptRoot 'common.ps1')
Assert-LocalServerConfigured
$taskName = 'ShopMateLocalServer'
$startScript = Join-Path $PSScriptRoot 'start.ps1'
$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -NoBuild"
$taskOutput = & schtasks.exe /Create /TN $taskName /SC ONLOGON /RL LIMITED /TR $action /F 2>&1
if ($LASTEXITCODE -eq 0) {
    $taskOutput | Write-Host
    Write-Host "Installed autostart task: $taskName"
    return
}

$startup = [Environment]::GetFolderPath('Startup')
if (-not $startup) { throw 'Unable to resolve the current-user Startup folder.' }
$launcher = Join-Path $startup "$taskName.cmd"
$command = "@echo off`r`nstart `"`" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -NoBuild`r`n"
[System.IO.File]::WriteAllText($launcher, $command, [System.Text.UTF8Encoding]::new($false))
Write-Host "Task Scheduler was unavailable; installed current-user Startup launcher: $launcher"
