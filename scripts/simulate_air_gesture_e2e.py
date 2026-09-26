import sys
import os

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import urllib.request
import json
import time
import subprocess

SERVER_URL = "http://localhost:3000"

print("==================================================")
print("🚀 BẮT ĐẦU GIẢ LẬP TOÀN DIỆN CỬ CHỈ AIR GESTURE (HUAWEI STYLE)")
print("==================================================")

# Bước 1: Kích hoạt chế độ Arm (bật Webcam PC & Cam điện thoại sẵn sàng)
print("\n[Bước 1] Gửi tín hiệu kích hoạt tính năng (ARM)...")
try:
    req = urllib.request.Request(f"{SERVER_URL}/api/air-gesture/arm", data=b"{}", headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=5) as res:
        print("  -> Kết quả ARM:", res.read().decode('utf-8'))
except Exception as e:
    print("  -> Lỗi ARM:", e)

time.sleep(1)

# Bước 2: Giả lập cử chỉ Chụm tay (Pinch / Fist) trên điện thoại để GRAB phiên chat
print("\n[Bước 2] Giả lập điện thoại Chụm tay (✊ GRAB) bắt lấy phiên trò chuyện...")
test_session = {
    "id": f"air_sim_{int(time.time())}",
    "timestamp": int(time.time() * 1000),
    "activeTopic": "Hỗ trợ học tập",
    "messages": [
        {"sender": "user", "text": "Chào Điana, hôm nay có lịch thi gì không em?"},
        {"sender": "diana", "text": "Dạ em chào anh Duy Tiến! Theo thời khóa biểu Cổng sinh viên, hôm nay anh có bài kiểm tra môn Lập trình Web lúc 14:00 tại phòng C304 ạ."},
        {"sender": "user", "text": "Cảm ơn em nhé, anh chuẩn bị mang đồ án qua máy tính mở đây."}
    ]
}

try:
    payload = json.dumps({"session": test_session}).encode('utf-8')
    req = urllib.request.Request(f"{SERVER_URL}/api/air-gesture/grab", data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=5) as res:
        print("  -> Kết quả GRAB:", res.read().decode('utf-8'))
except Exception as e:
    print("  -> Lỗi GRAB:", e)

# Bước 3: Kiểm tra API /api/air-gesture/latest xem dữ liệu đã được lưu đúng chưa
print("\n[Bước 3] Kiểm tra phiên chat vừa lưu trên máy chủ...")
try:
    with urllib.request.urlopen(f"{SERVER_URL}/api/air-gesture/latest", timeout=5) as res:
        latest = json.loads(res.read().decode('utf-8'))
        print("  -> Has Session:", latest.get('hasSession'))
        print("  -> Session ID:", latest.get('session', {}).get('id'))
        print("  -> Tin nhắn khôi phục:", len(latest.get('session', {}).get('messages', [])))
        for i, m in enumerate(latest.get('session', {}).get('messages', [])):
            print(f"     {i+1}. [{m.get('sender')}]: {m.get('text')}")
except Exception as e:
    print("  -> Lỗi kiểm tra session:", e)

# Bước 4: Kiểm tra trạng thái đồng bộ
print("\n[Bước 4] Kiểm tra trạng thái hiện tại (/api/air-gesture/status)...")
try:
    with urllib.request.urlopen(f"{SERVER_URL}/api/air-gesture/status", timeout=5) as res:
        print("  -> Trạng thái:", res.read().decode('utf-8'))
except Exception as e:
    print("  -> Lỗi Status:", e)

print("\n==================================================")
print("✅ GIẢ LẬP THÀNH CÔNG! Dữ liệu phiên chat đã sẵn sàng để truyền sang PC!")
print("==================================================")
