param(
    [ValidateSet('postgres','redis','backend','agent','frontend','nginx','all')]
    [string]$Service = 'all',
    [int]$Tail = 200,
    [switch]$Follow
)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DockerReady
Assert-LocalServerConfigured
$args = @('logs', '--tail', "$Tail")
if ($Follow) { $args += '-f' }
if ($Service -ne 'all') { $args += $Service }
Invoke-LocalCompose -ComposeArgs $args
