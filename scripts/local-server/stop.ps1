. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DockerReady
Assert-LocalServerConfigured
Invoke-LocalCompose -ComposeArgs @('stop')
Write-Host 'Local server stopped. Persistent volumes were retained.'
