$ErrorActionPreference = 'Stop'
$plugin = 'C:\Users\1\.understand-anything\repo\understand-anything-plugin'
$project = 'G:\平台'
$package = Get-Content -Raw -Encoding UTF8 (Join-Path $plugin 'package.json') | ConvertFrom-Json
$viewer = "https://github.com/Egonex-AI/Understand-Anything/releases/download/v$($package.version)/understand-anything-viewer.tgz"
$npx = (Get-Command npx.cmd).Source
$stdout = Join-Path $project '.ua\dashboard-viewer.out.log'
$stderr = Join-Path $project '.ua\dashboard-viewer.err.log'

$process = Start-Process -FilePath $npx `
  -ArgumentList @('--yes', $viewer, $project) `
  -WorkingDirectory $plugin `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Write-Output "PID=$($process.Id)"
Write-Output "VERSION=$($package.version)"

$dashboardUrl = $null
for ($attempt = 0; $attempt -lt 90; $attempt++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path -LiteralPath $stdout) {
    $content = Get-Content -Raw -ErrorAction SilentlyContinue -LiteralPath $stdout
    $match = [regex]::Match($content, 'Dashboard URL:\s*(http://127\.0\.0\.1:\d+\?token=\S+)')
    if ($match.Success) {
      $dashboardUrl = $match.Groups[1].Value
      break
    }
  }
  $process.Refresh()
  if ($process.HasExited) { break }
}

$process.Refresh()
if ($dashboardUrl) {
  Write-Output "DASHBOARD_URL=$dashboardUrl"
  Write-Output "RUNNING=$(-not $process.HasExited)"
  exit 0
}

Write-Output 'DASHBOARD_URL='
Write-Output "EXITED=$($process.HasExited)"
if (Test-Path -LiteralPath $stdout) {
  Write-Output 'STDOUT:'
  Get-Content -LiteralPath $stdout | Select-Object -Last 50
}
if (Test-Path -LiteralPath $stderr) {
  Write-Output 'STDERR:'
  Get-Content -LiteralPath $stderr | Select-Object -Last 50
}
exit 2
