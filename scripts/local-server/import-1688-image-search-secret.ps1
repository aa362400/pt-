[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DocumentPath,

  [Parameter(Mandatory = $true)]
  [string]$EnvPath
)

$ErrorActionPreference = 'Stop'

function Read-DocumentedToken {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw '1688 API document was not found.'
  }

  $lines = @(Get-Content -LiteralPath $Path -Encoding UTF8)
  $headingIndexes = @(
    for ($index = 0; $index -lt $lines.Count; $index += 1) {
      if (
        $lines[$index].Trim() -match
        '^[^\x00-\x7F]+\s+Token(?:\x3A|\uFF1A)$'
      ) { $index }
    }
  )
  if ($headingIndexes.Count -ne 1) {
    throw 'Expected exactly one documented token section.'
  }

  $openingFence = -1
  for ($index = $headingIndexes[0] + 1; $index -lt $lines.Count; $index += 1) {
    if ($lines[$index].Trim().StartsWith('```')) {
      $openingFence = $index
      break
    }
    if ($lines[$index].Trim().StartsWith('#')) { break }
  }
  if ($openingFence -lt 0) {
    throw 'Documented token code block was not found.'
  }

  $values = @()
  $closingFence = -1
  for ($index = $openingFence + 1; $index -lt $lines.Count; $index += 1) {
    $trimmed = $lines[$index].Trim()
    if ($trimmed.StartsWith('```')) {
      $closingFence = $index
      break
    }
    if ($trimmed) { $values += $trimmed }
  }
  if ($closingFence -lt 0 -or $values.Count -ne 1) {
    throw 'Documented token block must contain exactly one non-empty line.'
  }

  $token = $values[0]
  if (
    $token.Length -lt 16 -or
    $token.Length -gt 512 -or
    $token -notmatch '^[A-Za-z0-9._~-]+$'
  ) {
    throw 'Documented token has an unsupported format.'
  }
  return $token
}

function Set-UniqueEnvValue {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Name,
    [string]$Value
  )

  $matches = @(
    for ($index = 0; $index -lt $Lines.Count; $index += 1) {
      if ($Lines[$index] -match ('^' + [regex]::Escape($Name) + '=')) { $index }
    }
  )
  if ($matches.Count -gt 1) {
    throw "Duplicate environment setting: $Name"
  }
  $rendered = "$Name=$Value"
  if ($matches.Count -eq 1) {
    $Lines[$matches[0]] = $rendered
  } else {
    $Lines.Add($rendered)
  }
}

$token = Read-DocumentedToken -Path $DocumentPath
$lines = [System.Collections.Generic.List[string]]::new()
if (Test-Path -LiteralPath $EnvPath -PathType Leaf) {
  foreach ($line in Get-Content -LiteralPath $EnvPath -Encoding UTF8) {
    $lines.Add($line)
  }
} else {
  $parent = Split-Path -Parent $EnvPath
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    throw 'Target environment directory was not found.'
  }
}

# Keep the integration fail-closed until the separately supplied HTTPS host is
# configured and a live request is explicitly verified.
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_ENABLED' -Value '0'
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_PROVIDER' -Value '1688-image-search-v1'
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_API_BASE_URL' -Value ''
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_IMAGE_SEARCH_PATH' -Value '/api/imageSearch1688/search'
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_EXACT_QUOTE_PATH' -Value ''
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_API_KEY' -Value $token
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_DESTINATION_COUNTRY' -Value 'RU'
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_QUANTITY' -Value '100'
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_TIMEOUT_SECONDS' -Value '20'
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_MAX_AGE_SECONDS' -Value '3600'
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_MAX_IMAGE_RESULTS' -Value '10'
Set-UniqueEnvValue -Lines $lines -Name 'SUPPLIER_QUOTE_KEYWORD_FALLBACK' -Value '1'

$temporaryPath = "$EnvPath.$PID.tmp"
$replacementBackupPath = "$EnvPath.$PID.replace-backup"
$encoding = [System.Text.UTF8Encoding]::new($false)
try {
  [System.IO.File]::WriteAllText(
    $temporaryPath,
    (($lines -join "`n") + "`n"),
    $encoding
  )
  if (Test-Path -LiteralPath $EnvPath -PathType Leaf) {
    [System.IO.File]::Replace(
      $temporaryPath,
      $EnvPath,
      $replacementBackupPath,
      $true
    )
  } else {
    Move-Item -LiteralPath $temporaryPath -Destination $EnvPath
  }
} finally {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }
  if (Test-Path -LiteralPath $replacementBackupPath) {
    Remove-Item -LiteralPath $replacementBackupPath -Force
  }
}

# Deliberately return only non-secret state.
[pscustomobject]@{
  Imported = $true
  Enabled = $false
  HostConfigured = $false
  ImageSearchPath = '/api/imageSearch1688/search'
}
