@echo off
title Go Cai Dat Dich Vu Mo Khoa SYSTEM

net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

sc stop DianaPCService >nul 2>&1
sc delete DianaPCService >nul 2>&1
schtasks /delete /tn "DianaUnlockTask" /f >nul 2>&1
echo [OK] Da go bo Windows Service va Task Diana thanh cong!
pause
