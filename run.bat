@echo off
setlocal
cd /d "%~dp0"
title ChatGPT Gateway

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [ERROR] Node.js is not installed or not on PATH.
  echo  Install it from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, this takes a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
)

:menu
echo.
echo  ============================================
echo    ChatGPT Gateway - setup wizard / launcher
echo  ============================================
echo.
if exist web.env (
  echo  Settings file: web.env  (currently saved)
) else (
  echo  Settings file: web.env  (not created yet)
)
echo.
echo  1) Run now
echo  2) Setup / edit settings (wizard)
echo  3) Reset settings to defaults
echo  4) Exit
echo.
choice /c 1234 /n /m "Choose: "
if errorlevel 4 exit /b 0
if errorlevel 3 goto reset
if errorlevel 2 goto wizard
goto run

:reset
del web.env >nul 2>&1
echo.
echo  Settings reset. Run the wizard to configure again.
goto menu

:wizard
echo.
echo  Enter the values below. Press Enter to keep the default shown in brackets.
echo  Leave the password empty for no login (anyone on the LAN can use it - not recommended!).
echo.
set /p PORT=     Port [3000]: 
if "%PORT%"=="" set PORT=3000
set /p HOST=     Bind to (0.0.0.0 = whole LAN, 127.0.0.1 = this PC only) [0.0.0.0]: 
if "%HOST%"=="" set HOST=0.0.0.0
set /p PASS=     Password for login (empty = no login): 
set /p SIGNUP=   Allow anyone to create an account? (y/n) [y]: 
if "%SIGNUP%"=="" set SIGNUP=y
if /i "%SIGNUP%"=="n" (set ALLOW_SIGNUP=0) else (set ALLOW_SIGNUP=1)
set /p HEADED=   Show the ChatGPT browser window (needed once to solve a captcha)? (y/n) [n]: 
if "%HEADED%"=="" set HEADED=n
if /i "%HEADED%"=="y" (set HEADED=1) else (set HEADED=0)
set /p TIMEOUT=  Minutes to wait for one reply before giving up [5]: 
if "%TIMEOUT%"=="" set TIMEOUT=5
set /p KEY=      Encrypt saved chats with a secret key (optional, anything): 
set /p UPD=      Auto-check for updates? (y/n) [y]: 
if "%UPD%"=="" set UPD=y
if /i "%UPD%"=="n" (set UPD=0) else (set UPD=1)

> web.env (
  echo PORT=%PORT%
  echo HOST=%HOST%
  if not "%PASS%"=="" echo AUTH_TOKEN=%PASS%
  echo ALLOW_SIGNUP=%ALLOW_SIGNUP%
  echo HEADED=%HEADED%
  echo TIMEOUT=%TIMEOUT%000
  if not "%KEY%"=="" echo ENCRYPT_KEY=%KEY%
  echo UPDATE_CHECK=%UPD%
)
echo.
echo  Saved to web.env
goto menu

:run
if not exist web.env (
  echo.
  echo  No settings yet - running with defaults (http://localhost:3000, no login).
  echo  Use option 2 to set a password.
  echo.
)
if exist web.env (
  for /f "usebackq tokens=1,* delims==" %%a in ("web.env") do set "%%a=%%b"
)

echo.
echo  Starting the gateway... the web UI opens automatically.
echo  Close this window to stop the server.
echo.
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do taskkill /F /PID %%a >nul 2>&1

node server.js
echo.
echo  Server stopped (or it failed to start - read the message above).
pause
goto menu