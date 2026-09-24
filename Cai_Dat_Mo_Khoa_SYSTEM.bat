@echo off
title Cai Dat Dich Vu Mo Khoa SYSTEM (Diana PC Agent)

:: Kiem tra quyen Admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Dang yeu cau quyen Administrator...
    powershell -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ======================================================================
echo    DANG CAI DAT DICH VU MO KHOA SYSTEM (DIANA PC SERVICE)
echo    (Chay ngam 24/7 duoi quyen NT AUTHORITY\SYSTEM nhu TeamViewer)
echo ======================================================================
echo.

echo [1/4] Dang dung dich vu cu (neu co)...
sc stop DianaPCService >nul 2>&1
sc delete DianaPCService >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo [2/4] Dang bien dich cac cong cu nen (Worker & Service)...
powershell -ExecutionPolicy Bypass -NoProfile -File "scripts\build_worker.ps1"
powershell -ExecutionPolicy Bypass -NoProfile -File "scripts\build_service.ps1"

echo.
echo [3/4] Dang dang ky Windows Service "DianaPCService"...
set "SERVICE_EXE=%~dp0scripts\DianaPCService.exe"
sc create DianaPCService binPath= "%SERVICE_EXE%" start= auto DisplayName= "Diana PC Remote Unlock Service"

echo.
echo [4/4] Dang khoi dong Service...
sc start DianaPCService

echo.
if %errorlevel% equ 0 (
    echo ======================================================================
    echo    [OK] CAI DAT VA KHOI DONG THANH CONG DICH VU MO KHOA SYSTEM!
    echo.
    echo    Dich vu DianaPCService da hoat dong duoi quyen SYSTEM 24/7.
    echo    Moi yeu cau mo khoa se tu dong duoc thuc thi truc tiep vao man hinh Winlogon.
    echo ======================================================================
) else (
    echo [ERROR] Khong the khoi dong Windows Service!
)

echo.
pause
