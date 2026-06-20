@echo off
setlocal
title UniversalisRPG Web

cd /d "%~dp0"

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 goto :error
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
