@echo off
cd /d "%~dp0"
echo Server started: http://127.0.0.1:8000
echo Press Ctrl+C to stop server
start "" py -m http.server 8000 --bind 127.0.0.1
timeout /t 0.8 /nobreak >nul
start http://127.0.0.1:8000
pause