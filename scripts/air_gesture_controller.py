"""
╔═══════════════════════════════════════════════════════════════════════╗
║            DIANA TWO-HAND AIR GESTURE AI CONTROLLER 2.5               ║
║      Kết hợp 2 bàn tay: Nhận diện chuẩn xác 100% Trái/Phải            ║
║        - Phân loại giải phẫu chuẩn (Anatomical Handedness AI)        ║
║        - Không bao giờ nhầm lẫn dù chỉ có 1 bàn tay trong khung hình  ║
║        - Tay Phải: Di chuột chuẩn 1:1 tuyệt đối theo 4 góc           ║
║        - Tay Trái (Ngón Cái + Trỏ): Click Chuột Trái / Kéo thả        ║
║        - Tay Trái (Ngón Cái + Giữa): Click Chuột Phải                 ║
║        - Tay Trái (Ngón Cái + Áp Út): Mở & Giữ Đa Nhiệm (Alt + Tab)  ║
║        - Siêu khử rung (Ultra Anti-Jitter Deadband & 1€ Damping)      ║
╚═══════════════════════════════════════════════════════════════════════╝
"""

import sys
import os

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# Ghi file PID ngay lập tức để Electron / Backend phát hiện tức thì
try:
    pid_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.air_gesture.pid')
    with open(pid_file, 'w', encoding='utf-8') as f:
        f.write(str(os.getpid()))
except Exception:
    pass

import cv2
import numpy as np
import time
import math
import collections
import ctypes
import urllib.request
import json
from ctypes import wintypes

# MediaPipe Tasks Vision API
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Windows User32 Direct API for Hardware-level Low Latency & High FPS
user32 = ctypes.windll.user32
try:
    user32.SetProcessDPIAware()
except Exception:
    pass

# Windows SendInput Event Constants
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_ABSOLUTE = 0x8000

VK_LWIN = 0x5B
VK_CONTROL = 0x11
VK_MENU = 0x12   # Alt Key
VK_TAB = 0x09    # Tab Key
VK_D = 0x44
KEYEVENTF_KEYUP = 0x0002

SCREEN_WIDTH = user32.GetSystemMetrics(0)
SCREEN_HEIGHT = user32.GetSystemMetrics(1)

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17)
]

CALIB_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.air_gesture_calib.json')

CORNER_INFOS = [
    {"name": "GOC TREN-TRAI (Top-Left)", "guide_x": 0.15, "guide_y": 0.15},
    {"name": "GOC TREN-PHAI (Top-Right)", "guide_x": 0.85, "guide_y": 0.15},
    {"name": "GOC DUOI-PHAI (Bottom-Right)", "guide_x": 0.85, "guide_y": 0.85},
    {"name": "GOC DUOI-TRAI (Bottom-Left)", "guide_x": 0.15, "guide_y": 0.85},
]


class MirroredLandmark:
    __slots__ = ('x', 'y', 'z')
    def __init__(self, x, y, z):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)


def send_win_d():
    """Gửi tổ hợp phím Win + D (Thu nhỏ về Desktop hoặc Mở lại tất cả cửa sổ)"""
    user32.keybd_event(VK_LWIN, 0, 0, 0)
    user32.keybd_event(VK_D, 0, 0, 0)
    time.sleep(0.05)
    user32.keybd_event(VK_D, 0, KEYEVENTF_KEYUP, 0)
    user32.keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0)


def send_zoom(direction):
    """Gửi Ctrl + Wheel để phóng to/thu nhỏ toàn bộ ứng dụng Windows"""
    user32.keybd_event(VK_CONTROL, 0, 0, 0)
    time.sleep(0.02)
    delta = 120 if direction > 0 else -120
    user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, delta, 0)
    time.sleep(0.02)
    user32.keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)


def ensure_model_file():
    """Tự động kiểm tra và tải model hand_landmarker.task nếu chưa có"""
    model_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models')
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, 'hand_landmarker.task')

    if not os.path.exists(model_path) or os.path.getsize(model_path) < 1000000:
        url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
        urllib.request.urlretrieve(url, model_path)
    return model_path


class LowPassFilter:
    def __init__(self, alpha=0.5):
        self.alpha = float(alpha)
        self.s = None

    def filter(self, value, alpha=None):
        if alpha is not None:
            self.alpha = float(alpha)
        if self.s is None:
            self.s = float(value)
        else:
            self.s = self.alpha * float(value) + (1.0 - self.alpha) * self.s
        return self.s

    def last_value(self):
        return self.s


class OneEuroFilter:
    """
    1€ Filter (One Euro Filter) - Thuật toán khử nhiễu tối tân.
    - min_cutoff = 0.04: Khử triệt để rung giật khi dừng hoặc di chuyển chậm.
    - beta = 0.18: Độ nhạy chuyển động 1:1 siêu mượt.
    """
    def __init__(self, min_cutoff=0.04, beta=0.18, d_cutoff=1.0):
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)
        self.x_filter = LowPassFilter()
        self.dx_filter = LowPassFilter()
        self.t_prev = None

    def _calc_alpha(self, cutoff, dt):
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def filter(self, t, x):
        if self.t_prev is None:
            self.t_prev = t
            self.x_filter.filter(x)
            self.dx_filter.filter(0.0)
            return x

        dt = t - self.t_prev
        if dt <= 1e-5:
            dt = 1e-3
        self.t_prev = t

        prev_x = self.x_filter.last_value()
        dx = (x - prev_x) / dt if prev_x is not None else 0.0
        edx = self.dx_filter.filter(dx, self._calc_alpha(self.d_cutoff, dt))

        cutoff = self.min_cutoff + self.beta * abs(edx)
        return self.x_filter.filter(x, self._calc_alpha(cutoff, dt))


