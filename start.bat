@echo off
cd /d "%~dp0"
echo Starting ChatGPT LAN gateway on http://localhost:3000 ...
echo Close this window to stop the server.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do taskkill /F /PID %%a >nul 2>&1

node server.js
pause
