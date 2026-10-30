# -*- coding: utf-8 -*-
"""
=============================================================================
🌸 DIANA ALWAYS-LISTENING BACKGROUND WAKE-WORD LISTENER ("Diana ơi") 🌸
Tương tự Siri / Hey Siri trên macOS & iOS:
- Luôn chạy ngầm siêu nhẹ, tiêu thụ 0% CPU khi im lặng
- Lắng nghe từ khóa: "Diana ơi", "Ơi Diana", "Hey Diana", "Diana", "Điana"
- Phát âm thanh phản hồi Siri đặc trưng (C6 -> E6 Dual Chime)
- Chào đón ngọt ngào: "Dạ em nghe ạ!"
- Tiếp nhận câu lệnh thoại tiếng Việt và thực thi thao tác trên PC hoặc AI Cloud
- Phản hồi bằng giọng đọc tiếng Việt ngọt ngào Hoài My Neural (Microsoft Edge-TTS)
=============================================================================
"""

import os
import sys
import time
import re
import json
import signal
import asyncio
import threading
import queue
import subprocess
import webbrowser
import winsound
import unicodedata
import ctypes
from datetime import datetime

# Windows Win32 GUI & Desktop Integration
try:
    import win32gui
    import win32con
    import win32api
    import win32service
    HAS_WIN32 = True
except Exception:
    HAS_WIN32 = False

# Audio libraries
import speech_recognition as sr
import pygame
import edge_tts
import requests

# Đảm bảo đầu ra stdout / stderr dùng UTF-8 trên Windows
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# Các đường dẫn quan trọng
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
PID_FILE = os.path.join(PROJECT_ROOT, '.diana_wake.pid')
EVENT_FILE = os.path.join(PROJECT_ROOT, '.diana_wake_event.json')
CACHE_DIR = os.path.join(PROJECT_ROOT, 'data', 'wake_cache')
LOCAL_VOICE_API = 'http://localhost:3000/api/voice'
CLOUD_VOICE_API = 'https://diana-h73u.onrender.com/api/voice'

# Hàng đợi âm thanh đa luồng để ghi âm liên tục 100%, không bao giờ mất tiếng khi chờ mạng STT
AUDIO_QUEUE = queue.Queue(maxsize=15)
IS_SPEAKING = False

# Regex nhận diện từ khóa đánh thức (Wake Words)
# Mở rộng TOÀN BỘ các biến thể phát âm thực tế mà Google STT nhận diện được từ giọng nói tự nhiên:
# - Có từ 'ơi': "Diana ơi", "Dina ơi", "Dana ơi", "Đan ơi", "Bé Na ơi", "Em ơi", "Đen ơi"...
# - Có tiền tố chào hỏi: "Hey Diana", "Chào Diana", "Alo Diana", "Ê Diana", "Ok Diana"...
# - Tên đứng một mình hoặc đứng đầu câu lệnh: "Diana", "Dana", "Dina", "Đan", "Bé Na", "Deana"...
WAKE_REGEX = re.compile(
    r'\b(?:'
    r'(?:ơi\s+)?(?:diana|điana|dina|đina|di\s*na|đi\s*na|deana|deanna|dyna|dana|đa\s*na|da\s*na|bé\s*na|bena|na|đen|đan|đăng|thứ\s*ba|em)\s*ơi|'
    r'(?:hey|alo|ê|chào|này|ok|em)\s+(?:diana|điana|dina|đina|di\s*na|đi\s*na|deana|deanna|dyna|dana|đa\s*na|da\s*na|bé\s*na|bena|na|đan|đen)|'
    r'diana|điana|dina|đina|deana|deanna|dyna|dana|đa\s*na|da\s*na|bé\s*na|bena|'
    r'di\s*a\s*na|đi\s*a\s*na|di\s*na|đi\s*na'
    r')\b',
    re.IGNORECASE | re.UNICODE
)

# Cờ dừng tiến trình
RUNNING = True

LOG_FILE = os.path.join(PROJECT_ROOT, 'wake_listener.log')

def log(msg, level='INFO'):
    ts = datetime.now().strftime('%H:%M:%S')
    line = f"[{ts}] [{level}] {msg}"
    try:
        if sys.stdout and not sys.stdout.closed:
            print(line, flush=True)
    except Exception:
        pass
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception:
        pass

# ---------------------------------------------------------------------------
# ÂM THANH PHẢN HỒI KIỂU SIRI (SIRI-STYLE DUAL-TONE CHIMES)
# ---------------------------------------------------------------------------
def play_siri_wake():
    """Âm báo đánh thức kép trong trẻo như Siri (C6 1046Hz -> E6 1318Hz)"""
    try:
        winsound.Beep(1046, 110)
        time.sleep(0.02)
        winsound.Beep(1318, 170)
    except Exception:
        pass

def play_siri_ready():
    """Âm báo đã nhận lệnh và bắt đầu thực hiện (E6 1318Hz -> C6 1046Hz)"""
    try:
        winsound.Beep(1318, 100)
        time.sleep(0.02)
        winsound.Beep(1046, 160)
    except Exception:
        pass

def play_siri_error():
    """Âm báo không nhận diện được"""
    try:
        winsound.Beep(440, 150)
    except Exception:
        pass

# ---------------------------------------------------------------------------
# HỆ THỐNG GIỌNG NÓI DIANA (MICROSOFT EDGE-TTS)
# ---------------------------------------------------------------------------
def ensure_cache_dir():
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR, exist_ok=True)

