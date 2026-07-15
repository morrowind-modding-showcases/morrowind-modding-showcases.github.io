@echo off
setlocal

cd /d "%~dp0"
set "OUTPUT=%~dp0modder-title-audit.txt"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Building the modder title audit...
node scripts\list-modder-titles.mjs > "%OUTPUT%"

if errorlevel 1 (
  echo.
  echo The audit could not be created. See the error above.
  pause
  exit /b 1
)

echo.
echo Audit complete:
echo %OUTPUT%
echo.
pause
