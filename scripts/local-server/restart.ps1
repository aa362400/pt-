. (Join-Path $PSScriptRoot 'common.ps1')
& (Join-Path $PSScriptRoot 'stop.ps1')
& (Join-Path $PSScriptRoot 'start.ps1') -NoBuild
