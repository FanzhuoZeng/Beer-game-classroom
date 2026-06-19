@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto :error
)

echo Building the classroom site...
call npm.cmd run build
if errorlevel 1 goto :error

echo.
echo Opening http://localhost:4000
start "" "http://localhost:4000"
call npm.cmd start
goto :eof

:error
echo.
echo The classroom site could not be started.
pause
exit /b 1
