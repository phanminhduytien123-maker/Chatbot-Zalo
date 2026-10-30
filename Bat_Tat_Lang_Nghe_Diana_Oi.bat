@echo off
title 🌸 Diana Wake Listener ("Diana ơi" - Siri Mode)
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================================================
echo     🌸 DIANA ALWAYS-LISTENING WAKE WORD ("Diana ơi" - SIRI MODE)
echo ===================================================================
echo.

if exist .diana_wake.pid (
    set /p WAKE_PID=<.diana_wake.pid
    if defined WAKE_PID (
        echo [Wake Listener] Đang tắt tiến trình lắng nghe "Diana ơi" (PID: %WAKE_PID%)...
        taskkill /F /PID %WAKE_PID% >nul 2>&1
        powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"CommandLine LIKE '%%diana_wake_listener.py%%'\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
        del .diana_wake.pid >nul 2>&1
        echo [Wake Listener] ✅ ĐÃ TẮT CHẾ ĐỘ LẮNG NGHE "Diana ơi"!
        timeout /t 2 >nul
        exit /b
    )
)

echo [Wake Listener] Đang kích hoạt Microphone và lắng nghe từ khóa "Diana ơi"...
"C:\Users\ADMIN\AppData\Local\Programs\Python\Python312\python.exe" scripts\diana_wake_listener.py
if %errorlevel% neq 0 (
    python scripts\diana_wake_listener.py
)
pause
