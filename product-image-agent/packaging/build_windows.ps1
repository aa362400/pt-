param(
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$SpecFile = Join-Path $PSScriptRoot "ProductImageAgent.spec"
$InnoScript = Join-Path $PSScriptRoot "ProductImageAgent.iss"
$InstallerDir = Join-Path $Root "installer"

if (-not (Test-Path $VenvPython)) {
    py -3 -m venv (Join-Path $Root ".venv")
}

& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $Root "agent\requirements.txt")
& $VenvPython -m pip install pyinstaller

Push-Location $Root
try {
    & $VenvPython -m PyInstaller --clean --noconfirm $SpecFile
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

if ($SkipInstaller) {
    Write-Host "App directory generated: $(Join-Path $Root 'dist\ProductImageAgent')"
    exit 0
}

$Iscc = (Get-Command "ISCC.exe" -ErrorAction SilentlyContinue).Source
if (-not $Iscc) {
    $Candidates = @(
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    foreach ($Candidate in $Candidates) {
        if (Test-Path $Candidate) {
            $Iscc = $Candidate
            break
        }
    }
}

if (-not $Iscc) {
    $Winget = (Get-Command "winget.exe" -ErrorAction SilentlyContinue).Source
    if (-not $Winget) {
        throw "Inno Setup and winget were not found. Install Inno Setup 6, or rerun with -SkipInstaller."
    }
    & $Winget install --id JRSoftware.InnoSetup -e --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed to install Inno Setup. Exit code: $LASTEXITCODE."
    }
    $Iscc = (Get-Command "ISCC.exe" -ErrorAction SilentlyContinue).Source
    if (-not $Iscc) {
        foreach ($Candidate in $Candidates) {
            if (Test-Path $Candidate) {
                $Iscc = $Candidate
                break
            }
        }
    }
}

if (-not $Iscc) {
    throw "ISCC.exe was not found after installing Inno Setup."
}

New-Item -ItemType Directory -Force -Path $InstallerDir | Out-Null
& $Iscc $InnoScript
if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup compiler failed with exit code $LASTEXITCODE."
}

Write-Host "Installer generated: $(Join-Path $InstallerDir 'ProductImageAgent-Setup.exe')"
