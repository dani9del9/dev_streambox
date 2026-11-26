# StreamBox - instalador del ayudante de «Reproducir en…» (Google TV / Android TV / Fire TV)
# Copia el ayudante a %LOCALAPPDATA%\StreamBox\devices, descarga adb (Google Platform Tools) si no lo tienes
# y lo registra para Chrome, Edge y Firefox. Todo en tu usuario: no necesita permisos de administrador.
param([string]$ChromeId = '', [switch]$Desinstalar)
$ErrorActionPreference = 'Stop'
$HostName = 'com.streambox.devices'
$FirefoxId = 'streambox@dani9del9'
$Dest = Join-Path $env:LOCALAPPDATA 'StreamBox\devices'
$Keys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
  "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
)

if ($Desinstalar) {
  foreach ($k in $Keys) { if (Test-Path $k) { Remove-Item $k -Force } }
  if (Test-Path $Dest) { Remove-Item $Dest -Recurse -Force }
  Write-Host 'Ayudante de StreamBox desinstalado.' -ForegroundColor Green
  exit 0
}

Write-Host ''
Write-Host '  StreamBox · ayudante para abrir títulos en tu Google TV / Android TV' -ForegroundColor Cyan
Write-Host ''

# 1) Node.js
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host 'Necesitas Node.js (https://nodejs.org). Instálalo y vuelve a ejecutar este instalador.' -ForegroundColor Red
  exit 1
}
Write-Host "Node.js: $node"

# 2) ID de la extensión en Chrome (en Firefox el ID es fijo)
if (-not $ChromeId) {
  Write-Host ''
  Write-Host 'Pega el ID de StreamBox en Chrome (StreamBox > Ajustes > Mis dispositivos, o chrome://extensions).'
  $ChromeId = Read-Host 'ID (Intro para saltar si solo usas Firefox)'
}
$ChromeId = $ChromeId.Trim()
if ($ChromeId -and $ChromeId -notmatch '^[a-p]{32}$') {
  Write-Host "Ese ID no parece válido ($ChromeId): son 32 letras de la a a la p." -ForegroundColor Red
  exit 1
}

# 3) Copiar el ayudante
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'sb-host.js') $Dest -Force
$bat = Join-Path $Dest 'sb-host.bat'
Set-Content -Path $bat -Encoding ASCII -Value "@echo off`r`n`"$node`" `"%~dp0sb-host.js`" %*"

# 4) adb (Android Platform Tools)
$adb = Join-Path $Dest 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
  $sys = (Get-Command adb -ErrorAction SilentlyContinue).Source
  if ($sys) { Write-Host "adb: uso el que ya tienes ($sys)" }
  else {
    Write-Host 'Descargando adb (Android Platform Tools de Google)…'
    $zip = Join-Path $env:TEMP 'sb-platform-tools.zip'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $Dest -Force
    Remove-Item $zip -Force
    Write-Host "adb: $adb"
  }
} else { Write-Host "adb: $adb" }

# 5) Manifiestos y registro
$utf8 = New-Object System.Text.UTF8Encoding($false)
$base = @{ name = $HostName; description = 'StreamBox: abrir títulos en tus teles'; path = $bat; type = 'stdio' }
$chromeJson = Join-Path $Dest 'chrome.json'
$firefoxJson = Join-Path $Dest 'firefox.json'
$c = $base.Clone(); $c.allowed_origins = @(); if ($ChromeId) { $c.allowed_origins = @("chrome-extension://$ChromeId/") }
[IO.File]::WriteAllText($chromeJson, ($c | ConvertTo-Json), $utf8)
$f = $base.Clone(); $f.allowed_extensions = @($FirefoxId)
[IO.File]::WriteAllText($firefoxJson, ($f | ConvertTo-Json), $utf8)
foreach ($k in $Keys) {
  New-Item -Path $k -Force | Out-Null
  $file = if ($k -like '*Mozilla*') { $firefoxJson } else { $chromeJson }
  Set-Item -Path $k -Value $file
}

Write-Host ''
Write-Host 'Listo. Vuelve a StreamBox > Ajustes > Mis dispositivos y pulsa «Comprobar».' -ForegroundColor Green
if (-not $ChromeId) { Write-Host '(Solo para Firefox: para Chrome, vuelve a ejecutarlo con el ID.)' -ForegroundColor Yellow }
