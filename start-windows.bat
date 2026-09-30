@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 a-little-closer/server.py --auto-port --open-browser
) else (
  python a-little-closer/server.py --auto-port --open-browser
)
pause
