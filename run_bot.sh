#!/bin/bash
# 🤖 Khởi chạy AI Zalo Bot (Điana) trên Termux Android

# 1. Giữ CPU và Mạng luôn hoạt động khi tắt màn hình (Termux Wake Lock)
if command -v termux-wake-lock &> /dev/null; then
    termux-wake-lock
    echo "⚡ [Termux] Đã kích hoạt Wake-Lock để giữ kết nối ngầm liên tục khi tắt màn hình."
fi

# Chuyển đến thư mục làm việc
cd "/sdcard/MyFiles/Zalo Bot" 2>/dev/null || cd "$(dirname "$0")"

# 2. Vòng lặp giám sát tự động khởi động lại nếu tiến trình bị ngắt
while true; do
    echo "🚀 Đang khởi động AI Zalo Bot (Điana)..."
    node src/zaloLiveIndex.js
    EXIT_CODE=$?
    echo "⚠️ Tiến trình Bot đã dừng (Mã thoát: $EXIT_CODE). Đang tự khởi động lại sau 3 giây..."
    sleep 3
done
