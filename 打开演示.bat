@echo off
chcp 65001 >nul
start "" "%~dp0dist\index.html"
exit /b 0
