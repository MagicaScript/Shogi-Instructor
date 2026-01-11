@echo off
setlocal EnableExtensions

REM =====================================================
REM Ensure we run from the directory where launcher.bat lives
REM =====================================================
cd /d "%~dp0"
set "PROJECT_ROOT=%cd%"

REM =====================================================
REM Paths
REM =====================================================
set "FRONTEND_DIR=%PROJECT_ROOT%\frontend"
set "BACKEND_DIR=%PROJECT_ROOT%\backend"
set "BRIDGE_FILE=%PROJECT_ROOT%\scripts\bridge.js"

echo [1/4] Project root:
echo   %PROJECT_ROOT%
echo.

REM =====================================================
REM Start frontend dev server (npm run dev)
REM =====================================================
echo [2/4] Starting frontend dev server...
start "Lishogi Bot Coach - Frontend" cmd /k ^
  "cd /d "%FRONTEND_DIR%" && npm run dev"

REM =====================================================
REM Start backend (python -m src.main)
REM =====================================================
echo [3/4] Starting backend service...
start "Lishogi Bot Coach - Backend" cmd /k ^
  "cd /d "%BACKEND_DIR%" && python -m src.main"

REM =====================================================
REM Copy scripts\bridge.js to clipboard
REM =====================================================
echo [4/4] Copying bridge script to clipboard...

if not exist "%BRIDGE_FILE%" (
  echo ERROR: bridge.js not found:
  echo   %BRIDGE_FILE%
  echo.
  echo Expected location:
  echo   %PROJECT_ROOT%\scripts\bridge.js
  echo.
  pause
  exit /b 1
)

type "%BRIDGE_FILE%" | clip
if errorlevel 1 (
  echo ERROR: Failed to copy bridge.js to clipboard.
  echo Possible causes:
  echo   - Clipboard blocked by security software
  echo   - Running in elevated/admin context
  echo.
  pause
  exit /b 1
)

echo SUCCESS: bridge.js copied to clipboard.
echo You can now paste it into the lishogi DevTools Console.
echo.
pause
endlocal
