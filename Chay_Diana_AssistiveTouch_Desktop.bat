@echo off
chcp 65001 >nul
title Diana AssistiveTouch Floating Widget

echo ========================================================
echo   🌸 KHỞI ĐỘNG CHẤM NỔI ASSISTIVETOUCH DIANA TRÊN MÀN HÌNH
echo ========================================================
echo.
echo 💡 Chấm tròn Diana đang xuất hiện ở mép phải màn hình máy tính!
echo 👉 Anh có thể kéo thả di chuyển chấm tròn này đi bất cứ đâu.
echo 👉 Nhấp chuột vào chấm để tương tác với Diana.
echo 👉 Nhấp chuột phải vào chấm để đóng khi không cần dùng nữa.
echo ========================================================
echo.

powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "%~dp0scripts\diana_assistive_dot.ps1"
