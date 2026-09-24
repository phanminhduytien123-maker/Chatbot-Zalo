@echo off
title Cai Dat Tu Dong Khoi Dong - Diana PC Agent
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pc_agent_manager.ps1" install
powershell -Command "Start-Sleep -Seconds 3"
exit
