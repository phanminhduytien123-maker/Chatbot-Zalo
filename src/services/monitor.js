import cron from 'node-cron';
import chalk from 'chalk';
import config from '../config/config.js';
import scraper from '../portal/scraper.js';
import storage from './storage.js';
import NotificationFormatter from './notification.js';

export class BackgroundMonitor {
  constructor(zaloSenderCallback = null) {
    this.zaloSenderCallback = zaloSenderCallback;
    this.intervalMinutes = config.portal.checkIntervalMinutes;
    this.isRunning = false;
    this.task = null;
  }

  setSender(callback) {
    this.zaloSenderCallback = callback;
  }

  /**
   * Khởi động tiến trình quét ngầm định kỳ
   */
  start() {
    if (this.isRunning) return;

    const intervalText = this.intervalMinutes >= 60 
      ? `${this.intervalMinutes / 60} tiếng` 
      : `${this.intervalMinutes} phút`;

    console.log(chalk.cyan(`[Monitor] 🕒 Đang khởi động trình quét ngầm: mỗi ${intervalText}/lần...`));
    this.isRunning = true;

    // Chạy kiểm tra ngay lần đầu
    this.runCheckCycle();

    // Lên lịch cron định kỳ (Hỗ trợ cả phút và tiếng)
    let cronExpression = `*/${this.intervalMinutes} * * * *`;
    if (this.intervalMinutes % 60 === 0) {
      const hours = this.intervalMinutes / 60;
      cronExpression = `0 */${hours} * * *`;
    }

    this.task = cron.schedule(cronExpression, async () => {
      await this.runCheckCycle();
    });
  }

  stop() {
    if (this.task) {
      this.task.stop();
    }
    this.isRunning = false;
    console.log(chalk.yellow('[Monitor] ⏹ Đã tạm dừng trình quét ngầm.'));
  }

  /**
   * Thực hiện 1 chu kỳ quét và so sánh
   */
  async runCheckCycle() {
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.gray(`[Monitor ${timestamp}] 🔍 Đang quét dữ liệu từ Cổng sinh viên...`));

    try {
      const currentState = storage.getState();
      const freshSnapshot = await scraper.fetchFullSnapshot();

      // So sánh dữ liệu cũ và mới
      const diffResult = storage.detectDiff(currentState, freshSnapshot);

      if (diffResult.hasChanges) {
        console.log(chalk.green.bold(`[Monitor] 🚨 Phát hiện biến động dữ liệu mới!`));
        const alertMessage = NotificationFormatter.formatAlert(diffResult.changes);

        // Lưu state mới
        storage.saveState({
          ...currentState,
          ...freshSnapshot
        });

        // Bắn tin nhắn thông báo về Zalo
        if (this.zaloSenderCallback) {
          await this.zaloSenderCallback(alertMessage);
        } else {
          console.log(chalk.yellow('[Monitor] Tin nhắn cảnh báo:'), '\n' + alertMessage);
        }
      } else {
        console.log(chalk.gray(`[Monitor ${timestamp}] ✅ Không có biến động mới.`));
      }
    } catch (err) {
      console.error(chalk.red(`[Monitor] Lỗi trong chu kỳ quét:`), err.message);
    }
  }

  /**
   * Giả lập cập nhật điểm môn học mới để kiểm thử chuông báo động
   */
  simulateNewGrade() {
    const state = storage.getState();
    const targetSubject = state.grades.find(g => g.code === '404CM7');

    if (targetSubject) {
      targetSubject.processScore = 9.0;
      targetSubject.midtermScore = 8.5;
      targetSubject.finalScore = 9.0;
      targetSubject.totalScore = 8.9;
      targetSubject.gradeLetter = 'A';
      targetSubject.status = 'Đã có điểm';
      targetSubject.updatedAt = new Date().toISOString();

      storage.saveState(state);
      return targetSubject;
    }
    return null;
  }

  /**
   * Giả lập đơn từ được duyệt
   */
  simulateApprovedApp() {
    const state = storage.getState();
    const app = state.applications.find(a => a.id === 'REQ-10294');
    if (app) {
      app.status = 'Đã duyệt';
      app.note = 'Đã ký và đóng dấu. Vui lòng nhận tại bàn số 02 - Phòng Đào Tạo.';
      storage.saveState(state);
      return app;
    }
    return null;
  }
}

export const monitor = new BackgroundMonitor();
export default monitor;