def pre_cache_standard_prompts():
    """Tạo sẵn các câu phản hồi nhanh để phát tức thì 0ms delay"""
    ensure_cache_dir()
    prompts = {
        'hear_you': 'Dạ em nghe ạ!',
        'processing': 'Dạ em đang xử lý ạ!',
        'did_not_hear': 'Dạ em chưa nghe rõ, anh nói lại giúp em nhé!'
    }
    for name, text in prompts.items():
        cache_path = os.path.join(CACHE_DIR, f"{name}.mp3")
        if not os.path.exists(cache_path) or os.path.getsize(cache_path) < 1000:
            try:
                async def _gen(t, p):
                    comm = edge_tts.Communicate(t, 'vi-VN-HoaiMyNeural', rate='+10%')
                    await comm.save(p)
                asyncio.run(_gen(text, cache_path))
            except Exception as e:
                log(f"Lỗi tạo cache voice {name}: {e}", 'WARN')

def play_cached_voice(name):
    """Phát file âm thanh prompt đã cache"""
    cache_path = os.path.join(CACHE_DIR, f"{name}.mp3")
    if os.path.exists(cache_path):
        play_audio_file(cache_path)
    else:
        speak_text("Dạ em nghe ạ!")

def play_audio_file(file_path):
    """Phát file audio MP3/WAV an toàn qua pygame.mixer"""
    global IS_SPEAKING
    IS_SPEAKING = True
    try:
        if not pygame.mixer.get_init():
            pygame.mixer.init()
        pygame.mixer.music.load(file_path)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy() and RUNNING:
            time.sleep(0.04)
        pygame.mixer.music.unload()
    except Exception as e:
        log(f"Lỗi phát audio {file_path}: {e}", 'WARN')
    finally:
        time.sleep(0.2)
        IS_SPEAKING = False

def clean_for_speech(text):
    """
    Chuẩn hóa văn bản trước khi đọc bằng Microsoft Edge-TTS:
    - Loại bỏ triệt để markdown (*, _, #, `, ~, >)
    - Loại bỏ hoàn toàn tất cả emoji unicode (SMP, Dingbats, pictographs, variation selectors)
      để tránh trường hợp Edge-TTS đọc to tên tiếng Việt của emoji:
      Ví dụ: 🌐 đọc thành 'Quả địa cầu có đường kinh tuyến' ('đường kim tuyến')
             ✨ đọc thành 'Ánh sáng lấp lánh' / 'Đường kim tuyến'
    """
    if not text:
        return ""
    t = re.sub(r'[\*\_#`~>]', '', text)
    emoji_pattern = re.compile(
        r'[\U00010000-\U0010ffff]'  # SMP emojis (🌐, 🌸, 🖨️, 💬, 🎮, 🌙, etc.)
        r'|[\u2600-\u27bf]'          # Dingbats, Miscellaneous Symbols (✨, ⚡, ❄️, etc.)
        r'|[\u2300-\u23ff]'          # Technical symbols
        r'|[\u2b50-\u2b55]'          # Stars
        r'|[\ufe00-\ufe0f]'          # Variation selectors
        r'|[\u200d]'                 # Zero-width joiner
    )
    t = emoji_pattern.sub('', t)
    return re.sub(r'\s+', ' ', t).strip()

def speak_text(text):
    """Đọc văn bản bằng giọng tiếng Việt Hoài My Neural (Microsoft Edge-TTS)"""
    if not text or not text.strip():
        return

    clean_text = clean_for_speech(text)
    if not clean_text:
        return

    temp_path = os.path.join(CACHE_DIR, f"temp_{int(time.time() * 1000)}.mp3")
    try:
        async def _speak():
            comm = edge_tts.Communicate(clean_text, 'vi-VN-HoaiMyNeural', rate='+10%')
            await comm.save(temp_path)
        asyncio.run(_speak())

        if os.path.exists(temp_path) and os.path.getsize(temp_path) > 500:
            play_audio_file(temp_path)
    except Exception as e:
        log(f"Lỗi đọc TTS Edge: {e}. Thử SAPI fallback...", 'WARN')
        # Fallback Windows SAPI
        try:
            import win32com.client
            speaker = win32com.client.Dispatch("SAPI.SpVoice")
            speaker.Speak(clean_text)
        except Exception:
            pass
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