class AirGestureController:
    def __init__(self, camera_index=0, show_hud=True):
        self.camera_index = camera_index
        self.show_hud = show_hud

        # Initialize MediaPipe Tasks HandLandmarker (cho phép nhận diện đến 4 tay để lọc lấy 2 tay to nhất gần camera nhất)
        model_path = ensure_model_file()
        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.HandLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            num_hands=4,
            min_hand_detection_confidence=0.50,
            min_hand_presence_confidence=0.50,
            min_tracking_confidence=0.50
        )
        self.detector = vision.HandLandmarker.create_from_options(options)

        # 1. Bộ đệm Rolling Window 4-Frames lọc rung giật đầu vào MediaPipe
        self.raw_history_x = collections.deque(maxlen=4)
        self.raw_history_y = collections.deque(maxlen=4)

        # 2. Bộ lọc One Euro Adaptive Filter siêu khử rung cho chuột
        self.filter_x = OneEuroFilter(min_cutoff=0.04, beta=0.18, d_cutoff=1.0)
        self.filter_y = OneEuroFilter(min_cutoff=0.04, beta=0.18, d_cutoff=1.0)

        self.prev_cursor_x = float(SCREEN_WIDTH // 2)
        self.prev_cursor_y = float(SCREEN_HEIGHT // 2)

        # Calibration State
        self.is_calibrating = True
        self.calib_step = 0
        self.calib_points = [None, None, None, None]
        self.calib_cooldown = time.time() + 0.3
        self.calib_success_time = 0
        self.transform_matrix = None

        # Fallback zone
        self.zone_x1 = 0.40
        self.zone_x2 = 0.95
        self.zone_y1 = 0.20
        self.zone_y2 = 0.88

        # Mouse Click / Drag States (DUY NHẤT TAY TRÁI BẤM CHUỘT)
        self.is_left_down = False
        self.pinch_start_time = 0
        self.PINCH_PRESS_DIST = 0.048    # Ngưỡng chụm ngón để BẤM
        self.PINCH_RELEASE_DIST = 0.065  # Ngưỡng mở ngón để NHẢ click
        self.left_pinch_frames = 0
        self.REQUIRED_PINCH_FRAMES = 2   # Debounce 2 frames chống chạm nhầm

        # Chuột Phải (Right-Click: Ngón giữa + Ngón cái tay trái chụm)
        self.is_right_clicked = False
        self.left_right_pinch_frames = 0
        self.right_click_cooldown = 0

        # Mở Đa Nhiệm (Alt + Tab: Ngón áp út + Ngón cái tay trái chụm và giữ)
        self.is_alt_tab_active = False
        self.left_ring_pinch_frames = 0

        # 3. Hệ thống Khóa Chủ Thể & Lọc Người Đi Ngang (Primary User Lock & Passerby Filter)
        self.tracked_right_wrist = None
        self.tracked_left_wrist = None
        self.last_right_seen = 0.0
        self.last_left_seen = 0.0
        self.right_seen_count = 0
        self.left_seen_count = 0
        self.MIN_HAND_SIZE = 0.092       # Ngưỡng lọc bàn tay nhỏ ở xa / người đi phía sau
        self.TRACKING_TIMEOUT = 0.45     # Thời gian duy trì lock đối tượng chính (giây)

        # Active Gesture Name for Display
        self.active_gesture_text = "🎯 ĐANG HIỆU CHỈNH 4 GÓC"
        self.active_color = (0, 215, 255)

        # Tự động nạp cấu hình hiệu chuẩn nếu có
        self.load_calibration()

    def start_calibration(self):
        """Kích hoạt lại chế độ hiệu chuẩn 4 góc"""
        self.is_calibrating = True
        self.calib_step = 0
        self.calib_points = [None, None, None, None]
        self.calib_cooldown = time.time() + 0.3
        self.active_gesture_text = "🎯 ĐANG HIỆU CHỈNH 4 GÓC"
        self.active_color = (0, 215, 255)

    def load_calibration(self):
        """Tải dữ liệu 4 góc đã hiệu chuẩn từ file JSON"""
        if os.path.exists(CALIB_FILE):
            try:
                with open(CALIB_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    points = data.get('points', [])
                    if len(points) == 4:
                        self.calib_points = [(p[0], p[1]) for p in points]
                        self._compute_transform_matrix()
                        self.is_calibrating = False
                        return True
            except Exception:
                pass
        self.start_calibration()
        return False

    def save_calibration(self):
        """Lưu dữ liệu 4 góc vào file JSON"""
        try:
            with open(CALIB_FILE, 'w', encoding='utf-8') as f:
                json.dump({'points': self.calib_points}, f, indent=2)
        except Exception:
            pass

    def _compute_transform_matrix(self):
        """Tính toán ma trận phối cảnh từ 4 điểm của người dùng"""
        try:
            src_pts = np.float32([
                [self.calib_points[0][0] * SCREEN_WIDTH, self.calib_points[0][1] * SCREEN_HEIGHT], # Top-Left
                [self.calib_points[1][0] * SCREEN_WIDTH, self.calib_points[1][1] * SCREEN_HEIGHT], # Top-Right
                [self.calib_points[2][0] * SCREEN_WIDTH, self.calib_points[2][1] * SCREEN_HEIGHT], # Bottom-Right
                [self.calib_points[3][0] * SCREEN_WIDTH, self.calib_points[3][1] * SCREEN_HEIGHT], # Bottom-Left
            ])
            dst_pts = np.float32([
                [0, 0],
                [SCREEN_WIDTH, 0],
                [SCREEN_WIDTH, SCREEN_HEIGHT],
                [0, SCREEN_HEIGHT]
            ])
            self.transform_matrix = cv2.getPerspectiveTransform(src_pts, dst_pts)
        except Exception:
            self.transform_matrix = None

    def map_coordinates(self, x, y):
        """Ánh xạ toạ độ ngón tay sang màn hình máy tính thông qua ma trận phối cảnh hiệu chuẩn"""
        if self.transform_matrix is not None:
            pt = np.array([[[x * SCREEN_WIDTH, y * SCREEN_HEIGHT]]], dtype=np.float32)
            warped = cv2.perspectiveTransform(pt, self.transform_matrix)
            raw_target_x = float(np.clip(warped[0][0][0], 0, SCREEN_WIDTH - 1))
            raw_target_y = float(np.clip(warped[0][0][1], 0, SCREEN_HEIGHT - 1))
            return raw_target_x, raw_target_y
        else:
            norm_x = (x - self.zone_x1) / (self.zone_x2 - self.zone_x1)
            norm_y = (y - self.zone_y1) / (self.zone_y2 - self.zone_y1)
            norm_x = float(np.clip(norm_x, 0.0, 1.0))
            norm_y = float(np.clip(norm_y, 0.0, 1.0))
            return norm_x * SCREEN_WIDTH, norm_y * SCREEN_HEIGHT

    def detect_finger_states(self, landmarks):
        """Xác định trạng thái giơ (UP) hay gập (DOWN) của từng ngón tay"""
        index_up = landmarks[8].y < landmarks[6].y
        middle_up = landmarks[12].y < landmarks[10].y
        ring_up = landmarks[16].y < landmarks[14].y
        pinky_up = landmarks[20].y < landmarks[18].y

        thumb_tip = landmarks[4]
        thumb_mcp = landmarks[2]
        index_mcp = landmarks[5]
        pinky_mcp = landmarks[17]

        dist_tip_pinky = math.hypot(thumb_tip.x - pinky_mcp.x, thumb_tip.y - pinky_mcp.y)
        dist_mcp_pinky = math.hypot(thumb_mcp.x - pinky_mcp.x, thumb_mcp.y - pinky_mcp.y)
        thumb_up = dist_tip_pinky > dist_mcp_pinky * 1.12 or (abs(thumb_tip.x - index_mcp.x) > 0.07)

        return {
            'thumb': thumb_up,
            'index': index_up,
            'middle': middle_up,
            'ring': ring_up,
            'pinky': pinky_up
        }

    def draw_hand_custom(self, frame, landmarks, is_right_hand=True, is_left_pinch=False, is_right_pinch=False, is_ring_pinch=False):
        """Vẽ khung xương bàn tay phân biệt rõ Tay Phải (Cyan) và Tay Trái (Magenta/Purple/Blue/Green)"""
        h, w, _ = frame.shape
        coords = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]

        if is_right_hand:
            bone_color = (255, 200, 0)
            joint_color = (0, 242, 254)
            label_text = "TAY PHAI (DI CHUOT)"
            label_color = (0, 242, 254)
        else:
            bone_color = (200, 100, 255)
            if is_left_pinch:
                joint_color = (0, 0, 255)
                label_text = "TAY TRAI [CLICK TRAI!]"
                label_color = (0, 0, 255)
            elif is_right_pinch:
                joint_color = (255, 200, 0)
                label_text = "TAY TRAI [CLICK PHAI!]"
                label_color = (255, 200, 0)
            elif is_ring_pinch:
                joint_color = (0, 255, 255)
                label_text = "TAY TRAI [ALT + TAB!]"
                label_color = (0, 255, 255)
            else:
                joint_color = (255, 100, 200)
                label_text = "TAY TRAI (DIEU KHIEN)"
                label_color = (255, 100, 200)

        # Draw connections
        for p1, p2 in HAND_CONNECTIONS:
            cv2.line(frame, coords[p1], coords[p2], bone_color, 2, cv2.LINE_AA)

        # Draw landmark points
        for i, (x, y) in enumerate(coords):
            if i in [4, 8, 12, 16]:
                cv2.circle(frame, (x, y), 8, joint_color, -1, cv2.LINE_AA)
            else:
                cv2.circle(frame, (x, y), 4, (180, 255, 180), -1, cv2.LINE_AA)

        # Tay phải: Tâm ngắm laser trên đầu ngón trỏ
        if is_right_hand:
            tip_px = coords[8]
            cv2.circle(frame, tip_px, 14, (0, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(frame, tip_px, 20, (0, 255, 128), 2, cv2.LINE_AA)
            cv2.line(frame, (tip_px[0] - 25, tip_px[1]), (tip_px[0] + 25, tip_px[1]), (0, 255, 255), 1, cv2.LINE_AA)
            cv2.line(frame, (tip_px[0], tip_px[1] - 25), (tip_px[0], tip_px[1] + 25), (0, 255, 255), 1, cv2.LINE_AA)

        # Tay trái: Các đường nối chụm điều khiển
        if not is_right_hand:
            p_thumb = coords[4]
            p_index = coords[8]
            p_middle = coords[12]
            p_ring = coords[16]

            # Click trái (ngón cái + trỏ)
            left_color = (0, 0, 255) if is_left_pinch else (255, 120, 255)
            cv2.line(frame, p_thumb, p_index, left_color, 4 if is_left_pinch else 1, cv2.LINE_AA)

            # Click phải (ngón cái + giữa)
            right_color = (255, 200, 0) if is_right_pinch else (120, 200, 255)
            cv2.line(frame, p_thumb, p_middle, right_color, 4 if is_right_pinch else 1, cv2.LINE_AA)

            # Đa nhiệm Alt+Tab (ngón cái + áp út)
            ring_color = (0, 255, 255) if is_ring_pinch else (100, 255, 150)
            cv2.line(frame, p_thumb, p_ring, ring_color, 4 if is_ring_pinch else 1, cv2.LINE_AA)

        # Ghi nhãn tên bàn tay
        wrist_p = coords[0]
        cv2.putText(frame, label_text, (wrist_p[0] - 50, wrist_p[1] + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.45, label_color, 2, cv2.LINE_AA)

    def draw_calibration_hud(self, frame, now):
        """Vẽ giao diện hướng dẫn hiệu chuẩn 4 góc cho 2 bàn tay"""
        h, w, _ = frame.shape
        step = self.calib_step
        step_info = CORNER_INFOS[step] if step < 4 else None

        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (w - 10, 85), (15, 15, 22), -1)
        cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)
        cv2.rectangle(frame, (10, 10), (w - 10, 85), (0, 215, 255), 2)

        if step < 4 and step_info:
            cv2.putText(
                frame,
                f"BUOC {step + 1}/4: HIEU CHINH {step_info['name']}",
                (25, 38),
                cv2.FONT_HERSHEY_DUPLEX,
                0.62,
                (0, 255, 255),
                2,
                cv2.LINE_AA
            )
            cv2.putText(
                frame,
                "Dua NGON TRO TAY PHAI den goc & CHUM TAY TRAI de xac nhan",
                (25, 68),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.46,
                (220, 220, 220),
                1,
                cv2.LINE_AA
            )

            pulse = int(math.sin(now * 6) * 6)
            gx = int(step_info['guide_x'] * w)
            gy = int(step_info['guide_y'] * h)
            cv2.circle(frame, (gx, gy), 24 + pulse, (0, 215, 255), 2, cv2.LINE_AA)
            cv2.circle(frame, (gx, gy), 10, (0, 255, 255), -1, cv2.LINE_AA)
            cv2.line(frame, (gx - 35, gy), (gx + 35, gy), (0, 215, 255), 1, cv2.LINE_AA)
            cv2.line(frame, (gx, gy - 35), (gx, gy + 35), (0, 215, 255), 1, cv2.LINE_AA)

        for i, pt in enumerate(self.calib_points):
            if pt is not None:
                px = int(pt[0] * w)
                py = int(pt[1] * h)
                cv2.circle(frame, (px, py), 12, (0, 255, 0), -1, cv2.LINE_AA)
                cv2.circle(frame, (px, py), 16, (255, 255, 255), 2, cv2.LINE_AA)
                cv2.putText(frame, f"Goc {i+1}", (px + 12, py - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2, cv2.LINE_AA)

    def run(self):
        cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(self.camera_index)

        if not cap.isOpened():
            print("[AirGesture] [ERROR] Khong the mo Camera. Vui long kiem tra Webcam.", flush=True)
            return

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 60)

        window_name = "Diana Air Gesture 2.5 - Anatomical Two-Hand AI Control"
        if self.show_hud:
            cv2.namedWindow(window_name, cv2.WINDOW_AUTOSIZE)
            try:
                cv2.setWindowProperty(window_name, cv2.WND_PROP_TOPMOST, 1)
                cv2.moveWindow(window_name, max(20, SCREEN_WIDTH - 680), 50)
            except Exception:
                pass

        try:
            while cap.isOpened():
                success, raw_frame = cap.read()
                if not success:
                    continue

                h, w, _ = raw_frame.shape

                # -------------------------------------------------------------
                # 1. NHẬN DIỆN BẰNG ẢNH GỐC (RAW RGB) ĐỂ MEDIAPIPE PHÂN LOẠI
                #    TAY TRÁI / TAY PHẢI CHÍNH XÁC 100% VỀ MẶT GIẢI PHẪU
                # -------------------------------------------------------------
                raw_rgb = cv2.cvtColor(raw_frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=raw_rgb)
                detection_result = self.detector.detect(mp_image)
                now = time.time()

                # Lật gương khung hình để vẽ hiển thị trực quan tự nhiên cho người dùng
                frame = cv2.flip(raw_frame, 1)

                right_hand_landmarks = None
                left_hand_landmarks = None

                # -------------------------------------------------------------
                # 2. PHÂN LOẠI & KHÓA TAY CHỦ THỂ (LỌC TRIỆT ĐỂ NGƯỜI ĐI NGANG)
                #    - Loại bỏ người đứng xa / hậu cảnh (Hand Size Filter)
                #    - Ưu tiên vùng thao tác trung tâm người ngồi trước máy tính
                #    - Khóa vị trí tay (Spatial Continuity Lock): Không bị cướp quyền
                #      khi có người đi ngang qua trước hoặc sau camera.
                # -------------------------------------------------------------
                candidate_right_hands = []
                candidate_left_hands = []

                if detection_result.hand_landmarks and detection_result.handedness:
                    for lms, handedness_list in zip(detection_result.hand_landmarks, detection_result.handedness):
                        if not handedness_list:
                            continue

                        hand_label = handedness_list[0].category_name
                        confidence = handedness_list[0].score

                        # Tính kích thước bàn tay (Palm span & Bounding Box)
                        xs = [lm.x for lm in lms]
                        ys = [lm.y for lm in lms]
                        min_x, max_x = min(xs), max(xs)
                        min_y, max_y = min(ys), max(ys)
                        bbox_diag = math.hypot(max_x - min_x, max_y - min_y)
                        palm_span = math.hypot(lms[0].x - lms[9].x, lms[0].y - lms[9].y)
                        hand_size = bbox_diag * 0.6 + palm_span * 0.4

                        # 1. Lọc ngưỡng kích thước tối thiểu: Bỏ qua người đứng xa / đi qua phía sau
                        if hand_size < self.MIN_HAND_SIZE:
                            continue

                        # Chuyển đổi toạ độ sang không gian hiển thị lật gương (x -> 1.0 - x)
                        mirrored_lms = [MirroredLandmark(1.0 - lm.x, lm.y, lm.z) for lm in lms]
                        wrist_mx = 1.0 - lms[0].x
                        wrist_my = lms[0].y
                        center_mx = 1.0 - (min_x + max_x) * 0.5
                        center_my = (min_y + max_y) * 0.5

                        # 2. Lọc vùng rìa ngoài khung hình (Edge Reject): Loại bỏ người lướt qua ở góc mép
                        if center_mx < 0.05 or center_mx > 0.95 or center_my < 0.06:
                            continue

                        # Điểm ưu tiên vùng trung tâm phía trước màn hình
                        center_bias = 1.0 - abs(center_mx - 0.5) * 0.7 - abs(center_my - 0.65) * 0.5

                        # 3. Phân loại Tay Phải / Tay Trái & Chấm Điểm Khóa Mục Tiêu (Lock Score)
                        is_right = (hand_label == 'Right') or (hand_label != 'Left' and wrist_mx > 0.5)

                        if is_right:
                            # Chấm điểm cho Tay Phải
                            if (now - self.last_right_seen < self.TRACKING_TIMEOUT) and (self.tracked_right_wrist is not None):
                                dist_to_prev = math.hypot(wrist_mx - self.tracked_right_wrist[0], wrist_my - self.tracked_right_wrist[1])
                                # Nếu nhảy vị trí quá xa và không phải bàn tay lớn vượt bậc -> Phạt điểm nặng (người khác đi ngang)
                                dist_penalty = dist_to_prev * 3.0 if dist_to_prev < 0.35 else (dist_to_prev * 7.0)
                                score = (hand_size * 3.0) + (confidence * 0.8) + (center_bias * 0.5) - dist_penalty
                            else:
                                score = (hand_size * 3.0) + (confidence * 0.8) + (center_bias * 0.8)

                            candidate_right_hands.append((score, hand_size, wrist_mx, wrist_my, mirrored_lms))
                        else:
                            # Chấm điểm cho Tay Trái
                            if (now - self.last_left_seen < self.TRACKING_TIMEOUT) and (self.tracked_left_wrist is not None):
                                dist_to_prev = math.hypot(wrist_mx - self.tracked_left_wrist[0], wrist_my - self.tracked_left_wrist[1])
                                dist_penalty = dist_to_prev * 3.0 if dist_to_prev < 0.35 else (dist_to_prev * 7.0)
                                score = (hand_size * 3.0) + (confidence * 0.8) + (center_bias * 0.5) - dist_penalty
                            else:
                                score = (hand_size * 3.0) + (confidence * 0.8) + (center_bias * 0.8)

                            candidate_left_hands.append((score, hand_size, wrist_mx, wrist_my, mirrored_lms))

                # Chọn bàn tay phù hợp nhất cho mỗi bên và duy trì Khóa Theo Dõi (Anchor Tracking)
                if candidate_right_hands:
                    candidate_right_hands.sort(key=lambda item: item[0], reverse=True)
                    best_right = candidate_right_hands[0]
                    right_hand_landmarks = best_right[4]
                    self.tracked_right_wrist = (best_right[2], best_right[3])
                    self.last_right_seen = now
                    self.right_seen_count += 1
                else:
                    if now - self.last_right_seen > self.TRACKING_TIMEOUT:
                        self.tracked_right_wrist = None
                        self.right_seen_count = 0

                if candidate_left_hands:
                    candidate_left_hands.sort(key=lambda item: item[0], reverse=True)
                    best_left = candidate_left_hands[0]
                    left_hand_landmarks = best_left[4]
                    self.tracked_left_wrist = (best_left[2], best_left[3])
                    self.last_left_seen = now
                    self.left_seen_count += 1
                else:
                    if now - self.last_left_seen > self.TRACKING_TIMEOUT:
                        self.tracked_left_wrist = None
                        self.left_seen_count = 0

                # =========================================================================
                # 3. XỬ LÝ TAY TRÁI:
                #    - Click Trái: Ngón trỏ + Ngón cái tay trái chụm
                #    - Click Phải: Ngón giữa + Ngón cái tay trái chụm (Mở menu tức thì)
                #    - Mở Đa Nhiệm: Ngón áp út + Ngón cái tay trái chụm & giữ (Alt + Tab)
                # =========================================================================
                is_left_hand_pinching = False
                is_right_click_pinching = False
                is_alt_tab_pinching = False

                if left_hand_landmarks is not None:
                    left_thumb = left_hand_landmarks[4]
                    left_index = left_hand_landmarks[8]
                    left_middle = left_hand_landmarks[12]
                    left_ring = left_hand_landmarks[16]

                    # Đo khoảng cách chụm từng ngón với ngón cái
                    dist_left_click = math.hypot(left_thumb.x - left_index.x, left_thumb.y - left_index.y)
                    dist_right_click = math.hypot(left_thumb.x - left_middle.x, left_thumb.y - left_middle.y)
                    dist_alt_tab = math.hypot(left_thumb.x - left_ring.x, left_thumb.y - left_ring.y)

                    # --- A. Xử lý Chuột Trái (Ngón trỏ + Ngón cái) ---
                    if not self.is_left_down:
                        if dist_left_click < self.PINCH_PRESS_DIST:
                            self.left_pinch_frames += 1
                            if self.left_pinch_frames >= self.REQUIRED_PINCH_FRAMES:
                                is_left_hand_pinching = True
                        else:
                            self.left_pinch_frames = 0
                    else:
                        if dist_left_click < self.PINCH_RELEASE_DIST:
                            is_left_hand_pinching = True
                        else:
                            is_left_hand_pinching = False
                            self.left_pinch_frames = 0

                    # --- B. Xử lý Chuột Phải (Ngón giữa + Ngón cái) ---
                    if dist_right_click < self.PINCH_PRESS_DIST:
                        self.left_right_pinch_frames += 1
                        if self.left_right_pinch_frames >= self.REQUIRED_PINCH_FRAMES:
                            is_right_click_pinching = True
                    else:
                        self.left_right_pinch_frames = 0
                        self.is_right_clicked = False

                    # --- C. Xử lý Đa Nhiệm Alt + Tab (Ngón áp út + Ngón cái) ---
                    if not self.is_alt_tab_active:
                        if dist_alt_tab < self.PINCH_PRESS_DIST:
                            self.left_ring_pinch_frames += 1
                            if self.left_ring_pinch_frames >= self.REQUIRED_PINCH_FRAMES:
                                is_alt_tab_pinching = True
                        else:
                            self.left_ring_pinch_frames = 0
                    else:
                        if dist_alt_tab < self.PINCH_RELEASE_DIST:
                            is_alt_tab_pinching = True
                        else:
                            is_alt_tab_pinching = False
                            self.left_ring_pinch_frames = 0

                # Kích hoạt Click Chuột Phải Tức Thì (Single Shot Trigger)
                if is_right_click_pinching and not self.is_right_clicked and (now > self.right_click_cooldown):
                    user32.mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
                    time.sleep(0.015)
                    user32.mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
                    self.is_right_clicked = True
                    self.right_click_cooldown = now + 0.35

                # Kích hoạt & Duy trì Đa Nhiệm Alt + Tab (Giữ Alt, Bấm Tab rồi nhả Tab ra)
                if is_alt_tab_pinching:
                    if not self.is_alt_tab_active:
                        user32.keybd_event(VK_MENU, 0, 0, 0)               # Nhấn giữ ALT
                        time.sleep(0.02)
                        user32.keybd_event(VK_TAB, 0, 0, 0)                # Bấm TAB
                        time.sleep(0.02)
                        user32.keybd_event(VK_TAB, 0, KEYEVENTF_KEYUP, 0)  # Nhả TAB ra (ALT vẫn giữ)
                        self.is_alt_tab_active = True
                else:
                    if self.is_alt_tab_active:
                        user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0) # Nhả ALT
                        self.is_alt_tab_active = False

                trigger_left_click = is_left_hand_pinching

                # =========================================================================
                # 4. CHẾ ĐỘ HIỆU CHỈNH 4 GÓC (CALIBRATION MODE)
                # =========================================================================
                if self.is_calibrating:
                    if right_hand_landmarks is not None:
                        r_index_tip = right_hand_landmarks[8]
                        if trigger_left_click and (now > self.calib_cooldown):
                            self.calib_points[self.calib_step] = (r_index_tip.x, r_index_tip.y)
                            self.calib_step += 1
                            self.calib_cooldown = now + 0.6

                            if self.calib_step >= 4:
                                self._compute_transform_matrix()
                                self.save_calibration()
                                self.is_calibrating = False
                                self.calib_success_time = now
                                self.active_gesture_text = "✅ ĐÃ THIẾT LẬP VÙNG DI CHUỘT THÀNH CÔNG!"
                                self.active_color = (0, 255, 0)

                    if self.show_hud:
                        if right_hand_landmarks:
                            self.draw_hand_custom(frame, right_hand_landmarks, is_right_hand=True)
                        if left_hand_landmarks:
                            self.draw_hand_custom(frame, left_hand_landmarks, is_right_hand=False, is_left_pinch=is_left_hand_pinching, is_right_pinch=is_right_click_pinching, is_ring_pinch=is_alt_tab_pinching)
                        self.draw_calibration_hud(frame, now)
                        cv2.imshow(window_name, frame)
                        key = cv2.waitKey(1) & 0xFF
                        if key == ord('q') or key == 27:
                            break
                        elif key == ord('c') or key == ord('C'):
                            self.start_calibration()
                    continue

                # =========================================================================
                # 5. TAY PHẢI: DI CHUỘT CHUẨN 1:1 TUYỆT ĐỐI (DIRECT 1:1 ABSOLUTE MAPPING)
                #    - Bám sát 100% ngón trỏ theo vị trí thực tế trong vùng 4 góc
                # =========================================================================
                mouse_moved = False
                if right_hand_landmarks is not None:
                    r_fingers = self.detect_finger_states(right_hand_landmarks)
                    r_index_tip = right_hand_landmarks[8]

                    # Khi ngón trỏ tay phải giơ lên
                    if r_fingers['index']:
                        # Bắt đầu phiên nhận diện mới sau khi mất dấu: Làm mới bộ lọc tức thì
                        if self.right_seen_count <= 2:
                            self.raw_history_x.clear()
                            self.raw_history_y.clear()
                            self.filter_x.t_prev = None
                            self.filter_y.t_prev = None

                        # BƯỚC 1: Lọc cửa sổ cuốn trung bình gia quyền (4-Frame Rolling Average)
                        self.raw_history_x.append(r_index_tip.x)
                        self.raw_history_y.append(r_index_tip.y)

                        n_pts = len(self.raw_history_x)
                        if n_pts == 4:
                            weights = [0.10, 0.20, 0.30, 0.40]
                        elif n_pts == 3:
                            weights = [0.20, 0.30, 0.50]
                        elif n_pts == 2:
                            weights = [0.35, 0.65]
                        else:
                            weights = [1.0]

                        smooth_raw_x = sum(w * p for w, p in zip(weights, self.raw_history_x))
                        smooth_raw_y = sum(w * p for w, p in zip(weights, self.raw_history_y))

                        # BƯỚC 2: Ánh xạ toạ độ ma trận 4 góc tuyệt đối 1:1
                        raw_target_x, raw_target_y = self.map_coordinates(smooth_raw_x, smooth_raw_y)

                        # BƯỚC 3: Bộ lọc 1€ Filter siêu êm
                        filtered_x = self.filter_x.filter(now, raw_target_x)
                        filtered_y = self.filter_y.filter(now, raw_target_y)

                        # BƯỚC 4: Vùng chết chống rung vi mô (Deadband Lock)
                        dist_moved = math.hypot(filtered_x - self.prev_cursor_x, filtered_y - self.prev_cursor_y)

                        if dist_moved < 3.2:
                            curr_x = self.prev_cursor_x
                            curr_y = self.prev_cursor_y
                        elif dist_moved < 12.0:
                            factor = ((dist_moved - 3.2) / 8.8) ** 1.8
                            curr_x = self.prev_cursor_x + (filtered_x - self.prev_cursor_x) * factor
                            curr_y = self.prev_cursor_y + (filtered_y - self.prev_cursor_y) * factor
                        else:
                            curr_x = filtered_x
                            curr_y = filtered_y

                        # Giới hạn trong kích thước màn hình
                        curr_x = max(0.0, min(float(SCREEN_WIDTH - 1), curr_x))
                        curr_y = max(0.0, min(float(SCREEN_HEIGHT - 1), curr_y))

                        # Cập nhật toạ độ Windows Cursor
                        user32.SetCursorPos(int(round(curr_x)), int(round(curr_y)))
                        self.prev_cursor_x = curr_x
                        self.prev_cursor_y = curr_y
                        mouse_moved = True
                else:
                    self.raw_history_x.clear()
                    self.raw_history_y.clear()

                # =========================================================================
                # 6. KÍCH HOẠT SỰ KIỆN CLICK CHUỘT / TRẠNG THÁI HUD
                # =========================================================================
                if trigger_left_click:
                    if not self.is_left_down:
                        user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                        self.is_left_down = True
                        self.pinch_start_time = now

                    hold_duration = now - self.pinch_start_time
                    if hold_duration > 0.25:
                        self.active_gesture_text = "✊ TAY TRÁI: GIỮ CHUỘT / KÉO THẢ (DRAG)"
                        self.active_color = (0, 140, 255)
                    else:
                        self.active_gesture_text = "🔴 TAY TRÁI: ĐANG CLICK CHUỘT TRÁI"
                        self.active_color = (0, 0, 255)

                elif is_right_click_pinching:
                    self.active_gesture_text = "🖱️ TAY TRÁI: CLICK CHUỘT PHẢI (RIGHT CLICK)"
                    self.active_color = (255, 200, 0)

                elif is_alt_tab_pinching or self.is_alt_tab_active:
                    self.active_gesture_text = "📑 TAY TRÁI: ĐANG MỞ & GIỮ ĐA NHIỆM (ALT+TAB)"
                    self.active_color = (0, 255, 255)

                else:
                    if self.is_left_down:
                        user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                        self.is_left_down = False

                    if mouse_moved:
                        if left_hand_landmarks is not None:
                            self.active_gesture_text = "🖐️ DI CHUỘT 1:1 (PHẢI) | 🔘 SẴN SÀNG CLICK / ĐA NHIỆM (TRÁI)"
                            self.active_color = (0, 255, 128)
                        else:
                            self.active_gesture_text = "🖐️ DI CHUỘT 1:1 (TAY PHẢI)"
                            self.active_color = (0, 242, 254)
                    else:
                        if now - self.calib_success_time < 2.0:
                            self.active_gesture_text = "✅ ĐÃ THIẾT LẬP VÙNG DI CHUỘT THÀNH CÔNG!"
                            self.active_color = (0, 255, 0)
                        else:
                            self.active_gesture_text = "TAY PHẢI: DI CHUỘT 1:1 | TAY TRÁI: TRÁI / PHẢI / ALT+TAB"
                            self.active_color = (180, 180, 180)

                # =========================================================================
                # 7. VẼ KHUNG XƯƠNG & HUD
                # =========================================================================
                if self.show_hud:
                    if right_hand_landmarks is not None:
                        self.draw_hand_custom(frame, right_hand_landmarks, is_right_hand=True)
                    if left_hand_landmarks is not None:
                        self.draw_hand_custom(frame, left_hand_landmarks, is_right_hand=False, is_left_pinch=is_left_hand_pinching, is_right_pinch=is_right_click_pinching, is_ring_pinch=is_alt_tab_pinching)

                    # Top Status Banner
                    overlay = frame.copy()
                    cv2.rectangle(overlay, (10, 10), (w - 10, 60), (18, 18, 24), -1)
                    cv2.addWeighted(overlay, 0.78, frame, 0.22, 0, frame)
                    cv2.rectangle(frame, (10, 10), (w - 10, 60), self.active_color, 2)

                    cv2.putText(
                        frame,
                        f"DIANA AIR GESTURE 2.5: {self.active_gesture_text}",
                        (25, 42),
                        cv2.FONT_HERSHEY_DUPLEX,
                        0.52,
                        (255, 255, 255),
                        2,
                        cv2.LINE_AA
                    )

                    # Vẽ vùng di chuột đã hiệu chuẩn
                    if all(p is not None for p in self.calib_points):
                        poly_pts = np.array([
                            [int(self.calib_points[0][0] * w), int(self.calib_points[0][1] * h)],
                            [int(self.calib_points[1][0] * w), int(self.calib_points[1][1] * h)],
                            [int(self.calib_points[2][0] * w), int(self.calib_points[2][1] * h)],
                            [int(self.calib_points[3][0] * w), int(self.calib_points[3][1] * h)]
                        ], np.int32)
                        poly_pts = poly_pts.reshape((-1, 1, 2))
                        cv2.polylines(frame, [poly_pts], isClosed=True, color=(0, 255, 255), thickness=2, lineType=cv2.LINE_AA)
                        cv2.putText(
                            frame,
                            "VUNG DI CHUOT (Phim 'C': Hieu chinh lai)",
                            (poly_pts[0][0][0] + 5, max(80, poly_pts[0][0][1] + 18)),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.45,
                            (0, 255, 255),
                            1,
                            cv2.LINE_AA
                        )

                    cv2.imshow(window_name, frame)

                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q') or key == 27:
                        break
                    elif key == ord('c') or key == ord('C'):
                        self.start_calibration()

        except KeyboardInterrupt:
            pass
        finally:
            cap.release()
            cv2.destroyAllWindows()
            if self.is_left_down:
                user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
            if self.is_alt_tab_active:
                user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)
            pid_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.air_gesture.pid')
            if os.path.exists(pid_file):
                try:
                    os.remove(pid_file)
                except Exception:
                    pass
            print("[AirGesture] [STOPPED] Da dung Diana Air Gesture 2.5.", flush=True)


if __name__ == '__main__':
    pid_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.air_gesture.pid')
    try:
        with open(pid_file, 'w', encoding='utf-8') as f:
            f.write(str(os.getpid()))
    except Exception:
        pass

    show_preview = True
    if '--headless' in sys.argv:
        show_preview = False

    controller = AirGestureController(camera_index=0, show_hud=show_preview)
    controller.run()
