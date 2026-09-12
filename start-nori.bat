@echo off
cd /d "%~dp0"
call npm run build
start "Nori" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0dist\main\index.js"
