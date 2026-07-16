@echo off
setlocal

cd /d "%~dp0"
set "PYTHONUTF8=1"
set "VENV_PY=%~dp0.venv\Scripts\python.exe"
set "PORT=%PORT%"
if "%PORT%"=="" set "PORT=8080"

if not exist "%VENV_PY%" (
  echo [setup] Creating .venv...
  py -3 -m venv .venv
  if errorlevel 1 (
    echo [error] Failed to create .venv. Install Python 3 and make sure the py launcher works.
    pause
    exit /b 1
  )
)

echo [setup] Installing dependencies...
"%VENV_PY%" -m pip install -r agent\requirements.txt
if errorlevel 1 (
  echo [error] Dependency installation failed.
  pause
  exit /b 1
)

echo [start] Opening http://localhost:%PORT%
start "" "http://localhost:%PORT%"
"%VENV_PY%" agent\web\app.py --host 127.0.0.1 --port %PORT%

echo.
echo [stopped] Web server exited.
pause
