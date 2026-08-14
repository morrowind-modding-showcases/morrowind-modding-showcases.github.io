@echo off
setlocal

set "WORKER_DIR=%~dp0workers\wiki-submissions"
set "CHECK_ONLY=0"

if /i "%~1"=="--check" set "CHECK_ONLY=1"
if not "%~1"=="" if /i not "%~1"=="--check" goto usage

if not exist "%WORKER_DIR%\package.json" (
  echo The wiki-submissions Worker directory was not found:
  echo %WORKER_DIR%
  goto failed
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then run this file again.
  goto failed
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Install Node.js with npm, then run this file again.
  goto failed
)

cd /d "%WORKER_DIR%"

if not exist "node_modules\.bin\wrangler.cmd" (
  echo Installing Worker dependencies...
  call npm ci
  if errorlevel 1 goto failed
  echo.
)

echo Running Worker tests...
call npm test
if errorlevel 1 goto failed

if "%CHECK_ONLY%"=="1" (
  echo.
  echo Worker checks passed. No deployment was performed.
  exit /b 0
)

echo.
echo Deploying the wiki-submissions Worker to Cloudflare...
call npm run deploy
if errorlevel 1 goto failed

echo.
echo Worker deployment completed successfully.
echo.
pause
exit /b 0

:usage
echo Usage: %~nx0 [--check]
echo.
echo Run without arguments to test and deploy the Worker.
echo Use --check to run the same prerequisites and tests without deploying.
exit /b 2

:failed
echo.
echo The Worker was not deployed. Review the error above and try again.
echo.
if "%CHECK_ONLY%"=="0" pause
exit /b 1
