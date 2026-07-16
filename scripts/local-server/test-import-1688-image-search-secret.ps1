[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot 'import-1688-image-search-secret.ps1'
$root = Join-Path ([System.IO.Path]::GetTempPath()) ("shopmate-1688-secret-test-" + [guid]::NewGuid().ToString('N'))
$document = Join-Path $root 'api.md'
$environment = Join-Path $root '.env'
$fakeToken = 'test-only-token-1234567890'
$tokenLabel = "$([char]0x7EA6)$([char]0x5B9A) Token$([char]0xFF1A)"
$encoding = [System.Text.UTF8Encoding]::new($false)

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

try {
  New-Item -ItemType Directory -Path $root | Out-Null
  [System.IO.File]::WriteAllText(
    $document,
    "# Contract`n`n$tokenLabel`n`n``````text`n$fakeToken`n```````n",
    $encoding
  )
  [System.IO.File]::WriteAllText($environment, "EXISTING=value`n", $encoding)

  $result = & $helper -DocumentPath $document -EnvPath $environment
  $renderedResult = $result | ConvertTo-Json -Compress
  $saved = @(Get-Content -LiteralPath $environment -Encoding UTF8)

  Assert-True ($result.Imported -eq $true) 'Expected a successful import.'
  Assert-True ($result.Enabled -eq $false) 'Import must remain disabled.'
  Assert-True (-not $renderedResult.Contains($fakeToken)) 'Output exposed the token.'
  Assert-True (($saved | Where-Object { $_ -eq "SUPPLIER_QUOTE_API_KEY=$fakeToken" }).Count -eq 1) 'Token was not written exactly once.'
  Assert-True (($saved | Where-Object { $_ -eq 'SUPPLIER_QUOTE_ENABLED=0' }).Count -eq 1) 'Integration was not fail-closed.'
  Assert-True (($saved | Where-Object { $_ -eq 'EXISTING=value' }).Count -eq 1) 'Existing settings were not preserved.'

  $beforeDuplicate = (Get-FileHash -LiteralPath $environment -Algorithm SHA256).Hash
  [System.IO.File]::AppendAllText(
    $environment,
    "SUPPLIER_QUOTE_API_KEY=duplicate`n",
    $encoding
  )
  $duplicateState = (Get-FileHash -LiteralPath $environment -Algorithm SHA256).Hash
  $failedClosed = $false
  try {
    & $helper -DocumentPath $document -EnvPath $environment | Out-Null
  } catch {
    $failedClosed = $true
  }
  Assert-True $failedClosed 'Duplicate settings must be rejected.'
  Assert-True (((Get-FileHash -LiteralPath $environment -Algorithm SHA256).Hash) -eq $duplicateState) 'Rejected import modified the environment file.'
  Assert-True ($beforeDuplicate -ne $duplicateState) 'Duplicate test setup did not change the file.'

  [pscustomobject]@{
    Passed = $true
    Cases = 2
    SecretOutput = $false
  }
} finally {
  if (Test-Path -LiteralPath $root) {
    Remove-Item -LiteralPath $root -Recurse -Force
  }
}
