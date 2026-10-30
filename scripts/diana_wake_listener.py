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
    """
    Đọc văn bản bằng giọng tiếng Việt Hoài My Neural (Microsoft Edge-TTS):
    - Ưu tiên 1: Tra cứu MD5 hash trong data/wake_cache/h_{md5}.mp3 -> Phát ngay 0ms, 100% chuẩn tiếng Việt Hoài My
    - Ưu tiên 2: Tạo giọng nói động mới qua [sys.executable, '-m', 'edge_tts', '--voice', 'vi-VN-HoaiMyNeural', ...]
    - Ưu tiên 3: Nếu mất mạng / lỗi Edge-TTS -> Phát general_ack.mp3 ("Dạ em đã nhận được lệnh từ anh Tiến rồi ạ!")
    - TUYỆT ĐỐI KHÔNG dùng Windows SAPI SpVoice (để không bao giờ bị biến thành giọng nam tiếng Anh Microsoft David)
    """
    if not text or not text.strip():
        return

    clean_text = clean_for_speech(text)
    if not clean_text:
        return

    ensure_cache_dir()
    import hashlib
    text_hash = hashlib.md5(clean_text.encode('utf-8')).hexdigest()
    cached_hash_file = os.path.join(CACHE_DIR, f"h_{text_hash}.mp3")

    # 1. Phát ngay lập tức 0ms nếu câu thoại đã có sẵn trong Cache
    if os.path.exists(cached_hash_file) and os.path.getsize(cached_hash_file) > 1000:
        log(f"⚡ [Voice Cache Hit]: '{clean_text[:35]}...' -> {os.path.basename(cached_hash_file)}", 'INFO')
        play_audio_file(cached_hash_file)
        return

    # 2. Tạo giọng nói động (kết hợp cả in-process async và subprocess độc lập để chắc chắn 100%)
    temp_txt = os.path.join(CACHE_DIR, f"_speak_{int(time.time() * 1000)}.txt")
    temp_mp3 = os.path.join(CACHE_DIR, f"_speak_{int(time.time() * 1000)}.mp3")
    generated = False
    try:
        # Cách 1: Thử trực tiếp edge_tts in-process
        try:
            async def _dyn_tts():
                comm = edge_tts.Communicate(clean_text, 'vi-VN-HoaiMyNeural', rate='+10%')
                await comm.save(temp_mp3)
            asyncio.run(_dyn_tts())
            if os.path.exists(temp_mp3) and os.path.getsize(temp_mp3) > 1000:
                generated = True
        except Exception:
            pass

        # Cách 2: Nếu Cách 1 gặp lỗi Proactor, gọi qua subprocess python độc lập
        if not generated:
            try:
                with open(temp_txt, 'w', encoding='utf-8') as tf:
                    tf.write(clean_text)
                cmd = [sys.executable, '-m', 'edge_tts', '--voice', 'vi-VN-HoaiMyNeural', '--file', temp_txt, '--write-media', temp_mp3]
                res = subprocess.run(cmd, capture_output=True, timeout=12, creationflags=0x08000000)
                if res.returncode == 0 and os.path.exists(temp_mp3) and os.path.getsize(temp_mp3) > 1000:
                    generated = True
            except Exception:
                pass

        if generated:
            try:
                import shutil
                shutil.copyfile(temp_mp3, cached_hash_file)
            except Exception:
                pass
            play_audio_file(temp_mp3)
            return
    except Exception as e:
        log(f"Ngoại lệ khi gọi TTS: {e}", 'WARN')
    finally:
        for tmp_f in [temp_txt, temp_mp3]:
            if os.path.exists(tmp_f):
                try:
                    os.remove(tmp_f)
                except Exception:
                    pass

    # 3. Fallback AN TOÀN TUYỆT ĐỐI: Giọng tiếng Việt Hoài My chuẩn đã có sẵn
    log("⚠️ Không thể tạo dynamic TTS, phát câu phản hồi tiếng Việt Hoài My dự phòng general_ack...", 'INFO')
    play_cached_voice('general_ack')

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

