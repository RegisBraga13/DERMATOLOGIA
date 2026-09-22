@echo off
setlocal
cd /d "%~dp0"

netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if errorlevel 1 (
  start "PSIQUIATRIA - servidor" /min cmd /c "python server.py"
  timeout /t 2 /nobreak >nul
)

start "" "http://127.0.0.1:8000/"
endlocal
