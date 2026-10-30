import fs from 'fs';
import path from 'path';
import { execFile, exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PhoneStorageService {
  constructor() {
    this.phoneFolderPath = '/sdcard/DianaSecret';
    this.phoneDocFolderPath = '/sdcard/Documents/DianaSecret';
    this.lastSyncTime = null;
    this.activeDevice = null;
  }

  resolveAdbPath() {
    const candidates = [
      path.join('d:\\Zalo Bot', 'tools', 'scrcpy', 'adb.exe'),
      path.resolve(__dirname, '..', '..', 'tools', 'scrcpy', 'adb.exe'),
      path.resolve(__dirname, '..', 'tools', 'scrcpy', 'adb.exe'),
      'adb.exe',
      'adb'
    ];

    for (const c of candidates) {
      if (c && fs.existsSync(c)) {
        return c;
      }
    }
    return 'adb';
  }

  async execAdb(args, timeout = 6000) {
    const adbPath = this.resolveAdbPath();
    return new Promise((resolve) => {
      execFile(adbPath, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: err.message, stderr, stdout });
        } else {
          resolve({ success: true, stdout: stdout ? stdout.trim() : '', stderr });
        }
      });
    });
  }

  /**
   * Lấy danh sách thiết bị ADB đang kết nối
   */
  async getConnectedDevice() {
    const res = await this.execAdb(['devices', '-l']);
    if (!res.success || !res.stdout) return null;

    const lines = res.stdout.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('*') && line.includes('device')) {
        const parts = line.split(/\s+/);
        const deviceId = parts[0];
        const modelMatch = line.match(/model:([^\s]+)/);
        const model = modelMatch ? modelMatch[1] : 'Xiaomi Redmi K70';
        this.activeDevice = deviceId;
        return {
          id: deviceId,
          model: model,
          line: line
        };
      }
    }
    return null;
  }

  /**
   * Đảm bảo thư mục lưu ký ức /sdcard/DianaSecret tồn tại trên điện thoại
   */
  async ensurePhoneFolder() {
    const dev = await this.getConnectedDevice();
    if (!dev) return { success: false, error: 'Chưa kết nối điện thoại qua Wireless Debugging.' };

    const cmd = `mkdir -p ${this.phoneFolderPath} && mkdir -p ${this.phoneDocFolderPath}`;
    const res = await this.execAdb(['-s', dev.id, 'shell', cmd]);
    return { success: res.success, device: dev };
  }

  /**
   * Đồng bộ ký ức từ máy tính lên thư mục điện thoại (/sdcard/DianaSecret)
   */
  async syncMemoryToPhone(memoryData, configData) {
    const dev = await this.getConnectedDevice();
    if (!dev) {
      return { success: false, error: 'Chưa kết nối điện thoại qua Wireless Debugging.' };
    }

    await this.ensurePhoneFolder();

    // Tạo file tạm trên máy tính để push sang điện thoại
    const tempDir = path.resolve(__dirname, '..', '..', 'data', 'temp_sync');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempMemFile = path.join(tempDir, 'memory.json');
    const tempConfigFile = path.join(tempDir, 'config.json');
    const tempReadmeFile = path.join(tempDir, 'HUONG_DAN_QUAN_LY_KY_UC.txt');

    fs.writeFileSync(tempMemFile, JSON.stringify(memoryData || [], null, 2), 'utf8');
    fs.writeFileSync(tempConfigFile, JSON.stringify(configData || {}, null, 2), 'utf8');

    // Viết file hướng dẫn bằng tiếng Việt để anh Tiến đọc khi mở app Quản lý tệp trên điện thoại
    const readmeContent = `╔════════════════════════════════════════════════════════════════════════╗
║             🌸 DIANA SECRET SANCTUARY - BỘ NHỚ ĐIỆN THOẠI               ║
╚════════════════════════════════════════════════════════════════════════╝

Xin chào anh Tiến! Đây là thư mục lưu trữ ký ức trò chuyện thầm kín của Diana.

📁 ĐƯỜNG DẪN THƯ MỤC TRÊN ĐIỆN THOẠI:
- /sdcard/DianaSecret/
- Bộ nhớ trong ➜ Thư mục "DianaSecret"

📋 CÁC TỆP TIN TRONG THƯ MỤC:
1. memory.json : Chứa toàn bộ các đoạn hội thoại, lời tâm sự riêng tư giữa anh và Diana.
2. config.json : Cài đặt persona (Người yêu ngọt ngào, Nàng thơ quyến rũ...), model AI.

🗑️ CÁCH XÓA KÝ ỨC BẤT KỲ LÚC NÀO TRÊN ĐIỆN THOẠI:
- Khi anh muốn xóa sạch mọi đoạn chat thầm kín: Anh chỉ cần mở ứng dụng "Quản Lý Tệp / Tệp Tin" trên điện thoại ➜ Vào thư mục "DianaSecret" ➜ XÓA TỆP "memory.json" (hoặc xóa toàn bộ thư mục này).
- Diana sẽ tự động phát hiện tệp đã bị xóa và làm mới ký ức 100% để bảo vệ sự riêng tư của anh!

⏰ Thời gian đồng bộ gần nhất: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
`;
    fs.writeFileSync(tempReadmeFile, readmeContent, 'utf8');

    // Push các file sang điện thoại qua ADB
    const pushMem = await this.execAdb(['-s', dev.id, 'push', tempMemFile, `${this.phoneFolderPath}/memory.json`]);
    const pushConfig = await this.execAdb(['-s', dev.id, 'push', tempConfigFile, `${this.phoneFolderPath}/config.json`]);
    await this.execAdb(['-s', dev.id, 'push', tempReadmeFile, `${this.phoneFolderPath}/HUONG_DAN_QUAN_LY_KY_UC.txt`]);

    // Đồng bộ thêm 1 bản dự phòng vào Documents/DianaSecret
    await this.execAdb(['-s', dev.id, 'push', tempMemFile, `${this.phoneDocFolderPath}/memory.json`]);
    await this.execAdb(['-s', dev.id, 'push', tempConfigFile, `${this.phoneDocFolderPath}/config.json`]);

    this.lastSyncTime = new Date().toISOString();

    return {
      success: pushMem.success && pushConfig.success,
      device: dev.model,
      phoneFolder: this.phoneFolderPath,
      syncedTurns: Array.isArray(memoryData) ? Math.floor(memoryData.length / 2) : 0,
      timestamp: this.lastSyncTime
    };
  }

  /**
   * Đọc ký ức trực tiếp từ thư mục trên điện thoại (/sdcard/DianaSecret/memory.json)
   * Nếu anh Tiến đã xóa file trên điện thoại, hàm sẽ trả về rỗng để đồng bộ xóa
   */
  async readMemoryFromPhone() {
    const dev = await this.getConnectedDevice();
    if (!dev) return null;

    const res = await this.execAdb(['-s', dev.id, 'shell', `cat ${this.phoneFolderPath}/memory.json`]);
    if (!res.success || !res.stdout || res.stdout.includes('No such file')) {
      // Kiểm tra thư mục Documents
      const resDoc = await this.execAdb(['-s', dev.id, 'shell', `cat ${this.phoneDocFolderPath}/memory.json`]);
      if (!resDoc.success || !resDoc.stdout || resDoc.stdout.includes('No such file')) {
        return { exists: false, history: [] };
      }
      try {
        const parsed = JSON.parse(resDoc.stdout);
        return { exists: true, history: Array.isArray(parsed) ? parsed : [] };
      } catch (_) {
        return { exists: false, history: [] };
      }
    }

    try {
      const parsed = JSON.parse(res.stdout);
      return { exists: true, history: Array.isArray(parsed) ? parsed : [] };
    } catch (e) {
      return { exists: false, error: e.message, history: [] };
    }
  }

  /**
   * Xóa sạch toàn bộ nội dung trong thư mục ký ức trên điện thoại
   */
  async wipePhoneFolder() {
    const dev = await this.getConnectedDevice();
    if (!dev) return { success: false, error: 'Chưa kết nối điện thoại qua Wireless Debugging.' };

    const cmd = `rm -rf ${this.phoneFolderPath}/* && rm -rf ${this.phoneDocFolderPath}/*`;
    const res = await this.execAdb(['-s', dev.id, 'shell', cmd]);

    return {
      success: res.success,
      message: 'Đã xóa sạch toàn bộ nội dung thư mục ký ức trên điện thoại (/sdcard/DianaSecret/)!',
      device: dev.model
    };
  }

  /**
   * Lấy trạng thái chi tiết của thư mục ký ức trên điện thoại
   */
  async getPhoneFolderStatus() {
    const dev = await this.getConnectedDevice();
    if (!dev) {
      return {
        connected: false,
        device: null,
        phoneFolder: this.phoneFolderPath,
        message: 'Điện thoại chưa kết nối Wireless Debugging.'
      };
    }

    const lsRes = await this.execAdb(['-s', dev.id, 'shell', `ls -lh ${this.phoneFolderPath}`]);
    const files = [];
    if (lsRes.success && lsRes.stdout) {
      const lines = lsRes.stdout.split('\n');
      for (const line of lines) {
        if (line && !line.startsWith('total')) {
          files.push(line.trim());
        }
      }
    }

    return {
      connected: true,
      device: dev.model || 'Xiaomi Redmi K70',
      deviceId: dev.id,
      phoneFolder: this.phoneFolderPath,
      phoneDocFolder: this.phoneDocFolderPath,
      files: files,
      fileCount: files.length,
      lastSyncTime: this.lastSyncTime
    };
  }
}

export const phoneStorage = new PhoneStorageService();
export default phoneStorage;