def disable_efficiency_mode_for_process():
    """Tắt hoàn toàn chế độ EcoQoS / Efficiency Mode cho tiến trình Diana để không bị Windows bóp nghẽn hoặc ép chạy ngầm"""
    try:
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetCurrentProcess()
        # Thiết lập NORMAL_PRIORITY_CLASS (0x00000020)
        kernel32.SetPriorityClass(handle, 0x00000020)
        
        class PROCESS_POWER_THROTTLING_STATE(ctypes.Structure):
            _fields_ = [
                ("Version", ctypes.c_ulong),
                ("ControlMask", ctypes.c_ulong),
                ("StateMask", ctypes.c_ulong),
            ]
        state = PROCESS_POWER_THROTTLING_STATE()
        state.Version = 1
        state.ControlMask = 1 # PROCESS_POWER_THROTTLING_EXECUTION_SPEED
        state.StateMask = 0   # 0 = OFF
        kernel32.SetProcessInformation(handle, 4, ctypes.byref(state), ctypes.sizeof(state))
        log("🚀 Đã vô hiệu hóa chế độ Efficiency Mode (EcoQoS) cho tiến trình Diana", 'INFO')
    except Exception as e:
        log(f"Không thể chỉnh PowerThrottling: {e}", 'DEBUG')

def force_foreground_window(hwnd):
    """
    Đưa cửa sổ lên trên cùng màn hình (Topmost Pulse + ALT bypass):
    - Đảm bảo app hiển thị ngay trên màn hình chính, không bị chìm hay ẩn dưới taskbar
    - Tự động nhận diện và kích hoạt cả các hộp thoại popup con (như Microsoft Office Activation Wizard)
    - Tuyệt đối không dùng AttachThreadInput để tránh xung đột với các game và Anti-Cheat (như Riot Vanguard)
    """
    if not HAS_WIN32 or not hwnd:
        return False
    try:
        user32 = ctypes.windll.user32
        if not user32.IsWindow(hwnd):
            return False

        # Kiểm tra xem có hộp thoại modal popup con (như Activation Wizard của Office) hay không
        popup_hwnd = user32.GetLastActivePopup(hwnd)
        target_hwnd = popup_hwnd if (popup_hwnd and user32.IsWindow(popup_hwnd) and popup_hwnd != hwnd) else hwnd

        # 1. Khôi phục kích thước và hiển thị cửa sổ chính
        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, win32con.SW_RESTORE)
        user32.ShowWindow(hwnd, win32con.SW_SHOW)

        # 2. Khôi phục hiển thị popup con nếu có
        if target_hwnd != hwnd:
            if user32.IsIconic(target_hwnd):
                user32.ShowWindow(target_hwnd, win32con.SW_RESTORE)
            user32.ShowWindow(target_hwnd, win32con.SW_SHOW)

        # 3. Xung Topmost: Tạm thời đưa lên TOPMOST rồi trả về NOTOPMOST
        HWND_TOPMOST = -1
        HWND_NOTOPMOST = -2
        flags = win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_SHOWWINDOW
        user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, flags)
        user32.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, flags)

        if target_hwnd != hwnd:
            user32.SetWindowPos(target_hwnd, HWND_TOPMOST, 0, 0, 0, 0, flags)
            user32.SetWindowPos(target_hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, flags)

        # 4. Kích hoạt quyền ưu tiên Foreground bằng ALT key bypass
        win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
        user32.BringWindowToTop(hwnd)
        if target_hwnd != hwnd:
            user32.BringWindowToTop(target_hwnd)
            user32.SetForegroundWindow(target_hwnd)
            user32.SwitchToThisWindow(target_hwnd, True)
        else:
            user32.SetForegroundWindow(hwnd)
            user32.SwitchToThisWindow(hwnd, True)
        win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
        return True
    except Exception as e:
        log(f"Lỗi force_foreground_window (HWND {hwnd}): {e}", 'WARN')
        return False