# ---------------------------------------------------------------------------
# THÔNG BÁO SỰ KIỆN CHO DIANA STATION & PC AGENT
# ---------------------------------------------------------------------------
def broadcast_wake_event(event_type, query='', reply=''):
    """Ghi sự kiện ra file và gọi API local để Diana Station UI bắt được"""
    event_data = {
        'event': event_type,
        'query': query,
        'reply': reply,
        'timestamp': int(time.time() * 1000),
        'time': datetime.now().strftime('%H:%M:%S')
    }
    try:
        with open(EVENT_FILE, 'w', encoding='utf-8') as f:
            json.dump(event_data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

# ---------------------------------------------------------------------------
# HỆ THỐNG KHÔI PHỤC CỬA SỔ & KHỞI CHẠY ỨNG DỤNG THÔNG MINH (GUI INTEGRATION)
# ---------------------------------------------------------------------------
def remove_accents(s):
    if not s:
        return ""
    nfkd = unicodedata.normalize('NFKD', s)
    return ''.join([c for c in nfkd if not unicodedata.combining(c)]).lower().strip()

def ensure_default_desktop():
    """Đảm bảo thread kết nối tới winsta0\\default để tương tác trực tiếp với Desktop người dùng"""
    if not HAS_WIN32:
        return
    try:
        hdesk = win32service.OpenDesktop('default', 0, False, win32con.GENERIC_ALL)
        hdesk.SetThreadDesktop()
    except Exception:
        pass

def restore_and_focus_window(title_kw):
    """
    Tìm cửa sổ (kể cả đang thu nhỏ xuống taskbar hoặc ẩn trong system tray / Efficiency Mode)
    và kéo bật lên màn hình trước mặt:
    - Loại bỏ triệt để các tooltip, popup khay hệ thống siêu nhỏ (VD: Zalo 352x82 px)
    - Luôn chọn cửa sổ chính lớn nhất (w >= 400 và h >= 250, sort area giảm dần)
    - Sử dụng đồng thời ShowWindow + SwitchToThisWindow + SetForegroundWindow để phá bỏ chế độ tiết kiệm
    """
    if not HAS_WIN32:
        return False
    ensure_default_desktop()
    try:
        candidates = []
        kw = title_kw.lower().strip()

        def enum_cb(hwnd, _):
            t = win32gui.GetWindowText(hwnd).strip()
            t_lower = t.lower()
            c = win32gui.GetClassName(hwnd).strip()
            c_lower = c.lower()

            # Tránh nhầm lẫn với IDE Antigravity / Zalo Bot đang làm việc
            if 'antigravity' in t_lower or 'zalo bot' in t_lower:
                return True

            matched = False
            if kw == 'zalo':
                if 'zalo' in t_lower and 'zalocap' not in t_lower:
                    matched = True
            elif kw == 'chrome':
                if ('google chrome' in t_lower or t_lower.endswith('- chrome') or t_lower.endswith('google chrome') or (c_lower == 'chrome_widgetwin_1' and 'chrome' in t_lower)):
                    matched = True
            elif kw == 'bambu':
                if 'bambu' in t_lower or 'bambu' in c_lower:
                    matched = True
            elif kw in ['league of legends', 'lol', 'riot']:
                if 'league of legends' in t_lower or 'riot client' in t_lower or c_lower == 'rclient':
                    matched = True
            else:
                if kw in t_lower:
                    matched = True

            if matched:
                try:
                    r = win32gui.GetWindowRect(hwnd)
                    w = r[2] - r[0]
                    h = r[3] - r[1]
                    is_iconic = bool(win32gui.IsIconic(hwnd))
                    # Lấy cửa sổ làm việc thực tế (chấp nhận cửa sổ đang minimized hoặc có kích thước >= 400x250)
                    if is_iconic or (w >= 400 and h >= 250):
                        area = (1920 * 1080) if is_iconic else (w * h)
                        candidates.append({
                            'hwnd': hwnd,
                            'area': area,
                            'width': w,
                            'height': h,
                            'title': t,
                            'class': c,
                            'is_iconic': is_iconic
                        })
                except Exception:
                    pass
            return True

        win32gui.EnumWindows(enum_cb, None)
        if candidates:
            # Chọn cửa sổ có diện tích LỚN NHẤT (cửa sổ chính của ứng dụng)
            candidates.sort(key=lambda x: x['area'], reverse=True)
            best = candidates[0]
            best_hwnd = best['hwnd']

            user32 = ctypes.windll.user32
            # 1. Khôi phục kích thước bình thường và hiển thị
            user32.ShowWindow(best_hwnd, win32con.SW_RESTORE)
            user32.ShowWindow(best_hwnd, win32con.SW_SHOWMAXIMIZED)

            # 2. SwitchToThisWindow: Kéo ứng dụng từ background / Efficiency Mode lên màn hình
            try:
                user32.SwitchToThisWindow(best_hwnd, True)
            except Exception:
                pass

            # 3. Kích hoạt quyền ưu tiên Foreground bằng ALT key bypass + AttachThreadInput
            try:
                fg_hwnd = user32.GetForegroundWindow()
                fg_thread = user32.GetWindowThreadProcessId(fg_hwnd, None)
                cur_thread = win32api.GetCurrentThreadId()
                if fg_thread and fg_thread != cur_thread:
                    user32.AttachThreadInput(cur_thread, fg_thread, True)
                win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
                user32.SetForegroundWindow(best_hwnd)
                user32.BringWindowToTop(best_hwnd)
                win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
                if fg_thread and fg_thread != cur_thread:
                    user32.AttachThreadInput(cur_thread, fg_thread, False)
            except Exception:
                pass

            log(f"🪟 Đã khôi phục và đưa cửa sổ '{title_kw}' (HWND {best_hwnd}, {best['width']}x{best['height']}) lên trước màn hình!", 'SUCCESS')
            return True
    except Exception as e:
        log(f"Lỗi khôi phục cửa sổ '{title_kw}': {e}", 'WARN')
    return False

def find_installed_shortcut(query):
    """Tìm file shortcut .lnk hoặc .exe trong Desktop và Start Menu"""
    q = remove_accents(query)
    search_dirs = [
        os.path.expanduser(r'~\Desktop'),
        r'C:\Users\Public\Desktop',
        os.path.expanduser(r'~\AppData\Roaming\Microsoft\Windows\Start Menu\Programs'),
        r'C:\ProgramData\Microsoft\Windows\Start Menu\Programs'
    ]
    for d in search_dirs:
        if not os.path.exists(d):
            continue
        try:
            for root, _, files in os.walk(d):
                for f in files:
                    if f.lower().endswith('.lnk') or f.lower().endswith('.exe'):
                        name = remove_accents(f.rsplit('.', 1)[0])
                        if q == name or q in name or any(part in name for part in q.split() if len(part) >= 3):
                            return os.path.join(root, f)
        except Exception:
            pass
    return None

def launch_or_focus_app(app_name):
    """
    Khởi chạy hoặc đưa ứng dụng lên màn hình chính một cách chắc chắn:
    1. Kiểm tra nếu app đã mở -> restore và focus ngay lập tức
    2. Nếu chưa mở -> Dùng explorer.exe / os.startfile để khởi chạy trực tiếp vào Desktop người dùng
    3. Chờ 1.2s rồi gọi restore_and_focus_window để đưa lên Foreground
    """
    clean_name = app_name.strip()
    norm = remove_accents(clean_name)
    log(f"🚀 [Khởi chạy ứng dụng]: '{clean_name}' (norm: '{norm}')", 'INFO')

    # 1. Xử lý Bambu Studio / Máy in 3D (Đặc biệt xử lý các biến thể STT: album studio, bảo bối studio, bản in studio)
    if any(k in norm for k in ['bambu', 'album studio', 'bao boi studio', 'ban in studio', 'may in', 'in 3d', 'studio']):
        if restore_and_focus_window('Bambu'):
            return "Dạ em đã đưa phần mềm in 3D Bambu Studio lên màn hình cho anh rồi ạ!"
        bambu_paths = [
            r'C:\Users\Public\Desktop\Bambu Studio.lnk',
            r'D:\BambuStudio\Bambu Studio\bambu-studio.exe'
        ]
        for p in bambu_paths:
            if os.path.exists(p):
                try:
                    if p.endswith('.lnk'):
                        os.startfile(p)
                    else:
                        subprocess.Popen([p])
                    time.sleep(1.5)
                    restore_and_focus_window('Bambu')
                    return "Dạ em đã mở phần mềm in 3D Bambu Studio cho anh rồi ạ!"
                except Exception:
                    pass
        return "Dạ em đã mở Bambu Studio cho anh rồi ạ!"

    # 2. Xử lý Zalo
    if any(k in norm for k in ['zalo', 'gia lo', 'dalo']):
        if restore_and_focus_window('Zalo'):
            return "Dạ em đã đưa ứng dụng Zalo lên màn hình cho anh rồi ạ!"
        zalo_paths = [
            os.path.expanduser(r'~\Desktop\Zalo.lnk'),
            os.path.expanduser(r'~\AppData\Local\Programs\Zalo\Zalo.exe')
        ]
        for p in zalo_paths:
            if os.path.exists(p):
                try:
                    if p.endswith('.lnk'):
                        os.startfile(p)
                    else:
                        subprocess.Popen([p])
                    time.sleep(1.5)
                    restore_and_focus_window('Zalo')
                    return "Dạ em đã mở ứng dụng Zalo cho anh rồi ạ!"
                except Exception:
                    pass
        try:
            os.system('start zalo:')
            time.sleep(1.5)
            restore_and_focus_window('Zalo')
        except Exception:
            pass
        return "Dạ em đã mở ứng dụng Zalo cho anh rồi ạ!"

    # 3. Xử lý Chrome / Trình duyệt web
    if any(k in norm for k in ['chrome', 'trinh duyet', 'google chrome', 'web', 'coc coc']):
        if restore_and_focus_window('Chrome'):
            return "Dạ em đã đưa trình duyệt Chrome lên màn hình cho anh rồi ạ!"
        chrome_shortcuts = [
            r'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Google Chrome.lnk',
            r'C:\Users\Public\Desktop\Google Chrome.lnk',
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
        ]
        launched = False
        for p in chrome_shortcuts:
            if os.path.exists(p):
                try:
                    if p.endswith('.lnk'):
                        os.startfile(p)
                    else:
                        subprocess.Popen([p, '--start-maximized', 'https://www.google.com'])
                    launched = True
                    break
                except Exception as e:
                    log(f"Lỗi khởi chạy Chrome từ {p}: {e}", 'WARN')
        if not launched:
            try:
                subprocess.Popen(['cmd.exe', '/c', 'start', 'chrome', 'https://www.google.com'])
                launched = True
            except Exception:
                pass
        time.sleep(1.8)
        restore_and_focus_window('Chrome')
        return "Dạ em đã mở trình duyệt Chrome cho anh rồi ạ!"

    # 4. Xử lý Liên Minh Huyền Thoại / League of Legends / Riot
    if any(k in norm for k in ['lien minh', 'lol', 'lmht', 'riot', 'dau truong chan ly', 'dtcl']):
        if restore_and_focus_window('League of Legends') or restore_and_focus_window('Riot Client'):
            return "Dạ em đã đưa Liên Minh Huyền Thoại lên màn hình cho anh rồi ạ!"
        riot_paths = [
            r'C:\Users\Public\Desktop\Riot Client.lnk',
            r'C:\Riot Games\Riot Client\RiotClientServices.exe'
        ]
        for p in riot_paths:
            if os.path.exists(p):
                try:
                    if p.endswith('.lnk'):
                        os.startfile(p)
                    else:
                        subprocess.Popen([p])
                    time.sleep(1.5)
                    restore_and_focus_window('League of Legends')
                    return "Dạ em đã mở Liên Minh Huyền Thoại cho anh rồi ạ! Chúc anh leo rank vui vẻ!"
                except Exception:
                    pass

    # 5. Xử lý VS Code
    if any(k in norm for k in ['vscode', 'vs code', 'code', 'visual studio code']):
        if restore_and_focus_window('Visual Studio Code'):
            return "Dạ em đã đưa Visual Studio Code lên màn hình cho anh rồi ạ!"
        try:
            subprocess.Popen(['code'], shell=True)
            return "Dạ em đã mở Visual Studio Code để anh làm việc rồi ạ!"
        except Exception:
            pass

    # 6. Xử lý Word / Excel / PowerPoint
    if 'word' in norm:
        if restore_and_focus_window('Word'):
            return "Dạ em đã đưa Microsoft Word lên màn hình cho anh rồi ạ!"
        try:
            subprocess.Popen(['cmd.exe', '/c', 'start', 'winword'], shell=True)
            return "Dạ em đã mở Microsoft Word cho anh rồi ạ!"
        except Exception:
            pass

    if 'excel' in norm:
        if restore_and_focus_window('Excel'):
            return "Dạ em đã đưa Microsoft Excel lên màn hình cho anh rồi ạ!"
        try:
            subprocess.Popen(['cmd.exe', '/c', 'start', 'excel'], shell=True)
            return "Dạ em đã mở Microsoft Excel cho anh rồi ạ!"
        except Exception:
            pass

    if 'powerpoint' in norm or 'ppt' in norm:
        if restore_and_focus_window('PowerPoint'):
            return "Dạ em đã đưa Microsoft PowerPoint lên màn hình cho anh rồi ạ!"
        try:
            subprocess.Popen(['cmd.exe', '/c', 'start', 'powerpnt'], shell=True)
            return "Dạ em đã mở Microsoft PowerPoint cho anh rồi ạ!"
        except Exception:
            pass

    # 7. Xử lý Máy tính (Calc) & Notepad
    if any(k in norm for k in ['may tinh', 'calculator', 'calc']):
        restore_and_focus_window('Calculator')
        try:
            subprocess.Popen(['calc.exe'])
            return "Dạ em đã bật ứng dụng Máy tính Calculator cho anh rồi ạ!"
        except Exception:
            pass

    if any(k in norm for k in ['notepad', 'ghi chu']):
        restore_and_focus_window('Notepad')
        try:
            subprocess.Popen(['notepad.exe'])
            return "Dạ em đã mở Notepad cho anh ghi chú rồi ạ!"
        except Exception:
            pass

    # 8. Thử quét shortcut trong Desktop & Start Menu
    shortcut = find_installed_shortcut(clean_name)
    if shortcut:
        try:
            os.startfile(shortcut)
            return f"Dạ em đã mở {clean_name} cho anh rồi ạ!"
        except Exception as e:
            log(f"Lỗi startfile {shortcut}: {e}", 'WARN')

    # 9. Fallback: Gửi tới local PC Agent (WindowsController)
    try:
        res = requests.post('http://localhost:3000/api/pc/action', json={'action': 'open', 'target': clean_name}, timeout=4)
        if res.status_code == 200 and res.json().get('success'):
            return f"Dạ em đã mở {clean_name} cho anh rồi ạ!"
    except Exception:
        pass

    return f"Dạ em đang khởi chạy {clean_name} cho anh ạ!"

# ---------------------------------------------------------------------------
# XỬ LÝ LỆNH THOẠI TRÊN MÁY TÍNH (LOCAL FAST COMMANDS + AI CLOUD)
# ---------------------------------------------------------------------------
def execute_voice_command(raw_query):
    query = raw_query.strip()
    if not query:
        return "Dạ em đây ạ! Anh cần em giúp gì không ạ?"

    log(f"🎤 [Thực thi lệnh]: '{query}'", 'INFO')
    play_siri_ready()

    # Chuẩn hóa loại bỏ các từ xưng hô và trợ từ đệm tiếng Việt (VD: "em mở...", "...lên cho anh đi")
    clean_cmd = re.sub(r'^(?:em\s+ơi|ơi\s+em|em|bạn|diana|dina|dana|hãy)\s+', '', query, flags=re.IGNORECASE).strip()
    clean_cmd = re.sub(r'\s+(?:lên\s+)?(?:cho\s+anh|hộ\s+anh|giúp\s+anh|giúp\s+em|đi|với|nhe|nhé|nha|ạ)$', '', clean_cmd, flags=re.IGNORECASE).strip()
    q_lower = clean_cmd.lower()

    # 0. Bắt trực tiếp tên app / phần mềm mà người dùng yêu cầu mở
    open_match = re.search(r'^(?:mở|bật|chạy|vào|khởi\s+chạy|open)\s+(.+)', clean_cmd, flags=re.IGNORECASE)
    if open_match:
        app_target = open_match.group(1).strip()
        # Loại trừ nếu là mở youtube, google, facebook, portal đã có handler chuyên dụng bên dưới
        if not any(k in app_target.lower() for k in ['youtube', 'google', 'facebook', 'cổng trường', 'portal', 'chatgpt']):
            return launch_or_focus_app(app_target)

    # Bắt trực tiếp câu lệnh nói ngắn gọn không có chữ 'mở'
    if any(k in q_lower for k in ['album studio', 'bảo bối studio', 'bản in studio', 'bambu studio', 'bambu']):
        return launch_or_focus_app('bambu')

    if any(k in q_lower for k in ['zalo cho anh', 'vào zalo', 'bật zalo', 'mở zalo', 'zalo']):
        return launch_or_focus_app('zalo')

    if any(k in q_lower for k in ['chrome cho anh', 'vào chrome', 'bật chrome', 'mở chrome', 'chrome']):
        return launch_or_focus_app('chrome')

    # 1. Xem giờ / ngày tháng
    if any(k in q_lower for k in ['mấy giờ', 'bây giờ là mấy giờ', 'thời gian', 'ngày mấy', 'hôm nay ngày']):
        now = datetime.now()
        time_str = f"Bây giờ là {now.hour} giờ {now.minute:02d} phút, ngày {now.day} tháng {now.month} năm {now.year} ạ."
        return time_str

    # 2. Khóa máy tính
    if any(k in q_lower for k in ['khóa máy', 'khóa màn hình', 'lock pc', 'khóa pc', 'khóa máy tính']):
        try:
            subprocess.run(['rundll32.exe', 'user32.dll,LockWorkStation'], check=False)
            return "Dạ em đã khóa màn hình máy tính của anh rồi ạ!"
        except Exception as e:
            return f"Dạ có lỗi khi khóa máy: {e}"

    # 3. Đi ngủ / Sleep máy tính
    if any(k in q_lower for k in ['đi ngủ', 'sleep máy', 'chế độ ngủ', 'tắt màn hình']):
        try:
            ps_cmd = 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)'
            subprocess.run(['powershell', '-NoProfile', '-Command', ps_cmd], check=False)
            return "Dạ chúc anh Tiến ngủ ngon ạ! Em đang đưa máy vào chế độ Sleep đây ạ!"
        except Exception as e:
            return f"Lỗi đưa vào sleep: {e}"

    # 4. Mở YouTube
    if 'youtube' in q_lower:
        search_match = re.search(r'(?:tìm|mở|bật|nghe|xem)\s+(?:bài\s+hát|nhạc|video)?\s*(.*?)\s*(?:trên\s+)?youtube', q_lower)
        target_song = search_match.group(1).strip() if search_match else ''
        if target_song and target_song not in ['nhạc', 'video', 'youtube']:
            url = f"https://www.youtube.com/results?search_query={target_song.replace(' ', '+')}"
            webbrowser.open(url)
            return f"Dạ em đã mở tìm kiếm '{target_song}' trên YouTube cho anh rồi ạ!"
        else:
            webbrowser.open('https://www.youtube.com')
            return "Dạ em đã mở YouTube cho anh rồi ạ!"

    # 5. Mở Google / Tìm kiếm Google
    if 'google' in q_lower or q_lower.startswith('tìm kiếm') or q_lower.startswith('tra cứu'):
        search_kw = re.sub(r'^(?:mở\s+google|tìm\s+kiếm|tra\s+cứu|google)\s*', '', query, flags=re.IGNORECASE).strip()
        if search_kw:
            url = f"https://www.google.com/search?q={search_kw.replace(' ', '+')}"
            webbrowser.open(url)
            return f"Dạ em đã tìm kiếm '{search_kw}' trên Google cho anh rồi ạ!"
        else:
            webbrowser.open('https://www.google.com')
            return "Dạ em đã mở Google cho anh rồi ạ!"

    # 6. Mở Facebook
    if 'facebook' in q_lower or 'fb' in q_lower:
        webbrowser.open('https://www.facebook.com')
        return "Dạ em đã mở Facebook cho anh rồi ạ!"

    # 7. Mở GitHub
    if 'github' in q_lower:
        webbrowser.open('https://github.com')
        return "Dạ em đã mở GitHub cho anh rồi ạ!"

    # 8. Mở ChatGPT
    if 'chatgpt' in q_lower or 'chat gpt' in q_lower:
        webbrowser.open('https://chatgpt.com')
        return "Dạ em đã mở ChatGPT cho anh rồi ạ!"

    # 9. Mở Cổng thông tin trường TDTU (Portal sinh viên)
    if any(k in q_lower for k in ['cổng trường', 'portal', 'xem điểm', 'thời khóa biểu']):
        webbrowser.open('https://portal.tdtu.edu.vn')
        return "Dạ em đã mở Cổng thông tin sinh viên TDTU cho anh Tiến rồi ạ!"

    # 10. Mở Trình duyệt Chrome / Web
    if any(k in q_lower for k in ['chrome', 'trình duyệt', 'google chrome', 'mở web', 'cốc cốc']):
        return launch_or_focus_app('chrome')

    # 11. Mở Word / Excel / PowerPoint
    if 'word' in q_lower:
        return launch_or_focus_app('word')

    if 'excel' in q_lower:
        return launch_or_focus_app('excel')

    if 'powerpoint' in q_lower or 'ppt' in q_lower:
        return launch_or_focus_app('powerpoint')

    # 12. Mở Zalo
    if 'zalo' in q_lower:
        return launch_or_focus_app('zalo')

    # 13. Mở Visual Studio Code
    if any(k in q_lower for k in ['vscode', 'vs code', 'code', 'visual studio code']):
        return launch_or_focus_app('vscode')

    # 14. Mở Máy tính (Calculator)
    if any(k in q_lower for k in ['máy tính', 'calculator', 'calc']) and not any(k in q_lower for k in ['khóa', 'tắt', 'sleep']):
        return launch_or_focus_app('calculator')

    # 15. Mở Notepad
    if any(k in q_lower for k in ['notepad', 'ghi chú']):
        return launch_or_focus_app('notepad')

    # 16. Mở Trạm Diana Central Station
    if any(k in q_lower for k in ['trạm diana', 'central station', 'mở trạm']):
        try:
            station_path = os.path.join(PROJECT_ROOT, 'Mo_Diana_Station.bat')
            if os.path.exists(station_path):
                subprocess.Popen(['cmd.exe', '/c', station_path], cwd=PROJECT_ROOT)
            return "Dạ em đã mở giao diện Trạm Trung Tâm Diana cho anh rồi ạ!"
        except Exception:
            pass

    # 17. Điều chỉnh âm lượng & Media
    if any(k in q_lower for k in ['tăng âm lượng', 'lớn hơn', 'to hơn', 'volume up']):
        try:
            import pyautogui
            for _ in range(5):
                pyautogui.press('volumeup')
            return "Dạ em đã tăng âm lượng rồi ạ!"
        except Exception:
            pass

    if any(k in q_lower for k in ['giảm âm lượng', 'nhỏ lại', 'bé lại', 'volume down']):
        try:
            import pyautogui
            for _ in range(5):
                pyautogui.press('volumedown')
            return "Dạ em đã giảm âm lượng rồi ạ!"
        except Exception:
            pass

    if any(k in q_lower for k in ['tắt tiếng', 'tắt âm', 'mute', 'im lặng']):
        try:
            import pyautogui
            pyautogui.press('volumemute')
            return "Dạ em đã tắt tiếng rồi ạ!"
        except Exception:
            pass

    if any(k in q_lower for k in ['dừng nhạc', 'tạm dừng', 'tiếp tục phát', 'bật nhạc', 'play', 'pause']):
        try:
            import pyautogui
            pyautogui.press('playpause')
            return "Dạ em đã thực hiện lệnh phát hoặc dừng nhạc cho anh rồi ạ!"
        except Exception:
            pass

    # 18. Chuyển tiếp tới Diana PC Agent (/api/voice trên port 3000) hoặc Cloud Render
    # Xử lý: Bambu Lab A1 mini, chụp màn hình PC, câu hỏi AI thông minh, nhắc nhở...
    log("📡 Đang gửi yêu cầu tới Diana AI Service...", 'INFO')
    for api_url in [LOCAL_VOICE_API, CLOUD_VOICE_API]:
        try:
            res = requests.post(api_url, json={'query': query}, timeout=8)
            if res.status_code == 200:
                data = res.json()
                reply_text = ''
                if isinstance(data.get('reply'), str):
                    reply_text = data.get('reply')
                elif isinstance(data.get('reply'), dict):
                    reply_text = data.get('reply', {}).get('text', '')
                elif data.get('message'):
                    reply_text = data.get('message')

                if reply_text:
                    return reply_text
        except Exception:
            continue

    return f"Dạ em đã nhận được lệnh '{query}' từ anh Tiến rồi ạ!"

