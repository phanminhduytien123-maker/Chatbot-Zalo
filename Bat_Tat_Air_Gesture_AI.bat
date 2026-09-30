@echo off
title Diana Air Gesture AI Controller
chcp 65001 >nul
cd /d "%~dp0"

echo =======================================================
echo     🖐️ DIANA AIR GESTURE AI CONTROLLER (60 FPS)
echo =======================================================
echo.

if exist .air_gesture.pid (
    set /p AG_PID=<.air_gesture.pid
    if defined AG_PID (
        echo [Air Gesture] Dang tat tien trinh Air Gesture (PID: %AG_PID%)...
        taskkill /F /PID %AG_PID% >nul 2>&1
        del .air_gesture.pid >nul 2>&1
        echo [Air Gesture] [OK] Da tat che do Air Gesture!
        timeout /t 2 >nul
        exit /b
    )
)

echo [Air Gesture] Dang khoi dong Webcam va AI nhan dien cu chi ban tay...
"C:\Users\ADMIN\AppData\Local\Programs\Python\Python312\python.exe" scripts\air_gesture_controller.py
if %errorlevel% neq 0 (
    python scripts\air_gesture_controller.py
)
pause
