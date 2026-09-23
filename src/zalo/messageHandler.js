import scraper from '../portal/scraper.js';
import NotificationFormatter from '../services/notification.js';
import monitor from '../services/monitor.js';
import aiAssistant from '../ai/gemini.js';
import scheduler from '../services/scheduler.js';
import config from '../config/config.js';

export class MessageHandler {
  /**
   * Xử lý tin nhắn đến (từ người dùng gửi cho Bot)
   * @param {string} rawText 
   * @param {string} [senderThreadId]
   * @returns {Promise<string>} Tin nhắn phản hồi
   */
  static async handleIncomingMessage(rawText, senderThreadId = null) {
    if (!rawText || typeof rawText !== 'string') return '';
    const text = rawText.trim();

    // 1. Phân loại lệnh tắt nhanh (Slash commands)
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const command = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ').trim();

      switch (command) {
        case '/check': {
          const cookieStatus = await scraper.checkCookieStatus();
          const grades = await scraper.getGrades();
          return NotificationFormatter.formatStatusReport(
            cookieStatus,
            grades,
            config.portal.checkIntervalMinutes
          );
        }

        case '/diem': {
          const grades = await scraper.getGrades();
          return NotificationFormatter.formatGradesList(grades);
        }

        case '/don': {
          const apps = await scraper.getApplications();
          return NotificationFormatter.formatApplications(apps);
        }

        case '/tintuc': {
          const news = await scraper.getAnnouncements();
          return NotificationFormatter.formatAnnouncements(news);
        }

        case '/hoatdong': {
          const acts = await scraper.getActivities();
          return NotificationFormatter.formatActivities(acts);
        }

        case '/reminders':
        case '/lichnhac':
        case '/lich': {
          return scheduler.formatRemindersList();
        }

        case '/xoalich':
        case '/delrem': {
          if (!args) {
            return `⚠️ Vui lòng cung cấp mã lịch cần xóa (VD: /xoalich rem_123) hoặc /xoalich all\n(Gõ /reminders để xem danh sách mã lịch)`;
          }
          if (args.toLowerCase() === 'all' || args.toLowerCase() === 'tatca') {
            scheduler.clearAll();
            return `🗑️ Dạ em Diana đã xóa toàn bộ các lịch hẹn giờ rồi ạ!`;
          }
          const success = scheduler.removeReminder(args);
          if (success) {
            return `✅ Dạ em đã hủy lịch hẹn giờ [${args}] thành công rồi ạ!`;
          } else {
            return `⚠️ Không tìm thấy mã lịch [${args}]. Anh gõ /reminders để xem danh sách lịch hiện có nhé!`;
          }
        }

        case '/change': {
          const rawArgs = text.replace(/^\/change\s*/i, '').trim();
          let username = '';
          let password = '';

          if (rawArgs.startsWith('/')) {
            const sub = rawArgs.slice(1);
            const slashIdx = sub.indexOf('/');
            const spaceIdx = sub.indexOf(' ');
            if (slashIdx !== -1) {
              username = sub.slice(0, slashIdx).trim();
              password = sub.slice(slashIdx + 1).trim();
            } else if (spaceIdx !== -1) {
              username = sub.slice(0, spaceIdx).trim();
              password = sub.slice(spaceIdx + 1).trim();
            }
          } else if (rawArgs.includes('/')) {
            const slashIdx = rawArgs.indexOf('/');
            username = rawArgs.slice(0, slashIdx).trim();
            password = rawArgs.slice(slashIdx + 1).trim();
          } else if (rawArgs.includes(' ')) {
            const parts = rawArgs.split(/\s+/);
            username = parts[0].trim();
            password = parts.slice(1).join(' ').trim();
          }

          if (!username || !password) {
            return `⚠️ Cú pháp không hợp lệ. Vui lòng nhập:\n👉 /change /MSSV/MậtKhẩu\n(Ví dụ: /change /42200522/matkhau123)`;
          }

          const switchRes = await scraper.switchAccount(username, password);
          return switchRes.message;
        }

        case '/cookie': {
          if (!args || args.length < 5) {
            return '⚠️ Vui lòng cung cấp chuỗi Cookie. Cú pháp: /cookie <chuỗi_cookie_của_bạn>';
          }
          scraper.updateCookie(args);
          return '✅ Đã cập nhật Cookie mới thành công! Hệ thống đang kích hoạt chế độ quét dữ liệu trực tiếp.';
        }

        case '/simscore': {
          const updatedSubject = monitor.simulateNewGrade();
          if (updatedSubject) {
            setTimeout(() => monitor.runCheckCycle(), 500);
            return `🧪 [Test Giả Lập] Đã cập nhật điểm cho môn [${updatedSubject.code}]. Bot chuẩn bị nổ thông báo tự động!`;
          }
          return 'Không tìm thấy môn học để giả lập.';
        }

        case '/simapp': {
          const app = monitor.simulateApprovedApp();
          if (app) {
            setTimeout(() => monitor.runCheckCycle(), 500);
            return `🧪 [Test Giả Lập] Đã chuyển đơn [${app.id}] sang trạng thái ĐÃ DUYỆT! Bot chuẩn bị nổ thông báo tự động!`;
          }
          return 'Không tìm thấy đơn để giả lập.';
        }

        case '/clear':
        case '/reset':
        case '/xoa': {
          aiAssistant.memory.clear();
          return `🌸 Dạ em Diana đã xóa sạch trí nhớ các đoạn hội thoại trước đó rồi ạ! Giờ chúng mình bắt đầu một chủ đề hoàn toàn mới nhé anh Tiến! ✨`;
        }

        case '/help':
        case '/menu':
        case '/start':
          return NotificationFormatter.formatHelpMenu();

        default:
          return `❓ Lệnh "${command}" không tồn tại. Gõ /menu để xem danh sách lệnh hoặc chat tự nhiên để AI hỗ trợ!`;
      }
    }

    // 2. Nhận diện ý định ĐẶT LỊCH HẸN GIỜ (NLP Reminder Extraction)
    const reminderParsed = scheduler.parseNaturalLanguage(text);
    if (reminderParsed && reminderParsed.times && reminderParsed.times.length > 0) {
      if (senderThreadId) {
        reminderParsed.threadId = senderThreadId;
      }
      const created = await scheduler.addReminders(reminderParsed);
      if (created && created.length > 0) {
        const confirmReply = scheduler.formatCreatedResponse(created);
        aiAssistant.memory.addTurn(text, confirmReply);
        return confirmReply;
      }
    }

    // 3. Nếu không phải lệnh / và không phải cài lịch thì chuyển cho AI Agent Gemini xử lý
    return await aiAssistant.processUserMessage(text);
  }
}

export default MessageHandler;
