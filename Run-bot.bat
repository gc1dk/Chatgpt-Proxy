@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0discord"
title ChatGPT Gateway - Discord Bot

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [ERROR] Node.js is not installed or not on PATH.
  echo  Install it from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

if not exist config.json (
  copy config.example.json config.json >nul
  echo.
  echo  config.json was created - it is not configured yet.
  echo  Open it and paste your bot token into the "token" field.
  echo  See discord\README.md for the full setup.
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
echo    ChatGPT Gateway - Discord bot launcher
echo  ============================================
echo.
echo  1) Run the bot
echo  2) Edit config.json - bot token, prompts, settings
echo  3) Reset bot data - sessions, prompts, auto-mod settings
echo  4) Reinstall dependencies
echo  5) Exit
echo.
choice /c 12345 /n /m "Choose: "
if errorlevel 5 exit /b 0
if errorlevel 4 goto reinstall
if errorlevel 3 goto reset
if errorlevel 2 goto edit
goto run

:edit
start "" notepad config.json
echo.
echo  Opened config.json in Notepad. Save and close it, then run the bot.
goto menu

:reset
del data.json >nul 2>&1
echo.
echo  Bot data reset - conversations, custom prompts and auto-mod settings cleared.
echo  The gateway's own chats.json is untouched.
goto menu

:reinstall
rmdir /s /q node_modules >nul 2>&1
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  [ERROR] npm install failed. Check your internet connection.
  pause
  exit /b 1
)
echo.
echo  Dependencies reinstalled.
goto menu

:run
echo.
echo  Make sure the gateway is running first - double-click run.bat in the
echo  main folder, then come back here and start the bot.
echo.
echo  Starting the bot... close this window to stop it.
echo.
node bot.js
echo.
echo  Bot stopped - or it failed to start; read the message above.
pause
goto menu