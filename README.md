# 🤖 DIANA - AI Zalo Agent & Assistant

> **Trợ lý AI Agent cá nhân thông minh tích hợp Zalo, kết nối Cổng thông tin đào tạo sinh viên (TDTU), tự động hóa quét điểm số, GPA, rèn luyện, học phí và canh biến động 24/7.**

---

## ✨ Tính Năng Nổi Bật

- 🌸 **Persona Trợ Lý Diana**: Trợ lý AI cá nhân nhã nhặn, dễ thương, thông minh, giao tiếp tự nhiên qua Zalo và hỗ trợ giải đáp công nghệ, đồ án.
- 🎓 **Tự động SSO & Cào dữ liệu toàn khóa**: Tự động đăng nhập qua hệ thống xác thực SSO trường học, thu thập dữ liệu lịch sử trên toàn bộ 19 học kỳ.
- 📊 **Theo dõi GPA & Tín chỉ chuẩn xác**: Đồng bộ trực tiếp điểm trung bình tích lũy (GPA) và số tín chỉ đạt từ hệ thống đào tạo chính thức.
- 🎖️ **Tra cứu Điểm rèn luyện (ĐRL) & Hoạt động**: Theo dõi chi tiết điểm rèn luyện từng học kỳ và danh sách sự kiện phong trào.
- 💰 **Tổng hợp Học phí & Công nợ**: Tự động tổng hợp chi tiết và số tiền học phí đã nộp qua các kỳ học.
- 🚨 **Canh biến động Real-time (Push Alert)**: Trình quét ngầm tự động phát hiện môn mới lên điểm hoặc đơn từ được duyệt và bắn thông báo trực tiếp về Zalo.
- 🔄 **Chuyển đổi tài khoản linh hoạt**: Hỗ trợ lệnh `/change /MSSV/MậtKhẩu` để tra cứu nhanh cho tài khoản sinh viên khác.
- 📱 **Chạy đa nền tảng 24/7**: Chạy mượt mà trên máy tính (Windows/macOS/Linux) hoặc trực tiếp trên điện thoại Android qua **Termux**.

---

## 🛠️ Cài Đặt & Sử Dụng Nhanh

### 1. Cài đặt thư viện dependencies
```bash
npm install
```

### 2. Cấu hình biến môi trường
Tạo file `.env` từ file mẫu `.env.example`:
```bash
cp .env.example .env
```
Điền các thông tin cơ bản:
```env
GEMINI_API_KEY=your_gemini_api_key
STUDENT_ID=42200522
STUDENT_PASS=your_password
ZALO_TARGET_PHONE=0847839234
CHECK_INTERVAL_MINUTES=480
```

### 3. Khởi chạy Bot trên Zalo Live
```bash
npm run zalo
```
*(Quét mã QR lần đầu tiên bằng tài khoản Zalo, các lần sau hệ thống sẽ tự động đăng nhập từ phiên đã lưu `appstate.json`).*

---

## 💬 Danh Sách Lệnh & Giao Tiếp

### 📌 Lệnh tắt nhanh (Slash commands):
| Lệnh | Chức năng |
| :--- | :--- |
| `/check` | 📊 Báo cáo tổng quan tình trạng hệ thống & bảng điểm |
| `/diem` | 🎓 Xem chi tiết bảng điểm các môn học |
| `/don` | 📑 Theo dõi tiến độ duyệt đơn từ trực tuyến |
| `/tintuc` | 📢 Xem các thông báo mới nhất từ trường & khoa |
| `/hoatdong` | 🏃 Xem hoạt động ngoại khóa & điểm rèn luyện |
| `/change /MSSV/Pass` | 🔄 Đổi tài khoản để kiểm tra dữ liệu sinh viên khác |
| `/cookie <cookie>` | 🔑 Cập nhật chuỗi Cookie thủ công (nếu cần) |
| `/simscore` | 🧪 Giả lập có điểm môn mới để test chuông báo động |
| `/simapp` | 🧪 Giả lập đơn được duyệt để test cảnh báo |
| `/menu` | 💡 Xem danh sách trợ giúp & hướng dẫn |

### 💬 Trò chuyện ngôn ngữ tự nhiên:
Bạn có thể nhắn tin bằng tiếng Việt tự nhiên bất kỳ câu nào:
- *"Xem GPA và tổng số tín chỉ tích lũy của anh"*
- *"Học kỳ 1 2024 anh học những môn nào, điểm tổng kết ra sao em?"*
- *"Kiểm tra giúp anh xem học phí đã đóng hết chưa"*
- *"Hôm nay có thông báo gì mới trên trường không Diana?"*
- *"Diana ơi, giải thích giúp anh nguyên lý hoạt động của bộ điều khiển PID"*

---

## 📱 Hướng Dẫn Chạy 24/7 Trên Android (Termux)

1. Cài đặt **Termux** từ F-Droid.
2. Cập nhật và cài Node.js + Git:
   ```bash
   pkg update && pkg install -y nodejs-lts git
   ```
3. Clone repository và cài đặt:
   ```bash
   git clone https://github.com/phanminhduytien123-maker/Chatbot-Zalo.git
   cd Chatbot-Zalo
   npm install
   ```
4. Khởi chạy bot:
   ```bash
   node src/zaloLiveIndex.js
   ```

---

## 🔒 Bảo Mật & An Toàn

- Thông tin tài khoản sinh viên và phiên Zalo được mã hóa lưu trữ nội bộ trên máy người dùng (`data/appstate.json`, `.env`).
- Không chia sẻ hay upload các file cấu hình nhạy cảm lên Git.

---

## 📄 License
Phát triển bởi **Phan Minh Duy Tiến** (TDTU). Mã nguồn mở phục vụ mục đích học tập và nghiên cứu.
