@echo off
title Go Bo Tu Dong Khoi Dong - Diana PC Agent
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pc_agent_manager.ps1" uninstall
echo.
pause
