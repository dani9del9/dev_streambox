@echo off
rem StreamBox - instala el ayudante de "Reproducir en..." para Google TV / Android TV
rem Uso: instalar.bat [ID de la extension en Chrome]   (el ID lo ves en StreamBox > Ajustes > Mis dispositivos)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" %*
echo.
pause
