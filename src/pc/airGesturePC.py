import sys
import os
import json
import time
import math
import ctypes
import threading
import webbrowser
import cv2
import numpy as np

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

def force_window_to_foreground(window_name, width=580, height=440):
    """Đảm bảo cửa sổ luôn hiển thị nổi trên cùng (TopMost) ở góc trên bên phải màn hình Windows"""
    try:
        hwnd = ctypes.windll.user32.FindWindowW(None, window_name)
        if hwnd:
            screen_w = ctypes.windll.user32.GetSystemMetrics(0) # SM_CXSCREEN
            pos_x = max(20, screen_w - width - 25)
            pos_y = 35
            
            HWND_TOPMOST = -1
            SWP_SHOWWINDOW = 0x0040
            
            ctypes.windll.user32.ShowWindow(hwnd, 9) # SW_RESTORE
            ctypes.windll.user32.SetForegroundWindow(hwnd)
            ctypes.windll.user32.SetWindowPos(hwnd, HWND_TOPMOST, pos_x, pos_y, width, height, SWP_SHOWWINDOW)
            return True
    except Exception:
        pass
    return False

def draw_hand_skeleton(frame, landmarks):
    h, w, _ = frame.shape
    points = []
    for lm in landmarks:
        cx, cy = int(lm.x * w), int(lm.y * h)
        points.append((cx, cy))

    # Vẽ các đoạn xương ngón tay
    for p1_idx, p2_idx in HAND_CONNECTIONS:
        if p1_idx < len(points) and p2_idx < len(points):
            cv2.line(frame, points[p1_idx], points[p2_idx], (254, 242, 0), 2, cv2.LINE_AA)

    # Vẽ các khớp điểm mốc
    for idx, (cx, cy) in enumerate(points):
        if idx in [4, 8, 12, 16, 20]:
            cv2.circle(frame, (cx, cy), 7, (0, 255, 128), -1, cv2.LINE_AA)
            cv2.circle(frame, (cx, cy), 9, (255, 255, 255), 1, cv2.LINE_AA)
        else:
            cv2.circle(frame, (cx, cy), 4, (0, 200, 255), -1, cv2.LINE_AA)

def launch_browser_native(url):
    """
    Mở trình duyệt ở chế độ Cửa sổ mới nổi trên cùng (--new-window),
    tránh hoàn toàn hiện tượng Windows 11 đưa tab mới vào Background / Efficiency Mode.
    """
    import subprocess
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
                subprocess.Popen([b_path, '--new-window', url], close_fds=True)
                launched = True
                break
            except Exception:
                pass

    if not launched:
        try:
            res = ctypes.windll.shell32.ShellExecuteW(None, "open", url, None, None, 1)
            if res > 32:
                launched = True
        except Exception:
            pass

    try:
        webbrowser.open(url, new=1, autoraise=True)
    except Exception:
        pass

    try:
        os.system(f'start "" "{url}"')
    except Exception:
        pass

    # Kích hoạt cửa sổ trình duyệt nổi lên trên cùng (TopMost / Foreground)
    def bring_browser_to_front():
        user32 = ctypes.windll.user32
        for delay in [0.3, 0.8, 1.5, 2.5]:
            time.sleep(delay)
            try:
                def enum_proc(hwnd, lparam):
                    if user32.IsWindowVisible(hwnd):
                        length = user32.GetWindowTextLengthW(hwnd)
                        buff = ctypes.create_unicode_buffer(length + 1)
                        if length > 0:
                            user32.GetWindowTextW(hwnd, buff, length + 1)
                        title = buff.value
                        
                        cls_buff = ctypes.create_unicode_buffer(256)
                        user32.GetClassNameW(hwnd, cls_buff, 256)
                        cls_name = cls_buff.value

                        is_target = (
                            any(k in title.lower() for k in ["diana", "chrome", "edge", "render", "google"]) or
                            cls_name == "Chrome_WidgetWin_1"
                        )

                        if is_target and (title or cls_name == "Chrome_WidgetWin_1"):
                            # 1. Khôi phục kích thước nếu đang bị minimize
                            user32.ShowWindow(hwnd, 9) # SW_RESTORE
                            user32.ShowWindow(hwnd, 5) # SW_SHOW
                            
                            # 2. Đưa lên TopMost và ép lấy tiêu điểm Foreground
                            HWND_TOPMOST = -1
                            HWND_NOTOPMOST = -2
                            SWP_FLAGS = 0x0001 | 0x0002 | 0x0040 # SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW
                            
                            user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_FLAGS)
                            user32.SetForegroundWindow(hwnd)
                            user32.BringWindowToTop(hwnd)
                            user32.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_FLAGS)
                    return True
                
                WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
                user32.EnumWindows(WNDENUMPROC(enum_proc), 0)
            except Exception:
                pass

    threading.Thread(target=bring_browser_to_front, daemon=True).start()
    return True

