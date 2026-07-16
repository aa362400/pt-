param(
  [string]$PluginRoot,
  [string]$TargetPluginName = 'jieke-etsy-research'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$bundleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$skillSource = Join-Path $bundleRoot 'skills\daily-product-research'
$skillSourceFile = Join-Path $skillSource 'SKILL.md'

if (-not (Test-Path -LiteralPath $skillSourceFile -PathType Leaf)) {
  throw "Patch bundle is incomplete: $skillSourceFile"
}

function Get-ManifestPluginName {
  param([string]$ManifestPath)

  try {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    return [string]$manifest.name
  }
  catch {
    return $null
  }
}

function Find-TargetPluginRoot {
  param([string]$ExpectedName)

  $candidateRoots = @(
    (Join-Path $HOME 'plugins'),
    (Join-Path $HOME '.agents\plugins'),
    (Join-Path $HOME '.codex\plugins'),
    (Join-Path $HOME 'AppData\Roaming\Codex\plugins'),
    (Join-Path $HOME 'AppData\Local\Codex\plugins')
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Container }

  $matches = New-Object System.Collections.Generic.List[string]

  foreach ($root in $candidateRoots) {
    $manifestFiles = Get-ChildItem -LiteralPath $root -Filter 'plugin.json' -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.Directory.Name -eq '.codex-plugin' }

    foreach ($manifestFile in $manifestFiles) {
      $pluginName = Get-ManifestPluginName -ManifestPath $manifestFile.FullName
      if ($pluginName -eq $ExpectedName) {
        [void]$matches.Add((Split-Path -Parent $manifestFile.Directory.FullName))
      }
    }
  }

  $uniqueMatches = @($matches | Sort-Object -Unique)
  if ($uniqueMatches.Count -eq 0) {
    throw "Cannot locate plugin '$ExpectedName'. Pass -PluginRoot with the existing plugin directory."
  }
  if ($uniqueMatches.Count -gt 1) {
    throw "Multiple plugin roots found for '$ExpectedName':`n$($uniqueMatches -join "`n")`nPass -PluginRoot explicitly."
  }

  return $uniqueMatches[0]
}

if ([string]::IsNullOrWhiteSpace($PluginRoot)) {
  $PluginRoot = Find-TargetPluginRoot -ExpectedName $TargetPluginName
}

$PluginRoot = (Resolve-Path -LiteralPath $PluginRoot).Path
$manifestPath = Join-Path $PluginRoot '.codex-plugin\plugin.json'

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Target is not a Codex plugin: missing $manifestPath"
}

$actualPluginName = Get-ManifestPluginName -ManifestPath $manifestPath
if ($actualPluginName -ne $TargetPluginName) {
  throw "Plugin name mismatch. Expected '$TargetPluginName', found '$actualPluginName'."
}

$skillsRoot = Join-Path $PluginRoot 'skills'
$targetSkill = Join-Path $skillsRoot 'daily-product-research'
$backupPath = $null

New-Item -ItemType Directory -Path $skillsRoot -Force | Out-Null

if (Test-Path -LiteralPath $targetSkill) {
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backupRoot = Join-Path $PluginRoot '.plugin-backups'
  $backupPath = Join-Path $backupRoot "daily-product-research-$timestamp"
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  Copy-Item -LiteralPath $targetSkill -Destination $backupPath -Recurse -Force
  Remove-Item -LiteralPath $targetSkill -Recurse -Force
}

Copy-Item -LiteralPath $skillSource -Destination $targetSkill -Recurse -Force

$skillText = Get-Content -LiteralPath (Join-Path $targetSkill 'SKILL.md') -Raw -Encoding UTF8
if ($skillText -notmatch '(?ms)^---\s*\r?\nname:\s*daily-product-research\s*\r?\ndescription:\s*.+?\r?\n---') {
  throw 'Installed SKILL.md frontmatter validation failed.'
}

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$pythonArgsPrefix = @()
if (-not $pythonCommand) {
  $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
  $pythonArgsPrefix = @('-3')
}

function Invoke-OptionalPythonValidation {
  param(
    [string[]]$ScriptCandidates,
    [string[]]$Arguments,
    [string]$Label
  )

  if (-not $pythonCommand) {
    Write-Warning "$Label skipped: Python was not found."
    return
  }

  $script = $ScriptCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $script) {
    Write-Warning "$Label skipped: validator script was not found."
    return
  }

  & $pythonCommand.Source @pythonArgsPrefix $script @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

Invoke-OptionalPythonValidation -Label 'Skill validation' -ScriptCandidates @(
  (Join-Path $HOME '.codex\skills\.system\skill-creator\scripts\quick_validate.py'),
  (Join-Path $HOME '.codex\skills\skill-creator\scripts\quick_validate.py')
) -Arguments @($targetSkill)

Invoke-OptionalPythonValidation -Label 'Plugin validation' -ScriptCandidates @(
  (Join-Path $HOME '.codex\skills\.system\plugin-creator\scripts\validate_plugin.py'),
  (Join-Path $HOME '.codex\skills\plugin-creator\scripts\validate_plugin.py')
) -Arguments @($PluginRoot)

Invoke-OptionalPythonValidation -Label 'Plugin cachebuster update' -ScriptCandidates @(
  (Join-Path $HOME '.codex\skills\.system\plugin-creator\scripts\update_plugin_cachebuster.py'),
  (Join-Path $HOME '.codex\skills\plugin-creator\scripts\update_plugin_cachebuster.py')
) -Arguments @($PluginRoot)

[pscustomobject]@{
  pluginName = $actualPluginName
  pluginRoot = $PluginRoot
  installedSkill = $targetSkill
  backup = $backupPath
  marketplaceEdited = $false
  status = 'installed'
} | ConvertTo-Json -Depth 4
