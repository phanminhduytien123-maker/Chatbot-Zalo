@echo off
title Kiem Tra Trang Thai Diana PC Agent
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pc_agent_manager.ps1" status
echo.
pause