# ---------------------------------------------------------------------------
# VÒNG LẶP LẮNG NGHE TỪ KHÓA NỀN (CONTINUOUS WAKE WORD LOOP)
# ---------------------------------------------------------------------------
def audio_capture_worker(recognizer, microphone):
    """Luồng ghi âm liên tục độc lập: Không bao giờ bị chặn hay gián đoạn bởi mạng STT hay TTS"""
    global RUNNING
    with microphone as source:
        while RUNNING:
            try:
                # Ghi âm liên tục mỗi đoạn 3.5 - 4.5 giây
                audio = recognizer.listen(source, timeout=1.0, phrase_time_limit=4.5)
                if not IS_SPEAKING:
                    try:
                        AUDIO_QUEUE.put_nowait(audio)
                    except queue.Full:
                        try:
                            AUDIO_QUEUE.get_nowait()
                        except Exception:
                            pass
                        AUDIO_QUEUE.put_nowait(audio)
            except sr.WaitTimeoutError:
                continue
            except Exception:
                time.sleep(0.1)

def wake_listener_loop():
    global RUNNING
    recognizer = sr.Recognizer()
    
    # SIÊU NHẠY: Bắt trọn giọng nói thì thầm, nói nhỏ hoặc ở xa, KHÔNG CẦN NÓI TO
    recognizer.dynamic_energy_threshold = False  # Cố định ngưỡng, tuyệt đối không tự ý tăng làm điếc mic
    recognizer.energy_threshold = 65            # Ngưỡng 65 RMS siêu nhạy (bắt trọn âm lượng nói bình thường và nói nhỏ)
    recognizer.pause_threshold = 0.5            # Phản hồi cực nhanh (500ms sau khi dứt câu)
    recognizer.phrase_threshold = 0.15          # Bắt ngay cả các từ ngắn như "Ơi", "Na", "Nè"
    recognizer.non_speaking_duration = 0.3

    log("🎤 Đang khởi tạo Microphone...", 'INFO')
    try:
        microphone = sr.Microphone()
    except Exception as e:
        log(f"❌ Không thể mở Microphone: {e}", 'FATAL')
        return

    with microphone as source:
        log("🔄 Đang kiểm tra âm lượng Microphone...", 'INFO')
        recognizer.adjust_for_ambient_noise(source, duration=0.4)
        # Giữ ngưỡng năng lượng luôn trong vùng siêu nhạy (50 - 80 RMS)
        recognizer.energy_threshold = min(max(recognizer.energy_threshold, 50), 80)
        recognizer.dynamic_energy_threshold = False
        log(f"✅ Microphone đã sẵn sàng! (Ngưỡng siêu nhạy: {int(recognizer.energy_threshold)} RMS - Nói nhỏ vẫn nghe rõ)", 'SUCCESS')

    log("🌸 DIANA STATION ĐANG CHẠY NGẦM VÀ LẮNG NGHE 'Diana ơi'...", 'SUCCESS')
    broadcast_wake_event('ready', reply='Diana luôn lắng nghe...')

    # Khởi động luồng ghi âm ngầm liên tục 100% (không bao giờ drop tiếng của người dùng)
    capture_thread = threading.Thread(target=audio_capture_worker, args=(recognizer, microphone), daemon=True)
    capture_thread.start()

    awaiting_command_until = 0

    while RUNNING:
        try:
            try:
                audio = AUDIO_QUEUE.get(timeout=1.0)
            except queue.Empty:
                continue

            if IS_SPEAKING:
                continue

            # Nhận diện bằng Google Speech Recognition tiếng Việt
            try:
                text = recognizer.recognize_google(audio, language="vi-VN")
            except sr.UnknownValueError:
                continue
            except sr.RequestError as e:
                time.sleep(0.5)
                continue

            clean_text = text.strip()
            log(f"👂 [Nghe được]: '{clean_text}'", 'INFO')

            now = time.time()
            wake_match = WAKE_REGEX.search(clean_text)

            # -------------------------------------------------------------
            # TRƯỜNG HỢP 1: PHÁT HIỆN TỪ KHÓA ĐÁNH THỨC "DIANA ƠI" / "DINA ƠI"
            # -------------------------------------------------------------
            if wake_match:
                log(f"✨ [WAKE TRIGGER]: Phát hiện từ khóa '{wake_match.group(0)}'!", 'SUCCESS')
                play_siri_wake()

                # Tách phần câu lệnh sau từ khóa đánh thức
                command_part = WAKE_REGEX.sub('', clean_text).strip(' ,.?!')

                if len(command_part) >= 3:
                    # Nói liền một câu (VD: "Diana ơi mở Chrome cho anh")
                    awaiting_command_until = 0
                    log(f"⚡ [Lệnh kèm theo tức thì]: '{command_part}'", 'INFO')
                    broadcast_wake_event('wake_with_cmd', query=command_part)
                    reply = execute_voice_command(command_part)
                    log(f"💬 [Diana phản hồi]: '{reply}'", 'INFO')
                    broadcast_wake_event('completed', query=command_part, reply=reply)
                    speak_text(reply)
                else:
                    # Người dùng gọi "Diana ơi" -> Mở phiên chờ lệnh trong 15 giây
                    awaiting_command_until = now + 15.0
                    log("🌸 Người dùng gọi -> Đang chào 'Dạ em nghe ạ!' (Cửa sổ nhận lệnh 15s mở)...", 'INFO')
                    broadcast_wake_event('listening_for_command', query='Diana ơi', reply='Dạ em nghe ạ!')
                    play_cached_voice('hear_you')

            # -------------------------------------------------------------
            # TRƯỜNG HỢP 2: ĐANG TRONG PHIÊN CHỜ LỆNH (15s sau khi Diana chào)
            # -------------------------------------------------------------
            elif now < awaiting_command_until:
                awaiting_command_until = 0
                log(f"🎯 [Câu lệnh nhận được trong phiên]: '{clean_text}'", 'SUCCESS')
                broadcast_wake_event('command_received', query=clean_text)
                reply = execute_voice_command(clean_text)
                log(f"💬 [Diana phản hồi]: '{reply}'", 'INFO')
                broadcast_wake_event('completed', query=clean_text, reply=reply)
                speak_text(reply)

            else:
                continue

        except Exception as e:
            log(f"🔥 Ngoại lệ vòng lặp: {type(e).__name__}: {e}", 'ERROR')
            time.sleep(0.5)

