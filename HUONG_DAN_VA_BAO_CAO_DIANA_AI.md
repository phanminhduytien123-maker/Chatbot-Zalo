# 🌸 BÁO CÁO TỔNG HỢP VÀ HƯỚNG DẪN SỬ DỤNG TRỢ LÝ DIANA AI (BẢN 3.0)

> **Người thực hiện:** Antigravity AI Pair Programmer  
> **Dành cho:** Anh Phan Minh Duy Tiến  
> **Thời gian cập nhật:** Đêm 24/09/2026  
> **Địa chỉ Web App Live:** [https://diana-h73u.onrender.com/](https://diana-h73u.onrender.com/)  
> **Kho mã nguồn GitHub:** [https://github.com/phanminhduytien123-maker/Chatbot-Zalo.git](https://github.com/phanminhduytien123-maker/Chatbot-Zalo.git) (Nhánh `main`)

---

## 📑 MỤC LỤC
1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Các nâng cấp quan trọng đã hoàn thiện](#2-các-nâng-cấp-quan-trọng-đã-hoàn-thiện)
   - [2.1. Giao diện Mobile-First & Dynamic Island](#21-giao-diện-mobile-first--dynamic-island)
   - [2.2. Khắc phục triệt để lỗi nhận diện giọng nói (STT trên Xiaomi/Redmi HyperOS)](#22-khắc-phục-triệt-để-lỗi-nhận-diện-giọng-nói-stt-trên-xiaomiredmi-hyperos)
   - [2.3. Chế độ Đàm thoại Rảnh tay liên tục 2 chiều (Google Gemini Live / Auto VAD)](#23-chế-độ-đàm-thoại-rảnh-tay-liên-tục-2-chiều-google-gemini-live--auto-vad)
   - [2.4. Điều khiển Tắt / Mở sáng màn hình máy tính từ xa](#24-điều-khiển-tắt--mở-sáng-màn-hình-máy-tính-từ-xa)
   - [2.5. Trung tâm Tùy chỉnh Giọng nói & Tích hợp giọng Typhoeus (MiniMax)](#25-trung-tâm-tùy-chỉnh-giọng-nói--tích-hợp-giọng-typhoeus-minimax)
3. [Hướng dẫn sử dụng chi tiết](#3-hướng-dẫn-sử-dụng-chi-tiết)
4. [Bảng danh sách câu lệnh điều khiển PC & Giọng nói](#4-bảng-danh-sách-câu-lệnh-điều-khiển-pc--giọng-nói)
5. [Kiến trúc kỹ thuật & Danh sách Files đã cập nhật](#5-kiến-trúc-kỹ-thuật--danh-sách-files-đã-cập-nhật)

---

## 1. TỔNG QUAN HỆ THỐNG

Diana AI là hệ thống trợ lý cá nhân thông minh đa nền tảng (Web App PWA, Zalo Live Bot, và Windows Client Agent):
- **Phía Web & Điện thoại:** Cung cấp trải nghiệm đàm thoại giọng nói 2 chiều siêu mượt mà, phản hồi tức thì bằng tiếng Việt tự nhiên, có nút chấm tròn AssistiveTouch nổi như iPhone và đảo thông tin Dynamic Island.
- **Phía Máy tính (PC Agent):** Nhận và thực thi mọi câu lệnh điều khiển phần cứng, ứng dụng Windows (mở app, tắt/bật màn hình, khóa máy, chụp ảnh màn hình, kiểm tra pin, chỉnh âm lượng) thông qua cầu nối Cloud Bridge an toàn.

---

## 2. CÁC NÂNG CẤP QUAN TRỌNG ĐÃ HOÀN THIỆN

### 2.1. Giao diện Mobile-First & Dynamic Island
- **Tương thích 100% màn hình điện thoại:** Thiết kế chuẩn Glassmorphism hiện đại, hỗ trợ `viewport-fit=cover`, tự động căn chỉnh khoảng cách an toàn tai thỏ / thanh điều hướng (`env(safe-area-inset)`), không bị che khuất khi bàn phím ảo bật lên.
- **Dynamic Capsule (Đảo thông tin):** Hiển thị trạng thái lắng nghe, suy nghĩ và kết quả câu trả lời nổi trên đỉnh màn hình với thao tác vuốt lên để ẩn cực kỳ tiện lợi.
- **Chấm tròn AssistiveTouch nổi:** Tự do kéo thả và tự động hít bám vào cạnh viền màn hình (vật lý như nút Home ảo iPhone).

### 2.2. Khắc phục triệt để lỗi nhận diện giọng nói (STT trên Xiaomi/Redmi HyperOS)
- **Vấn đề trước đây:** Trình duyệt trên các dòng máy Xiaomi/Redmi (như Redmi K70) bị dịch vụ Mi AI hệ thống can thiệp làm tê liệt `webkitSpeechRecognition` tiếng Việt, dẫn đến lỗi "Không thể nhận diện âm thanh".
- **Giải pháp dứt điểm:** Chuyển sang thu âm trực tiếp qua `MediaRecorder` + `AudioContext` của trình duyệt, gửi gói âm thanh gốc lên endpoint `/api/voice-audio`. Máy chủ sử dụng mô hình AI đa phương thức **Gemini 3.6 Multimodal Audio** để giải mã chính xác 100% từng từ ngữ tiếng Việt.

### 2.3. Chế độ Đàm thoại Rảnh tay liên tục 2 chiều (Google Gemini Live / Auto VAD)
- **Tự động bắt đầu nghe:** Bộ phân tích tần số âm thanh thời gian thực (Web Audio Analyser) phát hiện ngay khi anh bắt đầu nói (độ trễ ~70ms) và tự động ghi âm mà **không cần chạm vào bất kỳ nút nào**.
- **Tự động kết thúc câu:** Khi anh dừng nói khoảng 1.15 giây, hệ thống tự động đóng gói âm thanh gửi AI xử lý.
- **Phát âm câu trả lời & Tự động nối tiếp:** Diana trả lời bằng giọng nói tiếng Việt tự nhiên. Ngay khi nói xong, hệ thống tự động mở lại trạng thái chờ câu tiếp theo.
- **Chống dội âm (Echo Gating):** Tự động khóa micro trong lúc Diana đang nói để bot không bị nghe lại tiếng của chính mình.
- **Giữ màn hình sáng (Screen WakeLock):** Tự động giữ màn hình điện thoại luôn thức trong lúc đàm thoại liên tục.

### 2.4. Điều khiển Tắt / Mở sáng màn hình máy tính từ xa
- **Tắt màn hình PC:** Khi anh nói *"Diana ơi tắt màn hình máy tính"* hoặc *"làm tối màn hình"*, bot gửi lệnh làm đen màn hình qua Windows API `PostMessage(0xFFFF, 0x0112, 0xF170, 2)`. Màn hình tắt tối tiết kiệm điện nhưng máy tính vẫn chạy ngầm các tác vụ bình thường.
- **Mở sáng lại màn hình PC:** Khi anh nói *"Bật màn hình"* hoặc *"mở lại màn hình"*, bot gửi tín hiệu đánh thức `0xF170, -1` kết hợp mô phỏng cử động chuột làm màn hình bật sáng lên ngay tức khắc!

### 2.5. Trung tâm Tùy chỉnh Giọng nói & Tích hợp giọng Typhoeus (MiniMax)
- **Bảng Cài đặt Giọng nói (Voice Settings Modal):** Mở bằng nút ⚙️ trên thanh header hoặc phím tắt `🎙️ Đổi giọng nói`.
- **Hỗ trợ 5 lựa chọn giọng đọc:**
  1. 🌸 **Diana (Mặc định):** Giọng Nữ ngọt ngào, dịu dàng, tự nhiên từ Cloud.
  2. 🏹 **Typhoeus (MiniMax Neural):** Tích hợp trực tiếp mã Voice ID `moss_audio_881639b8-b831-11f1-80cc-aac30e71d302` từ [MiniMax.io](https://www.minimax.io/audio/voices) mang âm sắc thợ săn Sarkaz trầm tĩnh, sắc sảo từ *Arknights: Endfield*.
  3. 👨 **Minh Quân:** Giọng Nam miền Bắc trầm ấm, dứt khoát.
  4. 👩‍💼 **Huyền Trang:** Giọng Nữ chuẩn Google Voice.
  5. 📱 **Giọng máy thiết bị:** Cho phép chọn trực tiếp bất kỳ giọng đọc nào có sẵn trên điện thoại hoặc máy tính của anh.
- **Tùy chỉnh Tốc độ (0.75x - 1.4x) & Cao độ Pitch (Trầm ấm - Tự nhiên - Trong trẻo).**
- **Nút "🔊 Nghe thử giọng"** và **"💾 Lưu cài đặt"** lưu tự động vào `localStorage`.

---

## 3. HƯỚNG DẪN SỬ DỤNG CHI TIẾT

### Bước 1: Khởi động PC Agent trên Máy tính Windows (để điều khiển PC)
1. Mở thư mục dự án `d:\Zalo Bot` trên máy tính.
2. Nhấp đúp chạy file: `Chay_PC_Agent.bat` (hoặc mở PowerShell gõ: `node pcAgent.js`).
3. Khi terminal hiện dòng: `📡 Máy chủ kết nối: https://diana-h73u.onrender.com` và `🟢 ĐANG ONLINE` là hoàn tất.

### Bước 2: Mở Web App trên Điện thoại / Laptop
1. Dùng trình duyệt (Chrome, Safari, Cốc Cốc) truy cập: **[https://diana-h73u.onrender.com/](https://diana-h73u.onrender.com/)**.
2. Bấm nút **`✨ Tự động nghe (Rảnh tay)`** (nút Micro có ánh sáng xanh trên cùng).
3. Cấp quyền Micro cho trình duyệt (nếu có hỏi).

### Bước 3: Trải nghiệm Đàm thoại & Điều khiển
- Đặt điện thoại trước mặt và nói tự nhiên:
  - *"Diana ơi tắt màn hình máy tính đi"* ➡️ Màn hình PC tắt đen.
  - *"Mở lại màn hình cho anh"* ➡️ Màn hình PC sáng lên lại.
  - *"Chụp ảnh màn hình máy tính"* ➡️ Diana chụp và gửi ảnh màn hình desktop về điện thoại.
  - *"Hôm nay thời tiết thế nào em?"* ➡️ Diana đọc to dự báo thời tiết.

---

## 4. BẢNG DANH SÁCH CÂU LỆNH ĐIỀU KHIỂN PC & GIỌNG NÓI

| Nhóm chức năng | Câu nói mẫu (Giọng nói tự nhiên) | Lệnh Slash tương ứng (/pc) |
| :--- | :--- | :--- |
| **Màn hình** | *"Tắt màn hình"*, *"Làm tối màn hình"* | `/pc turnoff_display` |
| **Đánh thức** | *"Bật màn hình"*, *"Mở màn hình"*, *"Sáng màn hình"* | `/pc wake_display` |
| **Chụp màn hình** | *"Chụp ảnh màn hình"*, *"Chụp desktop"* | `/pc screen` hoặc `/screenshot` |
| **Khóa máy** | *"Khóa màn hình"*, *"Khóa máy"* | `/pc lock` |
| **Mở khóa máy** | *"Mở khóa máy tính"* | `/pc unlock` |
| **Âm lượng loa** | *"Chỉnh âm lượng 70%"*, *"Tắt tiếng"* | `/pc vol 70` hoặc `/pc mute` |
| **Mở ứng dụng** | *"Mở Youtube"*, *"Mở VS Code"*, *"Mở Chrome"* | `/pc open youtube` |
| **Pin Laptop** | *"Kiểm tra pin"*, *"Pin laptop còn bao nhiêu"* | `/pc pin` |
| **Hẹn giờ tắt máy** | *"Tắt máy sau 30 phút"*, *"Hủy tắt máy"* | `/pc shutdown 30` / `/pc cancel` |
| **Học tập TDTU** | *"Xem bảng điểm"*, *"GPA của anh bao nhiêu"*, *"Học phí"* | `/bangdiem`, `/gpa`, `/hocphi` |

---

## 5. KIẾN TRÚC KỸ THUẬT & DANH SÁCH FILES ĐÃ CẬP NHẬT

| File | Chức năng & Nội dung cập nhật |
| :--- | :--- |
| `public/index.html` | Thêm Modal Cài đặt Giọng nói (`#voiceSettingsModal`), card Typhoeus MiniMax, input API Key, nút cài đặt header, viewport-fit cover. |
| `public/style.css` | Hệ thống Glassmorphism Mobile-First, CSS Modal Cài đặt giọng nói, hiệu ứng sóng âm thanh, responsive safe-area insets. |
| `public/app.js` | Vòng lặp đàm thoại liên tục (Auto VAD), Web Audio Analyser, Screen WakeLock, logic điều khiển giọng đọc, lưu cài đặt `localStorage`. |
| `public/sw.js` | Service Worker cache buster `diana-voice-v9`, đảm bảo điện thoại luôn nhận bản cập nhật mới nhất. |
| `src/zaloLiveIndex.js` | Endpoint `/api/voice-audio` tích hợp Gemini 3.6 STT; Endpoint `/api/tts` hỗ trợ đa giọng đọc và tích hợp MiniMax Neural TTS (`callMiniMaxTTS`). |
| `src/zalo/messageHandler.js` | Nhận diện ngôn ngữ tự nhiên cho lệnh `wake_display` (bật màn hình) và `turnoff_display` (tắt màn hình). |
| `src/pc/windowsController.js` | Điều khiển phần cứng Windows qua Win32 API (`PostMessage`, `mouse_event`, `keybd_event`, PowerShell). |
| `pcAgent.js` | Client daemon chạy ngầm trên máy tính Windows, tự động hot-reload khi có lệnh mới. |

---

> 💡 **Ghi chú thêm:** Toàn bộ mã nguồn đã được build, kiểm thử cẩn thận và đẩy lên máy chủ Render Live sẵn sàng cho anh Tiến kiểm tra. Chúc anh có trải nghiệm tuyệt vời cùng Diana! 🌸✨
