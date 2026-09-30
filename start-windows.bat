@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 server.py --auto-port --open-browser
) else (
  python server.py --auto-port --open-browser
)
pause
