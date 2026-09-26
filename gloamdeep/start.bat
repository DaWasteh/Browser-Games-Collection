@echo off
rem Gloamdeep launcher for Windows: finds a free local port, starts a static server
rem (Python if available, otherwise Node.js) and opens the game in the default browser.
setlocal
cd /d "%~dp0"

set "PORT="
for /l %%P in (8000,1,8020) do (
  if not defined PORT (
    powershell -NoProfile -Command "try { $l = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, %%P); $l.Start(); $l.Stop(); exit 0 } catch { exit 1 }" >nul 2>&1 && set "PORT=%%P"
  )
)
if not defined PORT set "PORT=8000"

set "URL=http://localhost:%PORT%/"
echo Starting Gloamdeep on %URL%
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" %URL%"

where python >nul 2>&1 && (python -m http.server %PORT% --bind 127.0.0.1 & goto :eof)
where py >nul 2>&1 && (py -m http.server %PORT% --bind 127.0.0.1 & goto :eof)
where node >nul 2>&1 && (node serve.mjs %PORT% & goto :eof)

echo.
echo Neither Python nor Node.js was found. Install one of them, or serve this folder
echo with any static web server and open index.html through http://localhost.
pause
