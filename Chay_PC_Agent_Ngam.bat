@echo off
title Khoi Dong Diana PC Agent Chay Ngam
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pc_agent_manager.ps1" start
powershell -Command "Start-Sleep -Seconds 2"
exit
