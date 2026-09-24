@echo off
chcp 65001 >nul
title Diana AI Voice Assistant

echo ========================================================
echo   🌸 KHỞI ĐỘNG TRỢ LÝ GIỌNG NÓI DIANA AI ASSISTANT
echo ========================================================
echo.

:: Chuyển về thư mục dự án
cd /d "%~dp0"

:: Mở trình duyệt web sau 2 giây
start "" "http://localhost:3000"

echo 🚀 Đang khởi chạy máy chủ Web & Voice Assistant...
echo 🌐 Địa chỉ máy tính: http://localhost:3000
echo 📱 Địa chỉ điện thoại (cùng WiFi): http://10.231.237.119:3000
echo.
echo (Để tắt server, hãy bấm Ctrl + C hoặc đóng cửa sổ này)
echo ========================================================
echo.

node src/zaloLiveIndex.js
pause
