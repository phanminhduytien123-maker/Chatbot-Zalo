import sys
import time
import requests

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

BASE_URL = 'http://127.0.0.1:3000'

print("=== BAT DAU GIA LAP TOAN BO QUY TRINH AIR GESTURE ===")

# Buoc 1: Gia lap dien thoai bam nut Air Gesture (🖐️)
print("\n1. Gui lenh /api/air-gesture/arm (Dien thoai kich hoat che do cu chi)...")
r1 = requests.post(f"{BASE_URL}/api/air-gesture/arm")
print("Ket qua ARM:", r1.json())

time.sleep(1)

# Kiem tra trang thai PC
r_status = requests.get(f"{BASE_URL}/api/air-gesture/status")
print("Trang thai hien tai cua PC:", r_status.json())

# Buoc 2: Gia lap dien thoai Chum tay (✊ Grab)
print("\n2. Gui lenh /api/air-gesture/grab (Dien thoai chum tay nam 3 tin nhan)...")
sample_session = {
    "id": f"air_sim_{int(time.time())}",
    "messages": [
        {"sender": "user", "text": "Diana oi, mo trang web cho anh voi!", "isHtml": False, "timeStr": "16:05"},
        {"sender": "bot", "text": "Da em da san sang chuyen phien sang may tinh cho anh roi a! 🌸", "isHtml": False, "timeStr": "16:05"},
        {"sender": "user", "text": "Kiem tra phien truyen cu chi", "isHtml": False, "timeStr": "16:06"}
    ]
}

r2 = requests.post(f"{BASE_URL}/api/air-gesture/grab", json={"session": sample_session})
print("Ket qua GRAB:", r2.json())

# Buoc 3: Kiem tra API /api/air-gesture/latest
print("\n3. Kiem tra /api/air-gesture/latest (May chu da luu phien chat chua)...")
r3 = requests.get(f"{BASE_URL}/api/air-gesture/latest")
print("Ket qua LATEST:", r3.json())

print("\n=== GIA LAP HOAN TAT ===")
