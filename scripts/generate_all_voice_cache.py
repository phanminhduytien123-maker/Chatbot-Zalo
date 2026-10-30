import os
import subprocess
import hashlib
import time
import sys

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

CACHE_DIR = r"D:\Zalo Bot\data\wake_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

PROMPTS = {
    'hear_you': 'Dạ em nghe ạ!',
    'processing': 'Dạ em đang xử lý ạ!',
    'did_not_hear': 'Dạ em chưa nghe rõ, anh nói lại giúp em nhé!',
    'general_ack': 'Dạ em đã nhận được lệnh từ anh Tiến rồi ạ!',
    'help_prompt': 'Dạ em đây ạ! Anh cần em giúp gì không ạ?',
    
    # Chrome
    'opened_chrome': 'Dạ em đã mở trình duyệt Chrome cho anh rồi ạ!',
    'focused_chrome': 'Dạ em đã đưa trình duyệt Chrome lên màn hình cho anh rồi ạ!',
    
    # Zalo
    'opened_zalo': 'Dạ em đã mở ứng dụng Zalo cho anh rồi ạ!',
    'focused_zalo': 'Dạ em đã đưa ứng dụng Zalo lên màn hình cho anh rồi ạ!',
    
    # Bambu Studio
    'opened_bambu': 'Dạ em đã mở phần mềm in 3D Bambu Studio cho anh rồi ạ!',
    'focused_bambu': 'Dạ em đã đưa phần mềm in 3D Bambu Studio lên màn hình cho anh rồi ạ!',
    
    # Office
    'opened_word': 'Dạ em đã mở Microsoft Word cho anh rồi ạ!',
    'focused_word': 'Dạ em đã đưa Microsoft Word lên màn hình cho anh rồi ạ!',
    'opened_excel': 'Dạ em đã mở Microsoft Excel cho anh rồi ạ!',
    'focused_excel': 'Dạ em đã đưa Microsoft Excel lên màn hình cho anh rồi ạ!',
    'opened_powerpoint': 'Dạ em đã mở Microsoft PowerPoint cho anh rồi ạ!',
    'focused_powerpoint': 'Dạ em đã đưa Microsoft PowerPoint lên màn hình cho anh rồi ạ!',
    
    # Tools & Dev
    'opened_vscode': 'Dạ em đã mở Visual Studio Code để anh làm việc rồi ạ!',
    'focused_vscode': 'Dạ em đã đưa Visual Studio Code lên màn hình cho anh rồi ạ!',
    'opened_calc': 'Dạ em đã bật ứng dụng Máy tính Calculator cho anh rồi ạ!',
    'opened_notepad': 'Dạ em đã mở Notepad cho anh ghi chú rồi ạ!',
    
    # Web & Social
    'opened_youtube': 'Dạ em đã mở YouTube cho anh rồi ạ!',
    'opened_google': 'Dạ em đã mở Google cho anh rồi ạ!',
    'opened_facebook': 'Dạ em đã mở Facebook cho anh rồi ạ!',
    'opened_github': 'Dạ em đã mở GitHub cho anh rồi ạ!',
    'opened_chatgpt': 'Dạ em đã mở ChatGPT cho anh rồi ạ!',
    'opened_portal': 'Dạ em đã mở Cổng thông tin sinh viên TDTU cho anh Tiến rồi ạ!',
    'opened_station': 'Dạ em đã mở giao diện Trạm Trung Tâm Diana cho anh rồi ạ!',
    
    # Games & System
    'opened_lol': 'Dạ em đã mở Liên Minh Huyền Thoại cho anh rồi ạ! Chúc anh leo rank vui vẻ!',
    'locked_pc': 'Dạ em đã khóa màn hình máy tính của anh rồi ạ!',
    'sleep_pc': 'Dạ chúc anh Tiến ngủ ngon ạ! Em đang đưa máy vào chế độ Sleep đây ạ!',
    
    # Media controls
    'vol_up': 'Dạ em đã tăng âm lượng rồi ạ!',
    'vol_down': 'Dạ em đã giảm âm lượng rồi ạ!',
    'vol_mute': 'Dạ em đã tắt tiếng rồi ạ!',
    'music_toggle': 'Dạ em đã thực hiện lệnh phát hoặc dừng nhạc cho anh rồi ạ!'
}

print(f"Bắt đầu tạo {len(PROMPTS)} file âm thanh chuẩn Hoài My Neural...")

for key, text in PROMPTS.items():
    named_file = os.path.join(CACHE_DIR, f"{key}.mp3")
    text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
    hash_file = os.path.join(CACHE_DIR, f"h_{text_hash}.mp3")
    
    # Nếu file đã tồn tại và hợp lệ (>1000 bytes), bỏ qua
    if os.path.exists(named_file) and os.path.getsize(named_file) > 1000:
        if not os.path.exists(hash_file) or os.path.getsize(hash_file) < 1000:
            import shutil
            shutil.copyfile(named_file, hash_file)
        print(f" [EXISTS] {key}")
        continue
        
    success = False
    for attempt in range(3):
        try:
            # Ghi text ra file tạm UTF-8 rồi dùng flag --file để tránh Windows command-line encoding mangling
            txt_tmp = os.path.join(CACHE_DIR, "_tmp.txt")
            with open(txt_tmp, "w", encoding="utf-8") as tf:
                tf.write(text)
                
            cmd = [sys.executable, '-m', 'edge_tts', '--voice', 'vi-VN-HoaiMyNeural', '--file', txt_tmp, '--write-media', named_file]
            res = subprocess.run(cmd, capture_output=True, timeout=12, creationflags=0x08000000)
            if res.returncode == 0 and os.path.exists(named_file) and os.path.getsize(named_file) > 1000:
                import shutil
                shutil.copyfile(named_file, hash_file)
                print(f" [OK] {key} ({os.path.getsize(named_file)} bytes)", flush=True)
                success = True
                break
            else:
                time.sleep(1)
        except Exception as e:
            time.sleep(1)
            
    if not success:
        print(f" [FAIL] {key}", flush=True)

print("Hoàn tất tạo cache giọng nói!")
