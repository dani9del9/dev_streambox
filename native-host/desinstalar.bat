@echo off
rem StreamBox - desinstala el ayudante de "Reproducir en..."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" -Desinstalar
echo.
pause