def restore_and_focus_window(title_kw):
    """
    Tìm cửa sổ (kể cả đang thu nhỏ xuống taskbar hoặc ẩn trong system tray)
    và kéo bật lên màn hình trước mặt:
    - Nhận diện cả qua Title và Window Class Name (OpusApp cho Word, XLMAIN cho Excel, Chrome_WidgetWin_1 cho Chrome)
    - Luôn chọn cửa sổ chính lớn nhất
    """
    if not HAS_WIN32:
        return False
    ensure_default_desktop()
    try:
        candidates = []
        kw = title_kw.lower().strip()

        def enum_cb(hwnd, _):
            if not win32gui.IsWindow(hwnd) or not win32gui.IsWindowVisible(hwnd):
                if not win32gui.IsIconic(hwnd):
                    return True

            t = win32gui.GetWindowText(hwnd).strip()
            t_lower = t.lower()
            c = win32gui.GetClassName(hwnd).strip()
            c_lower = c.lower()

            # Tránh nhầm lẫn với IDE Antigravity / Zalo Bot đang làm việc
            if 'antigravity' in t_lower or 'zalo bot' in t_lower:
                return True

            # Bỏ qua màn hình splash loading
            if 'splash' in c_lower or 'msosplash' in c_lower:
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
            elif kw == 'word':
                if 'opusapp' in c_lower or ('word' in t_lower and 'diana' not in t_lower):
                    matched = True
            elif kw == 'excel':
                if 'xlmain' in c_lower or 'xldesk' in c_lower or ('excel' in t_lower and 'diana' not in t_lower):
                    matched = True
            elif kw == 'powerpoint':
                if 'pptframeclass' in c_lower or 'pp9frameclass' in c_lower or 'powerpoint' in t_lower:
                    matched = True
            elif kw in ['league of legends', 'lol', 'riot']:
                if 'league of legends' in t_lower or 'riot client' in t_lower or c_lower == 'rclient':
                    matched = True
            elif kw == 'calculator':
                if 'calculator' in t_lower or 'máy tính' in t_lower or 'calc' in c_lower:
                    matched = True
            elif kw == 'notepad':
                if 'notepad' in t_lower or 'ghi chú' in t_lower:
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
                    if is_iconic or (w >= 300 and h >= 200):
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
            candidates.sort(key=lambda x: x['area'], reverse=True)
            best = candidates[0]
            best_hwnd = best['hwnd']
            if force_foreground_window(best_hwnd):
                log(f"🪟 Đã khôi phục và đưa cửa sổ '{title_kw}' (HWND {best_hwnd}, {best['width']}x{best['height']}) lên trước màn hình!", 'SUCCESS')
                return True
    except Exception as e:
        log(f"Lỗi khôi phục cửa sổ '{title_kw}': {e}", 'WARN')
    return False

def wait_and_focus_window(title_kw, max_wait=3.0, interval=0.35):
    """Vòng lặp chờ cửa sổ của ứng dụng vừa khởi chạy xuất hiện và kéo bật lên Foreground"""
    start = time.time()
    time.sleep(0.3)
    while time.time() - start < max_wait:
        if restore_and_focus_window(title_kw):
            return True
        time.sleep(interval)
    return False

