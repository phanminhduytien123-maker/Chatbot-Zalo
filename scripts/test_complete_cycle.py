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

SERVER_URL = "http://localhost:3000"

print("--- 1. Gửi Grab dữ liệu phiên chat mẫu từ điện thoại ---")
chat_session = {
    "id": f"air_session_{int(time.time())}",
    "timestamp": int(time.time() * 1000),
    "activeTopic": "Đồ án tốt nghiệp",
    "messages": [
        {"sender": "user", "text": "Diana ơi, tổng hợp lại các chức năng đã hoàn thành giúp anh."},
        {"sender": "diana", "text": "Dạ anh! Em đã hoàn thành: Điều khiển PC từ xa qua Zalo, Nhận diện giọng nói offline/online, Báo thức thông minh, và Cử chỉ không chạm Air Gesture chuẩn Huawei ạ!"},
        {"sender": "user", "text": "Tuyệt vời quá em!"}
    ]
}

req = urllib.request.Request(
    f"{SERVER_URL}/api/air-gesture/grab",
    data=json.dumps({"session": chat_session}).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
with urllib.request.urlopen(req, timeout=5) as res:
    print("Grab Response:", res.read().decode('utf-8'))

print("\n--- 2. Lấy phiên mới nhất để kiểm tra ---")
with urllib.request.urlopen(f"{SERVER_URL}/api/air-gesture/latest", timeout=5) as res:
    data = json.loads(res.read().decode('utf-8'))
    print("Has Session:", data.get('hasSession'))
    print("Messages count:", len(data.get('session', {}).get('messages', [])))

print("\n--- 3. Mở trình duyệt PC bằng lệnh chuẩn ---")
import ctypes
target_url = f"https://diana-h73u.onrender.com/?air_sync=1&session_id={chat_session['id']}"
res_code = ctypes.windll.shell32.ShellExecuteW(None, "open", target_url, None, None, 1)
print(f"ShellExecute return code: {res_code} (Thành công nếu > 32)")
print("URL đã mở:", target_url)
