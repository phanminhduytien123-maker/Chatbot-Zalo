import os from 'os';
import process from 'process';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import config from '../config/config.js';

export class SystemService {
  /**
   * Lấy báo cáo chi tiết về tình trạng tài nguyên Server & Runtime
   */
  static getSystemReport() {
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;
    
    const toMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
    const toGB = (bytes) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

    const memUsage = process.memoryUsage();
    const procRssMB = toMB(memUsage.rss);
    const procHeapUsedMB = toMB(memUsage.heapUsed);
    const procHeapTotalMB = toMB(memUsage.heapTotal);

    const totalMemMB = toMB(totalMemBytes);
    const freeMemMB = toMB(freeMemBytes);
    const usedMemMB = toMB(usedMemBytes);
    const memUsagePercent = ((usedMemBytes / totalMemBytes) * 100).toFixed(1);

    const cpus = os.cpus() || [];
    const cpuModel = cpus[0]?.model || 'Generic CPU';
    const cpuCores = cpus.length;
    const loadAvg = os.loadavg().map(l => l.toFixed(2)).join(', ');

    const formatUptime = (seconds) => {
      const d = Math.floor(seconds / (3600 * 24));
      const h = Math.floor((seconds % (3600 * 24)) / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const parts = [];
      if (d > 0) parts.push(`${d} ngày`);
      if (h > 0) parts.push(`${h} giờ`);
      if (m > 0) parts.push(`${m} phút`);
      parts.push(`${s} giây`);
      return parts.join(' ');
    };

    const botUptime = formatUptime(process.uptime());
    const osUptime = formatUptime(os.uptime());

    const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    let report = `🖥️ BÁO CÁO TÀI NGUYÊN SERVER (${timestamp})\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `🤖 Bot: Diana AI Assistant (v1.0.0)\n`;
    report += `⏱️ Uptime Bot: ${botUptime}\n`;
    report += `🌐 Nền tảng: ${os.type()} ${os.release()} (${os.arch()})\n`;
    report += `📦 Node.js: ${process.version}\n\n`;

    report += `🧠 BỘ NHỚ RAM (MÁY CHỦ):\n`;
    report += `• Đang dùng: ${usedMemMB} MB / ${totalMemMB} MB (${memUsagePercent}%)\n`;
    report += `• Còn trống: ${freeMemMB} MB\n\n`;

    report += `⚡ TIẾN TRÌNH BOT (PROCESS):\n`;
    report += `• RSS: ${procRssMB} MB\n`;
    report += `• Heap Đang Dùng: ${procHeapUsedMB} MB / ${procHeapTotalMB} MB\n\n`;

    report += `⚙️ CPU & VI XỬ LÝ:\n`;
    report += `• Chip: ${cpuModel}\n`;
    report += `• Số nhân (Cores): ${cpuCores} cores\n`;
    report += `• Load Average (1m, 5m, 15m): ${loadAvg}\n`;
    report += `• Uptime Hệ điều hành: ${osUptime}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `✅ Server hoạt động mượt mà và ổn định!`;

    return report;
  }

  /**
   * Dọn dẹp các file rác, file tạm cũ trong thư mục data
   */
  static cleanGarbage() {
    const exportDir = path.resolve(config.paths.dataDir, 'exports');
    const qrDir = path.resolve(config.paths.dataDir, 'qr');
    let deletedCount = 0;
    const now = Date.now();
    const MAX_AGE_MS = 60 * 60 * 1000; // 1 tiếng

    const cleanFolder = (dir) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.resolve(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > MAX_AGE_MS) {
            fs.unlinkSync(fullPath);
            deletedCount++;
          }
        } catch (_) {}
      }
    };

    cleanFolder(exportDir);
    cleanFolder(qrDir);

    // Kích hoạt Garbage Collection nếu có flag --expose-gc
    let gcTriggered = false;
    if (global.gc) {
      try {
        global.gc();
        gcTriggered = true;
      } catch (_) {}
    }

    return `🧹 Đã dọn dẹp hệ thống thành công!\n• Xóa bỏ: ${deletedCount} file tạm cũ\n• Thu hồi bộ nhớ RAM GC: ${gcTriggered ? 'Đã kích hoạt' : 'Tự động quản lý bởi Node.js'}`;
  }

  /**
   * Kiểm tra độ trễ mạng và trạng thái của một Website bất kỳ
   */
  static async pingWebsite(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return '⚠️ Vui lòng cung cấp địa chỉ URL cần kiểm tra (VD: /ping https://stdportal.tdtu.edu.vn)';
    }

    let url = rawUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    try {
      const startTime = Date.now();
      const res = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true, // Không throw lỗi cho các mã 4xx/5xx
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Diana-Health-Check'
        }
      });
      const latency = Date.now() - startTime;

      const isOk = res.status >= 200 && res.status < 400;
      const statusIcon = isOk ? '🟢' : '🔴';

      return `🌐 KẾT QUẢ KIỂM TRA WEBSITE:\n` +
        `• Địa chỉ: ${url}\n` +
        `• Trạng thái: ${statusIcon} HTTP ${res.status} (${res.statusText || 'OK'})\n` +
        `• Thời gian phản hồi: ⚡ ${latency} ms\n` +
        `• Đánh giá: ${latency < 500 ? 'Rất nhanh và ổn định' : latency < 1500 ? 'Bình thường' : 'Hơi chậm'}`;
    } catch (err) {
      return `🔴 KHÔNG THỂ KẾT NỐI TỚI WEBSITE:\n• Địa chỉ: ${url}\n• Lỗi: ${err.message}`;
    }
  }
}

export default SystemService;