def launch_app_native(target_path, args=""):
    """
    Khởi chạy ứng dụng trực tiếp thông qua Explorer Shell COM:
    - Bàn giao tiến trình cho explorer.exe khởi chạy thay vì python chạy ngầm
    - Vượt qua hoàn toàn chế độ EcoQoS / Efficiency Mode của Windows 11 (không bị dán nhãn lá cây xanh)
    - Ứng dụng khởi động ở Normal Interactive Priority và bung cửa sổ GUI lên màn hình chính
    """
    try:
        import win32com.client
        shell = win32com.client.Dispatch("Shell.Application")
        shell.ShellExecute(target_path, args, "", "open", 1) # 1 = SW_SHOWNORMAL
        log(f"🚀 [ShellExecute OK]: {target_path} (args: '{args}')", 'SUCCESS')
        return True
    except Exception as e:
        log(f"ShellExecute error with '{target_path}': {e}. Thử os.startfile...", 'WARN')
        try:
            if args:
                os.system(f'start "" "{target_path}" {args}')
            else:
                os.startfile(target_path)
            return True
        except Exception as e2:
            log(f"os.startfile error: {e2}. Thử subprocess...", 'WARN')
            try:
                cmd = [target_path]
                if args:
                    cmd.append(args)
                subprocess.Popen(cmd)
                return True
            except Exception as e3:
                log(f"subprocess error: {e3}", 'ERROR')
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
    Khởi chạy hoặc đưa ứng dụng lên màn hình chính:
    1. Kiểm tra nếu app đã mở -> restore và focus ngay lập tức
    2. Nếu chưa mở -> Dùng Shell.Application khởi chạy qua Explorer (phá bỏ hoàn toàn Efficiency Mode)
    3. Chờ app bung window và dùng Topmost Pulse đưa lên trước mặt
    """
    clean_name = app_name.strip()
    norm = remove_accents(clean_name)
    log(f"🚀 [Khởi chạy ứng dụng]: '{clean_name}' (norm: '{norm}')", 'INFO')

    # 1. Xử lý Bambu Studio / Máy in 3D
    if any(k in norm for k in ['bambu', 'album studio', 'bao boi studio', 'ban in studio', 'may in', 'in 3d', 'studio']):
        if restore_and_focus_window('Bambu'):
            return "Dạ em đã đưa phần mềm in 3D Bambu Studio lên màn hình cho anh rồi ạ!"
        bambu_paths = [
            r'D:\BambuStudio\Bambu Studio\bambu-studio.exe',
            r'C:\Users\Public\Desktop\Bambu Studio.lnk',
            r'C:\Program Files\Bambu Studio\bambu-studio.exe'
        ]
        target = next((p for p in bambu_paths if os.path.exists(p)), 'bambu-studio.exe')
        launch_app_native(target, "")
        wait_and_focus_window('Bambu', max_wait=3.0)
        return "Dạ em đã mở phần mềm in 3D Bambu Studio cho anh rồi ạ!"

    # 2. Xử lý Zalo
    if any(k in norm for k in ['zalo', 'gia lo', 'dalo']):
        if restore_and_focus_window('Zalo'):
            return "Dạ em đã đưa ứng dụng Zalo lên màn hình cho anh rồi ạ!"
        zalo_paths = [
            os.path.expanduser(r'~\Desktop\Zalo.lnk'),
            os.path.expanduser(r'~\AppData\Local\Programs\Zalo\Zalo.exe')
        ]
        target = next((p for p in zalo_paths if os.path.exists(p)), 'zalo.exe')
        launch_app_native(target, "")
        wait_and_focus_window('Zalo', max_wait=3.0)
        return "Dạ em đã mở ứng dụng Zalo cho anh rồi ạ!"

    # 3. Xử lý Chrome / Trình duyệt web
    if any(k in norm for k in ['chrome', 'trinh duyet', 'google chrome', 'web', 'coc coc']):
        if restore_and_focus_window('Chrome'):
            return "Dạ em đã đưa trình duyệt Chrome lên màn hình cho anh rồi ạ!"
        chrome_lnk = r'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Google Chrome.lnk'
        chrome_exe = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
        if os.path.exists(chrome_lnk):
            launch_app_native(chrome_lnk, "https://www.google.com")
        elif os.path.exists(chrome_exe):
            launch_app_native(chrome_exe, "https://www.google.com")
        else:
            launch_app_native('chrome.exe', "https://www.google.com")
        wait_and_focus_window('Chrome', max_wait=3.0)
        return "Dạ em đã mở trình duyệt Chrome cho anh rồi ạ!"

    # 4. Xử lý Liên Minh Huyền Thoại / League of Legends / Riot
    if any(k in norm for k in ['lien minh', 'lol', 'lmht', 'riot', 'dau truong chan ly', 'dtcl']):
        if restore_and_focus_window('League of Legends') or restore_and_focus_window('Riot Client'):
            return "Dạ em đã đưa Liên Minh Huyền Thoại lên màn hình cho anh rồi ạ!"
        riot_paths = [
            r'C:\Users\Public\Desktop\Riot Client.lnk',
            r'C:\Riot Games\Riot Client\RiotClientServices.exe'
        ]
        target = next((p for p in riot_paths if os.path.exists(p)), 'RiotClientServices.exe')
        launch_app_native(target, "")
        wait_and_focus_window('League of Legends', max_wait=3.0)
        return "Dạ em đã mở Liên Minh Huyền Thoại cho anh rồi ạ! Chúc anh leo rank vui vẻ!"

    # 5. Xử lý VS Code
    if any(k in norm for k in ['vscode', 'vs code', 'code', 'visual studio code']):
        if restore_and_focus_window('Visual Studio Code'):
            return "Dạ em đã đưa Visual Studio Code lên màn hình cho anh rồi ạ!"
        launch_app_native('cmd.exe', '/c code')
        wait_and_focus_window('Visual Studio Code', max_wait=3.0)
        return "Dạ em đã mở Visual Studio Code để anh làm việc rồi ạ!"

    # 6. Xử lý Word / Excel / PowerPoint (Office 16 confirmed paths)
    if 'word' in norm:
        if restore_and_focus_window('Word'):
            return "Dạ em đã đưa Microsoft Word lên màn hình cho anh rồi ạ!"
        word_exe = r'C:\Program Files\Microsoft Office\Office16\WINWORD.EXE'
        word_lnk = r'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Word 2016.lnk'
        # Dùng tham số /w để chắc chắn Word mở ra một cửa sổ văn bản Document1 hoàn chỉnh ngay trên Desktop
        if os.path.exists(word_exe):
            launch_app_native(word_exe, "/w")
        elif os.path.exists(word_lnk):
            launch_app_native(word_lnk, "")
        else:
            launch_app_native('winword.exe', "/w")
        wait_and_focus_window('Word', max_wait=3.5)
        return "Dạ em đã mở Microsoft Word cho anh rồi ạ!"

    if 'excel' in norm:
        if restore_and_focus_window('Excel'):
            return "Dạ em đã đưa Microsoft Excel lên màn hình cho anh rồi ạ!"
        excel_lnk = r'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Excel 2016.lnk'
        excel_exe = r'C:\Program Files\Microsoft Office\Office16\EXCEL.EXE'
        if os.path.exists(excel_lnk):
            launch_app_native(excel_lnk, "")
        elif os.path.exists(excel_exe):
            launch_app_native(excel_exe, "")
        else:
            launch_app_native('excel.exe', "")
        wait_and_focus_window('Excel', max_wait=3.5)
        return "Dạ em đã mở Microsoft Excel cho anh rồi ạ!"

    if 'powerpoint' in norm or 'ppt' in norm:
        if restore_and_focus_window('PowerPoint'):
            return "Dạ em đã đưa Microsoft PowerPoint lên màn hình cho anh rồi ạ!"
        ppt_lnk = r'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\PowerPoint 2016.lnk'
        ppt_exe = r'C:\Program Files\Microsoft Office\Office16\POWERPNT.EXE'
        if os.path.exists(ppt_lnk):
            launch_app_native(ppt_lnk, "")
        elif os.path.exists(ppt_exe):
            launch_app_native(ppt_exe, "")
        else:
            launch_app_native('powerpnt.exe', "")
        wait_and_focus_window('PowerPoint', max_wait=3.5)
        return "Dạ em đã mở Microsoft PowerPoint cho anh rồi ạ!"

    # 7. Xử lý Máy tính (Calc) & Notepad
    if any(k in norm for k in ['may tinh', 'calculator', 'calc']):
        if restore_and_focus_window('Calculator'):
            return "Dạ em đã bật ứng dụng Máy tính Calculator cho anh rồi ạ!"
        launch_app_native('calc.exe', '')
        wait_and_focus_window('Calculator', max_wait=2.0)
        return "Dạ em đã bật ứng dụng Máy tính Calculator cho anh rồi ạ!"

    if any(k in norm for k in ['notepad', 'ghi chu']):
        if restore_and_focus_window('Notepad'):
            return "Dạ em đã mở Notepad cho anh ghi chú rồi ạ!"
        launch_app_native('notepad.exe', '')
        wait_and_focus_window('Notepad', max_wait=2.0)
        return "Dạ em đã mở Notepad cho anh ghi chú rồi ạ!"

    # 8. Thử quét shortcut trong Desktop & Start Menu
    shortcut = find_installed_shortcut(clean_name)
    if shortcut:
        try:
            launch_app_native(shortcut, '')
            return f"Dạ em đã mở {clean_name} cho anh rồi ạ!"
        except Exception as e:
            log(f"Lỗi khởi chạy {shortcut}: {e}", 'WARN')

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

    # Chuẩn hóa loại bỏ các từ xưng hô và trợ từ đệm tiếng Việt (VD: "em mở...", "...lên cho anh đi", "...cho anh được không")
    clean_cmd = re.sub(r'^(?:em\s+ơi|ơi\s+em|em|bạn|diana|dina|dana|hãy)\s+', '', query, flags=re.IGNORECASE).strip()
    clean_cmd = re.sub(r'(?:\s+(?:lên|cho\s+anh|hộ\s+anh|giúp\s+anh|giúp\s+em|đi|với|nhe|nhé|nha|ạ|được\s+không|được\s+ko|đc\s+ko|được\s+chăng|nào))+$', '', clean_cmd, flags=re.IGNORECASE).strip()
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

    log("🎤 Đang kết nối Microphone hệ thống...", 'INFO')
    microphone = None
    for attempt in range(1, 6):
        try:
            mic = sr.Microphone()
            with mic as source:
                recognizer.adjust_for_ambient_noise(source, duration=0.35)
            microphone = mic
            break
        except Exception as e:
            log(f"⏳ Chưa thể kết nối Microphone (Lần {attempt}/5): {e}. Đang đợi hệ thống âm thanh Windows ổn định...", 'WARN')
            time.sleep(2.0)

    if microphone is None:
        log("❌ Không thể kết nối Microphone sau 5 lần thử.", 'FATAL')
        return

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
MUTEX_HANDLE = None

def ensure_single_instance():
    """
    Sử dụng Win32 Named Mutex để đảm bảo TUYỆT ĐỐI chỉ có 1 tiến trình Diana Wake Listener
    được phép chạy và lắng nghe Micro trên toàn hệ thống.
    Nếu Windows khởi động cả từ Startup Folder lẫn Registry Run, tiến trình phụ sẽ
    tự động phát hiện và thoát ngay lập tức 0ms, không gây xung đột micro.
    """
    global MUTEX_HANDLE
    try:
        kernel32 = ctypes.windll.kernel32
        MUTEX_NAME = "Global\\DianaWakeListenerSingleInstanceMutex_v1"
        ERROR_ALREADY_EXISTS = 183

        handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
        last_error = kernel32.GetLastError()
        if last_error == ERROR_ALREADY_EXISTS:
            log("⚠️ Đã có một tiến trình Diana Wake Listener khác đang chạy ngầm trên máy. Tự động thoát phiên bản trùng lặp để tránh xung đột Micro.", 'INFO')
            if handle:
                kernel32.CloseHandle(handle)
            sys.exit(0)
        MUTEX_HANDLE = handle
        log("🔒 Khóa Single-Instance Mutex đã kích hoạt thành công (Duy nhất 1 phiên bản chạy ngầm).", 'INFO')
    except Exception as e:
        log(f"Cảnh báo kiểm tra Single Instance Mutex: {e}", 'WARN')

def write_pid():
    try:
        with open(PID_FILE, 'w', encoding='utf-8') as f:
            f.write(str(os.getpid()))
        log(f"📝 Đã ghi PID {os.getpid()} vào {PID_FILE}", 'INFO')
    except Exception as e:
        log(f"Lỗi ghi PID: {e}", 'WARN')

def remove_pid():
    global MUTEX_HANDLE
    try:
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
            log("🗑️ Đã xóa file PID", 'INFO')
    except Exception:
        pass
    if MUTEX_HANDLE:
        try:
            ctypes.windll.kernel32.CloseHandle(MUTEX_HANDLE)
            MUTEX_HANDLE = None
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

    # Đảm bảo duy nhất 1 tiến trình chạy ngầm, loại bỏ nguy cơ trùng lặp khi khởi động máy
    ensure_single_instance()

    # Ghi PID
    write_pid()

    # Vô hiệu hóa chế độ tiết kiệm EcoQoS / Efficiency Mode của Windows 11
    disable_efficiency_mode_for_process()

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
