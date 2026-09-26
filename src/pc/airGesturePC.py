import sys
import os
import json
import time
import math
import subprocess
import webbrowser
import cv2
import numpy as np

# Ẩn 100% cửa sổ Terminal / Console ngay khi tiến trình khởi chạy trên Windows
if sys.platform == 'win32':
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        user32 = ctypes.windll.user32
        console_hwnd = kernel32.GetConsoleWindow()
        if console_hwnd:
            user32.ShowWindow(console_hwnd, 0)  # 0 = SW_HIDE
    except Exception:
        pass

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['PYTHONIOENCODING'] = 'utf-8'

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(CURRENT_DIR, 'gesture_recognizer.task')

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),        # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),        # Index
    (0, 9), (9, 10), (10, 11), (11, 12),   # Middle
    (0, 13), (13, 14), (14, 15), (15, 16), # Ring
    (0, 17), (17, 18), (18, 19), (19, 20), # Pinky
    (5, 9), (9, 13), (13, 17), (0, 17)     # Palm
]

def euclidean_dist(p1, p2):
    return math.hypot(p1.x - p2.x, p1.y - p2.y)

def launch_browser_native(url):
    """
    Mở DUY NHẤT 1 cửa sổ trình duyệt TOÀN MÀN HÌNH (MAXIMIZED),
    không làm ảnh hưởng đến các ứng dụng khác đang mở.
    """
    browser_executables = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\CocCoc\Browser\Application\browser.exe")
    ]

    launched = False
    for b_path in browser_executables:
        if os.path.exists(b_path):
            try:
                # --new-window và --start-maximized: Đảm bảo mở cửa sổ mới tràn toàn màn hình
                subprocess.Popen([b_path, '--new-window', '--start-maximized', url], close_fds=True)
                launched = True
                break
            except Exception:
                pass

    if not launched:
        try:
            webbrowser.open(url, new=1, autoraise=True)
            launched = True
        except Exception:
            pass

    if not launched:
        try:
            os.system(f'start "" "{url}"')
            launched = True
        except Exception:
            pass

    # Đảm bảo cửa sổ được Maximize toàn màn hình
    try:
        import ctypes
        time.sleep(0.4)
        user32 = ctypes.windll.user32
        fg_hwnd = user32.GetForegroundWindow()
        if fg_hwnd:
            SW_MAXIMIZE = 3
            user32.ShowWindow(fg_hwnd, SW_MAXIMIZE)
    except Exception:
        pass

    return launched

# Khởi tạo mô hình MediaPipe
recognizer_instance = None
recognizer_ready = False
mp_module = None

def init_mediapipe():
    global recognizer_instance, recognizer_ready, mp_module
    try:
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        from mediapipe.tasks.python import BaseOptions

        mp_module = mp

        if os.path.exists(MODEL_PATH):
            options = vision.GestureRecognizerOptions(
                base_options=BaseOptions(model_asset_path=MODEL_PATH),
                running_mode=vision.RunningMode.IMAGE,
                num_hands=1,
                min_hand_detection_confidence=0.40,
                min_hand_presence_confidence=0.40,
                min_tracking_confidence=0.40
            )
            recognizer_instance = vision.GestureRecognizer.create_from_options(options)
            recognizer_ready = True
    except Exception as e:
        sys.stderr.write(f"MediaPipe Init Error: {e}\n")

