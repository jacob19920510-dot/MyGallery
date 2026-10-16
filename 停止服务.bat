@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\service.ps1" -Action Stop
if errorlevel 1 (
  echo.
  echo 停止失败，请查看上方提示。
  pause
  exit /b 1
)
echo.
echo 按任意键关闭窗口。
pause >nul
endlocal
