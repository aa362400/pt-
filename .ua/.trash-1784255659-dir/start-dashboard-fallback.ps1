$ErrorActionPreference = 'Stop'
$plugin = 'C:\Users\1\.understand-anything\repo\understand-anything-plugin'
$dashboard = Join-Path $plugin 'packages\dashboard'
$project = 'C:\Users\1\.understand-anything\repo\understand-anything-plugin\.ua-project-target'
$npx = (Get-Command npx.cmd).Source
$stdout = Join-Path $plugin '.ua-dashboard-v2.out.log'
$stderr = Join-Path $plugin '.ua-dashboard-v2.err.log'
$env:GRAPH_DIR = $project

$process = Start-Process -FilePath $npx `
  -ArgumentList @('vite', '--host', '127.0.0.1', '--port', '5174', '--strictPort') `
  -WorkingDirectory $dashboard `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Write-Output "PID=$($process.Id)"
$dashboardUrl = $null
for ($attempt = 0; $attempt -lt 90; $attempt++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path -LiteralPath $stdout) {
    $content = Get-Content -Raw -ErrorAction SilentlyContinue -LiteralPath $stdout
    $match = [regex]::Match($content, 'Dashboard URL:\s*(http://127\.0\.0\.1:\d+/?\?token=\S+)')
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
