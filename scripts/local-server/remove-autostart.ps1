$taskName = 'ShopMateLocalServer'
& schtasks.exe /Delete /TN $taskName /F 2>$null
$taskRemoved = $LASTEXITCODE -eq 0

$startup = [Environment]::GetFolderPath('Startup')
$launcher = if ($startup) { Join-Path $startup "$taskName.cmd" } else { $null }
$launcherRemoved = $false
if ($launcher -and (Test-Path -LiteralPath $launcher)) {
    Remove-Item -LiteralPath $launcher -Force
    $launcherRemoved = $true
}

if (-not $taskRemoved -and -not $launcherRemoved) {
    throw 'No local-server autostart registration was found.'
}
Write-Host "Removed local-server autostart registration."