# ---------------------------------------------------------------------------
# QUẢN LÝ TIẾN TRÌNH & ĐIỀU KHIỂN HỆ THỐNG
# ---------------------------------------------------------------------------
def write_pid():
    try:
        with open(PID_FILE, 'w', encoding='utf-8') as f:
            f.write(str(os.getpid()))
        log(f"📝 Đã ghi PID {os.getpid()} vào {PID_FILE}", 'INFO')
    except Exception as e:
        log(f"Lỗi ghi PID: {e}", 'WARN')

def remove_pid():
    try:
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
            log("🗑️ Đã xóa file PID", 'INFO')
    except Exception:
        pass

def handle_exit(signum, frame):
    global RUNNING
    log(f"🛑 Đang dừng Diana Wake Listener (tín hiệu: {signum})...", 'INFO')
    RUNNING = False
    remove_pid()
    sys.exit(0)

def main():
    import traceback
    # Đăng ký bắt tín hiệu ngắt
    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    # Ghi PID
    write_pid()

    # Pre-cache các câu prompt phổ biến
    try:
        pre_cache_standard_prompts()
    except Exception as e:
        log(f"Lỗi chuẩn bị cache: {e}", 'WARN')

    # Khởi động vòng lặp
    try:
        wake_listener_loop()
    except Exception as e:
        log(f"🔥 Lỗi crash main: {type(e).__name__}: {e}\n{traceback.format_exc()}", 'FATAL')
    finally:
        remove_pid()
        log("👋 Tiến trình kết thúc.", 'INFO')

if __name__ == '__main__':
    main()