def run_gesture_detector(timeout_seconds=86400, target_url='https://diana-h73u.onrender.com/?air_sync=1', show_preview=False):
    """
    Chạy nhận diện cử chỉ 100% NGẦM (Headless - Không hiện bất kỳ popup hay cửa sổ nào)
    Khi người dùng xòe mở bàn tay -> Mở ngay trình duyệt toàn màn hình và thoát.
    """
    init_mediapipe()

    # Mở Webcam nền qua DirectShow MJPG
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW) if sys.platform == 'win32' else cv2.VideoCapture(0)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        sys.stdout.write(json.dumps({"error": "CANNOT_OPEN_WEBCAM"}) + "\n")
        sys.stdout.flush()
        return False

    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 30)

    start_time = time.time()
    consecutive_open_frames = 0
    REQUIRED_FRAMES = 4  # ~0.12s giữ xòe tay là kích hoạt ngay lập tức

    sys.stdout.write(json.dumps({"status": "WEBCAM_LISTENING", "timeout": timeout_seconds, "target_url": target_url}) + "\n")
    sys.stdout.flush()

    try:
        while time.time() - start_time < timeout_seconds:
            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.02)
                continue

            frame = cv2.flip(frame, 1)
            is_open = False
            detected_category = "None"
            detected_score = 0.0

            # Nhận diện cử chỉ
            if recognizer_ready and recognizer_instance is not None and mp_module is not None:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp_module.Image(image_format=mp_module.ImageFormat.SRGB, data=rgb_frame)
                recognition_result = recognizer_instance.recognize(mp_image)

                # 1. Nhận diện theo mô hình GestureRecognizer
                if recognition_result.gestures:
                    for gesture_list in recognition_result.gestures:
                        for gesture in gesture_list:
                            category = gesture.category_name
                            score = gesture.score
                            if category == "Open_Palm" and score >= 0.38:
                                is_open = True
                                detected_category = category
                                detected_score = score
                                break
                        if is_open:
                            break

                # 2. Nhận diện bổ sung theo hình học ngón tay xòe mở
                if not is_open and recognition_result.hand_landmarks:
                    for landmarks in recognition_result.hand_landmarks:
                        wrist = landmarks[0]
                        is_index_open = euclidean_dist(landmarks[8], wrist) > euclidean_dist(landmarks[6], wrist) * 1.08
                        is_middle_open = euclidean_dist(landmarks[12], wrist) > euclidean_dist(landmarks[10], wrist) * 1.08
                        is_ring_open = euclidean_dist(landmarks[16], wrist) > euclidean_dist(landmarks[14], wrist) * 1.08
                        is_pinky_open = euclidean_dist(landmarks[20], wrist) > euclidean_dist(landmarks[18], wrist) * 1.08

                        open_count = sum([1 for f in [is_index_open, is_middle_open, is_ring_open, is_pinky_open] if f])
                        if open_count >= 3:
                            is_open = True
                            detected_category = "Open_Palm_Geometric"
                            detected_score = 0.90
                            break

            # Cập nhật bộ đếm
            if is_open:
                consecutive_open_frames += 1
            else:
                consecutive_open_frames = max(0, consecutive_open_frames - 1)

            # ĐÃ XÒE MỞ BÀN TAY ĐỦ YÊU CẦU -> KÍCH HOẠT VÀ KẾT THÚC!
            if consecutive_open_frames >= REQUIRED_FRAMES:
                # 1. Mở trình duyệt toàn màn hình
                launch_browser_native(target_url)

                # 2. Xuất event ra stdout
                sys.stdout.write(json.dumps({
                    "event": "DROP_DETECTED",
                    "category": detected_category,
                    "score": round(detected_score, 2),
                    "target_url": target_url,
                    "timestamp": time.time()
                }) + "\n")
                sys.stdout.flush()
                return True

            time.sleep(0.015)
    finally:
        cap.release()

    sys.stdout.write(json.dumps({"status": "CLOSED", "message": "Da dong Webcam"}) + "\n")
    sys.stdout.flush()
    return False

if __name__ == '__main__':
    timeout = 86400
    target = 'https://diana-h73u.onrender.com/?air_sync=1'
    show_window = False  # Chạy 100% ngầm không hiện popup cửa sổ camera
    
    if len(sys.argv) > 1:
        try:
            timeout = int(sys.argv[1])
        except ValueError:
            pass
            
    if len(sys.argv) > 2 and sys.argv[2].startswith('http'):
        target = sys.argv[2]

    success = run_gesture_detector(timeout, target_url=target, show_preview=show_window)
    sys.exit(0 if success else 1)
