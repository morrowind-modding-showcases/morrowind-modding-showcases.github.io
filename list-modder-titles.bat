@echo off
setlocal

cd /d "%~dp0"
set "REPORT=%~dp0modder-titles.csv"
set "TEMP_REPORT=%~dp0modder-titles.tmp.csv"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Building the modder title CSV...
node scripts\list-modder-titles.mjs --report csv > "%TEMP_REPORT%"

if errorlevel 1 (
  echo.
  echo The CSV report could not be created. See the error above.
  pause
  exit /b 1
)

move /y "%TEMP_REPORT%" "%REPORT%" >nul

if errorlevel 1 (
  echo.
  echo The existing CSV could not be replaced. Close it in any spreadsheet app,
  echo then run this batch file again. The new CSV was retained at:
  echo %TEMP_REPORT%
  pause
  exit /b 1
)

echo.
echo Report complete:
echo %REPORT%
echo.
pause