# Khởi tạo mô hình MediaPipe trong nền để Webcam mở tức thì
recognizer_instance = None
recognizer_ready = False
mp_module = None
vision_module = None

def init_mediapipe_worker():
    global recognizer_instance, recognizer_ready, mp_module, vision_module
    try:
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        from mediapipe.tasks.python import BaseOptions

        mp_module = mp
        vision_module = vision

        if os.path.exists(MODEL_PATH):
            options = vision.GestureRecognizerOptions(
                base_options=BaseOptions(model_asset_path=MODEL_PATH),
                running_mode=vision.RunningMode.IMAGE,
                num_hands=1,
                min_hand_detection_confidence=0.45,
                min_hand_presence_confidence=0.45,
                min_tracking_confidence=0.45
            )
            recognizer_instance = vision.GestureRecognizer.create_from_options(options)
            recognizer_ready = True
    except Exception as e:
        sys.stderr.write(f"MediaPipe Init Error: {e}\n")

def run_gesture_detector(timeout_seconds=86400, target_url='https://diana-h73u.onrender.com/?air_sync=1', show_preview=True):
    """
    Chạy nhận diện cử chỉ luôn bật cho tới khi người dùng xòe mở bàn tay ổn định hoặc bấm tắt
    """
    # 1. Bắt đầu nạp MediaPipe trong luồng nền
    init_thread = threading.Thread(target=init_mediapipe_worker, daemon=True)
    init_thread.start()

    # 2. Mở Webcam tức thì qua DirectShow MJPG
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

    window_name = "Diana Air Gesture - Camera PC"
    if show_preview:
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(window_name, 580, 440)

    start_time = time.time()
    consecutive_open_frames = 0
    REQUIRED_FRAMES = 5  # Giữ mở bàn tay trong ~0.16s để phản hồi cực nhạy và tự nhiên
    frame_count = 0

    sys.stdout.write(json.dumps({"status": "WEBCAM_LISTENING", "timeout": timeout_seconds, "target_url": target_url}) + "\n")
    sys.stdout.flush()

    try:
        while time.time() - start_time < timeout_seconds:
            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.015)
                continue

            frame_count += 1
            frame = cv2.flip(frame, 1)
            h, w, _ = frame.shape

            is_open = False
            detected_category = "None"
            detected_score = 0.0

            # Xử lý nhận diện cử chỉ khi mô hình MediaPipe đã sẵn sàng
            if recognizer_ready and recognizer_instance is not None and mp_module is not None:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp_module.Image(image_format=mp_module.ImageFormat.SRGB, data=rgb_frame)
                recognition_result = recognizer_instance.recognize(mp_image)

                # 1. Nhận diện theo mô hình MediaPipe Gesture
                if recognition_result.gestures:
                    for gesture_list in recognition_result.gestures:
                        for gesture in gesture_list:
                            category = gesture.category_name
                            score = gesture.score
                            if category == "Open_Palm" and score >= 0.40:
                                is_open = True
                                detected_category = category
                                detected_score = score
                                break
                            elif score > detected_score:
                                detected_category = category
                                detected_score = score
                        if is_open:
                            break

                # 2. Nhận diện bổ sung theo hình học ngón tay xòe mở chuẩn xác
                if recognition_result.hand_landmarks:
                    for landmarks in recognition_result.hand_landmarks:
                        if show_preview:
                            draw_hand_skeleton(frame, landmarks)

                        wrist = landmarks[0]
                        is_index_open = euclidean_dist(landmarks[8], wrist) > euclidean_dist(landmarks[6], wrist) * 1.10
                        is_middle_open = euclidean_dist(landmarks[12], wrist) > euclidean_dist(landmarks[10], wrist) * 1.10
                        is_ring_open = euclidean_dist(landmarks[16], wrist) > euclidean_dist(landmarks[14], wrist) * 1.10
                        is_pinky_open = euclidean_dist(landmarks[20], wrist) > euclidean_dist(landmarks[18], wrist) * 1.10

                        open_count = sum([1 for f in [is_index_open, is_middle_open, is_ring_open, is_pinky_open] if f])
                        if open_count >= 3:
                            is_open = True
                            if detected_category in ["None", "Closed_Fist"]:
                                detected_category = "Open_Palm_Geometric"
                                detected_score = 0.90

            # Cập nhật bộ đếm tiến trình giữ cử chỉ (Hold Progress)
            if is_open:
                consecutive_open_frames = min(REQUIRED_FRAMES, consecutive_open_frames + 1)
            else:
                consecutive_open_frames = max(0, consecutive_open_frames - 2)

            progress_ratio = consecutive_open_frames / float(REQUIRED_FRAMES)
            progress_pct = int(progress_ratio * 100)

            # Vẽ HUD giao diện thông tin & Thanh tiến trình
            if show_preview:
                # Header Bar
                cv2.rectangle(frame, (0, 0), (w, 45), (15, 10, 25), -1)
                cv2.putText(frame, "DIANA AIR GESTURE - CAMERA PC", (16, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.62, (0, 242, 254), 2, cv2.LINE_AA)
                cv2.putText(frame, "[Esc/Q: Tat]", (w - 120, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.50, (160, 160, 160), 1, cv2.LINE_AA)

                # Footer Background Bar
                cv2.rectangle(frame, (0, h - 65), (w, h), (15, 10, 25), -1)
                
                # Thanh tiến trình giữ mở bàn tay (Progress Bar)
                bar_x = 16
                bar_y = h - 55
                bar_w = w - 32
                bar_h = 16
                
                cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (40, 35, 55), -1)
                cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (100, 100, 120), 1)

                if progress_pct > 0:
                    fill_w = int(bar_w * progress_ratio)
                    bar_color = (0, 255, 128) if progress_pct >= 80 else (0, 215, 255)
                    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + fill_w, bar_y + bar_h), bar_color, -1)

                if not recognizer_ready:
                    status_text = "DANG KHOI TAO AI MEDIAPIPE... (VUI LONG DOI 1s)"
                    text_color = (0, 215, 255)
                elif progress_pct > 0:
                    status_text = f"DANG THA PHIEN: {progress_pct}% (GIU YEN MO BAN TAY...)"
                    text_color = (0, 255, 128)
                else:
                    status_text = "HAY XOE MO BAN TAY (🖐️) TRUOC CAMERA DE THA PHIEN"
                    text_color = (200, 200, 200)

                cv2.putText(frame, status_text, (16, h - 16),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.50, text_color, 1, cv2.LINE_AA)

                cv2.imshow(window_name, frame)

                # Giữ cửa sổ luôn TopMost
                if frame_count <= 10 or frame_count % 25 == 0:
                    force_window_to_foreground(window_name, 580, 440)

                key = cv2.waitKey(12) & 0xFF
                if key == 27 or key == ord('q') or key == ord('Q'):
                    break

            # Khi người dùng đã giữ mở bàn tay đủ thời gian yêu cầu -> THÀNH CÔNG!
            if consecutive_open_frames >= REQUIRED_FRAMES:
                # 1. Mở trình duyệt ngay lập tức
                launch_browser_native(target_url)

                # 2. Hiển thị thông báo thành công rực rỡ trên màn hình
                if show_preview:
                    cv2.rectangle(frame, (25, h // 2 - 50), (w - 25, h // 2 + 50), (0, 180, 0), -1)
                    cv2.rectangle(frame, (25, h // 2 - 50), (w - 25, h // 2 + 50), (255, 255, 255), 2)
                    cv2.putText(frame, "THANH CONG! DANG MO TRINH DUYET...", (40, h // 2 + 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.70, (255, 255, 255), 2, cv2.LINE_AA)
                    cv2.imshow(window_name, frame)
                    cv2.waitKey(1000)

                # 3. Xuất event ra stdout cho Node.js
                sys.stdout.write(json.dumps({
                    "event": "DROP_DETECTED",
                    "category": detected_category,
                    "score": round(detected_score, 2),
                    "target_url": target_url,
                    "timestamp": time.time()
                }) + "\n")
                sys.stdout.flush()
                return True

            time.sleep(0.01)
    finally:
        cap.release()
        if show_preview:
            cv2.destroyAllWindows()

    sys.stdout.write(json.dumps({"status": "CLOSED", "message": "Da dong Webcam"}) + "\n")
    sys.stdout.flush()
    return False

if __name__ == '__main__':
    timeout = 86400
    target = 'https://diana-h73u.onrender.com/?air_sync=1'
    show_window = True
    
    if len(sys.argv) > 1:
        try:
            timeout = int(sys.argv[1])
        except ValueError:
            pass
            
    if len(sys.argv) > 2 and sys.argv[2].startswith('http'):
        target = sys.argv[2]

    success = run_gesture_detector(timeout, target_url=target, show_preview=show_window)
    sys.exit(0 if success else 1)
