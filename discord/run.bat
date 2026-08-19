@echo off
setlocal
chcp 65001 >nul
title ChatGPT Discord Bot - setup & run
cd /d "%~dp0"

echo ============================================================
echo   ChatGPT Discord Bot - setup and launcher
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Get it from https://nodejs.org
  echo         then run this script again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/3] Installing dependencies, first time only...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Dependencies already installed.
)

if not exist config.json (
  echo.
  echo [2/3] First-time setup:
  echo       You don't have a config.json yet, so I created one from the
  echo       example. Now:
  echo.
  echo        1. Go to https://discord.com/developers/applications
  echo           - Create an application, open "Bot"
  echo           - Copy the TOKEN
  echo        2. A Notepad window will open - paste your token into
  echo           "token": "..." and save. Also set your gateway URL if the
  echo           gateway is not on http://localhost:3000/v1
  echo.
  copy /y config.example.json config.json >nul
  notepad config.json
  echo.
  set /p CONFIRM="Did you save the token in config.json? (y/n): "
  if /i not "%CONFIRM%"=="y" (
    echo.
    echo  No problem - run this script again when you're ready.
    pause
    exit /b 1
  )
) else (
  echo [2/3] config.json found.
)

echo [3/3] Checking the gateway...
setlocal enabledelayedexpansion
set GATEWAY_RAW=
for /f "usebackq tokens=2 delims=:," %%a in (`findstr /i "gatewayUrl" config.json`) do set "GATEWAY_RAW=%%a"
set GATEWAY_RAW=!GATEWAY_RAW:"=!
set GATEWAY_RAW=!GATEWAY_RAW: =!
if "!GATEWAY_RAW!"=="" set "GATEWAY_RAW=http://localhost:3000/v1"
echo       Gateway: !GATEWAY_RAW!
for /f "delims=" %%a in ('powershell -NoProfile -Command "(Invoke-WebRequest -UseBasicParsing -Uri '!GATEWAY_RAW!/models' -TimeoutSec 5).StatusCode" 2^>nul') do set "HTTP_CODE=%%a"
if "!HTTP_CODE!"=="200" (
  echo       Gateway is UP.
) else (
  echo.
  echo       [WARN] Could not reach the gateway at !GATEWAY_RAW!.
  echo       Start it first (run the gateway's run.bat), then start this bot.
  echo.
  set /p START_ANYWAY="Start the bot anyway? (y/n): "
  if /i not "!START_ANYWAY!"=="y" (
    pause
    exit /b 1
  )
)
endlocal

echo.
echo Starting the bot... (Ctrl+C to stop)
node bot.js
pause