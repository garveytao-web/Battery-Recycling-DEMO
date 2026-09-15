@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。
  echo 请先安装 Node.js LTS：https://nodejs.org/
  echo 安装完成后重新双击本文件。
  pause
  exit /b 1
)
echo 正在启动循电 Demo：http://127.0.0.1:8080
echo 修改 dist 目录中的文件后，回到浏览器刷新即可查看。
echo 按 Ctrl+C 可以停止服务。
start "" "http://127.0.0.1:8080"
node dev-server.js
