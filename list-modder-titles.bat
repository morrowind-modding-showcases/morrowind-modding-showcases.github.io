@echo off
setlocal

cd /d "%~dp0"
set "POSSIBILITIES=%~dp0modder-title-possibilities.txt"
set "ASSIGNMENTS=%~dp0modder-title-assignments.txt"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Building the modder title reports...
node scripts\list-modder-titles.mjs --report modders > "%POSSIBILITIES%"

if errorlevel 1 (
  echo.
  echo The possibilities report could not be created. See the error above.
  pause
  exit /b 1
)

node scripts\list-modder-titles.mjs --report assignments > "%ASSIGNMENTS%"

if errorlevel 1 (
  echo.
  echo The assignments report could not be created. See the error above.
  pause
  exit /b 1
)

echo.
echo Reports complete:
echo %POSSIBILITIES%
echo %ASSIGNMENTS%
echo.
pause
