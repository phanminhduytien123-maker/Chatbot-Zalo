import sys
import os

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import win32gui
import win32con
import win32process
import ctypes
import time
import subprocess

target_url = "https://diana-h73u.onrender.com/?air_sync=1"

print("1. Đang mở Chrome với --new-window...")
chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
subprocess.Popen([chrome_path, "--new-window", "--start-maximized", target_url])

time.sleep(1.0)

print("2. Đang tìm và kích hoạt cửa sổ Chrome/Browser lên Foreground...")
user32 = ctypes.windll.user32

def force_foreground(hwnd):
    try:
        # Bỏ minimize nếu đang thu nhỏ
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
        
        # Đưa lên TopMost rồi gỡ TopMost để ép focus
        user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002) # HWND_TOPMOST, SWP_NOMOVE | SWP_NOSIZE
        user32.SetForegroundWindow(hwnd)
        user32.BringWindowToTop(hwnd)
        user32.SetWindowPos(hwnd, -2, 0, 0, 0, 0, 0x0001 | 0x0002) # HWND_NOTOPMOST
        print(f"  -> Đã kích hoạt Foreground cho HWND {hwnd}: {win32gui.GetWindowText(hwnd)}")
    except Exception as e:
        print(f"  -> Lỗi focus HWND {hwnd}: {e}")

def enum_cb(hwnd, _):
    if win32gui.IsWindowVisible(hwnd):
        title = win32gui.GetWindowText(hwnd)
        cls = win32gui.GetClassName(hwnd)
        if any(k in title.lower() for k in ["diana", "chrome", "google", "render"]) or cls == "Chrome_WidgetWin_1":
            if title:  # Chỉ những cửa sổ có tiêu đề thực
                force_foreground(hwnd)
    return True

win32gui.EnumWindows(enum_cb, None)
print("Hoàn tất!")
