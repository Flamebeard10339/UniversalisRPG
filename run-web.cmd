@echo off
setlocal
title UniversalisRPG Web

cd /d "%~dp0"

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 goto :error
)

rem A previous run that didn't get closed cleanly (e.g. the terminal
rem window was closed instead of Ctrl+C) can leave an orphaned server still
rem bound to this port. Since anything listening on 5174 right now is
rem either such a leftover or something --strictPort below would refuse to
rem start alongside anyway, it's always safe to clear it first.
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174 ^| findstr LISTENING') do (
  echo Stopping a leftover server already using port 5174 ^(PID %%a^)...
  taskkill /PID %%a /F >nul 2>&1
)

echo Starting UniversalisRPG at http://127.0.0.1:5174/
echo Close this window or press Ctrl+C to stop the server.
echo.

call npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
if errorlevel 1 goto :error
goto :eof

:error
echo.
echo Unable to start UniversalisRPG.
pause
exit /b 1
