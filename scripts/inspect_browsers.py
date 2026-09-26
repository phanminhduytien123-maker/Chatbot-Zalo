import psutil
import os
import win32gui
import win32process

print(f"Current PID: {os.getpid()}")

def get_hwnds_for_pid(pid):
    def callback(hwnd, hwnds):
        if win32gui.IsWindowVisible(hwnd):
            _, found_pid = win32process.GetWindowThreadProcessId(hwnd)
            if found_pid == pid:
                hwnds.append(hwnd)
        return True
    hwnds = []
    try:
        win32gui.EnumWindows(callback, hwnds)
    except Exception:
        pass
    return hwnds

for p in psutil.process_iter(['pid', 'name', 'exe', 'cmdline']):
    name = (p.info['name'] or '').lower()
    if 'chrome' in name or 'edge' in name or 'brave' in name:
        pid = p.info['pid']
        hwnds = get_hwnds_for_pid(pid)
        titles = [win32gui.GetWindowText(h) for h in hwnds if win32gui.GetWindowText(h)]
        print(f"PID: {pid:6d} | Name: {p.info['name']:20s} | Visible Windows: {len(hwnds)} {titles}")
