import scraper from '../portal/scraper.js';
import NotificationFormatter from '../services/notification.js';
import monitor from '../services/monitor.js';
import aiAssistant from '../ai/gemini.js';
import scheduler from '../services/scheduler.js';
import config from '../config/config.js';
import weatherService from '../services/weather.js';
import TimeService from '../services/timeService.js';
import ExcelService from '../services/excelService.js';
import SystemService from '../services/systemService.js';
import QRService from '../services/qrService.js';
import SearchService from '../services/searchService.js';

export class MessageHandler {
  /**
   * Xử lý tin nhắn đến (từ người dùng gửi cho Bot)
   * @param {string} rawText 
   * @param {string} [senderThreadId]
   * @returns {Promise<string|object>} Tin nhắn phản hồi hoặc object đính kèm file
   */
  static async handleIncomingMessage(rawText, senderThreadId = null) {
    if (!rawText || typeof rawText !== 'string') return '';
    const text = rawText.trim();
    const lower = text.toLowerCase();

    // 1. Phân loại lệnh tắt nhanh (Slash commands)
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const command = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ').trim();

      switch (command) {
        // --- NHÓM 1: ĐỒNG HỒ & THỜI TIẾT ---
        case '/time':
        case '/gio':
        case '/ngay':
        case '/clock':
        case '/dongho': {
          return TimeService.generateCurrentTimeReply();
        }

        case '/thoitiet':
        case '/weather':
        case '/mua': {
          return await weatherService.generateMorningBriefing();
        }

        // --- NHÓM 2: TÁC VỤ HỌC TẬP & EXCEL XUẤT FILE ---
        case '/excel':
        case '/xuatdiem':
        case '/export':
        case '/bangdiemfile': {
          try {
            const res = ExcelService.generateGradesWorkbook();
            const msg = `📊 Dạ em Diana đã tạo xong file Excel Bảng điểm cho anh Tiến rồi ạ! 🌸\n` +
              `• Tổng số môn: ${res.totalGrades} môn học\n` +
              `• GPA Tích lũy: ${res.overallGPA} / 10 (${res.totalCredits} TC)\n` +
              `• File gồm 3 Sheet: Bảng Điểm Chi Tiết, Tổng Kết GPA/ĐRL, Học Phí & Đơn Từ.\n` +
              `📁 Em đang gửi file đính kèm trực tiếp cho anh nhé! ✨`;
            return {
              text: msg,
              attachments: [res.filePath]
            };
          } catch (err) {
            return `❌ Lỗi khi tạo file Excel: ${err.message}`;
          }
        }

        // --- NHÓM 3: QUẢN TRỊ SERVER & HỆ THỐNG ---
        case '/server':
        case '/ram':
        case '/cpu':
        case '/system':
        case '/hethong': {
          return SystemService.getSystemReport();
        }

        case '/clean':
        case '/donrac':
        case '/gc': {
          return SystemService.cleanGarbage();
        }

        case '/ping':
        case '/checkweb': {
          if (!args) {
            return `⚠️ Vui lòng cung cấp link cần kiểm tra (VD: /ping stdportal.tdtu.edu.vn)`;
          }
          return await SystemService.pingWebsite(args);
        }

        // --- NHÓM 4: TÌM KIẾM WEB REALTIME & QR CODE ---
        case '/search':
        case '/timkiem':
        case '/google': {
          if (!args) {
            return `⚠️ Vui lòng nhập từ khóa cần tìm kiếm (VD: /search Đại học Tôn Đức Thắng)`;
          }
          const results = await SearchService.searchWeb(args, 4);
          return SearchService.formatSearchResults(args, results);
        }

        case '/qr':
        case '/qrcode': {
          if (!args) {
            return `⚠️ Vui lòng nhập nội dung hoặc link cần tạo mã QR (VD: /qr https://tdtu.edu.vn)`;
          }
          try {
            const qrRes = await QRService.generateQRCodeImage(args);
            return {
              text: `🔲 Dạ em Diana đã tạo xong mã QR Code cho nội dung: "${args}" rồi ạ! 🌸`,
              attachments: [qrRes.filePath]
            };
          } catch (err) {
            return `❌ Lỗi khi tạo mã QR: ${err.message}`;
          }
        }

        case '/vietqr': {
          // Cú pháp: /vietqr <MãBank> <STK> [SốTiền] [NộiDung]
          const qrParts = args.split(/\s+/);
          if (qrParts.length < 2) {
            return `⚠️ Cú pháp: /vietqr <MãNgânHàng> <SốTàiKhoản> [SốTiền] [NộiDung]\n(VD: /vietqr MB 0847839234 50000 TienAnTrua)`;
          }
          const bank = qrParts[0];
          const acc = qrParts[1];
          const amt = qrParts[2] ? parseInt(qrParts[2], 10) : 0;
          const desc = qrParts.slice(3).join(' ') || '';
          const vietQrUrl = QRService.generateVietQRUrl(bank, acc, amt, desc);
          return `💳 LINK MÃ VIETQR THANH TOÁN:\n• Ngân hàng: ${bank.toUpperCase()}\n• STK: ${acc}\n${amt > 0 ? `• Số tiền: ${amt.toLocaleString('vi-VN')} VNĐ\n` : ''}${desc ? `• Nội dung: ${desc}\n` : ''}🔗 Link QR: ${vietQrUrl}`;
        }

        // --- NHÓM 5: CỔNG THÔNG TIN TDTU ---
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
            return `🧪 [Test Giập Lập] Đã chuyển đơn [${app.id}] sang trạng thái ĐÃ DUYỆT! Bot chuẩn bị nổ thông báo tự động!`;
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

    // 2. Nhận diện câu hỏi THỜI GIAN THỜI THỰC (Real-time Clock Query)
    if (TimeService.isTimeQuery(text)) {
      const timeReply = TimeService.generateCurrentTimeReply();
      aiAssistant.memory.addTurn(text, timeReply);
      return timeReply;
    }

    // 3. Nhận diện ý định XUẤT FILE EXCEL BẢNG ĐIỂM
    if (
      lower.includes('xuất excel') || 
      lower.includes('xuat excel') || 
      lower.includes('file excel') || 
      lower.includes('gửi file điểm') || 
      lower.includes('gui file diem') ||
      lower.includes('bảng điểm excel') ||
      lower.includes('tải bảng điểm')
    ) {
      try {
        const res = ExcelService.generateGradesWorkbook();
        const msg = `📊 Dạ em Diana đã tạo xong file Excel Bảng điểm cho anh Tiến rồi ạ! 🌸\n` +
          `• Tổng số môn: ${res.totalGrades} môn học\n` +
          `• GPA Tích lũy: ${res.overallGPA} / 10 (${res.totalCredits} TC)\n` +
          `📁 Em đang gửi file đính kèm trực tiếp cho anh nhé! ✨`;
        aiAssistant.memory.addTurn(text, msg);
        return {
          text: msg,
          attachments: [res.filePath]
        };
      } catch (err) {
        return `❌ Lỗi khi tạo file Excel: ${err.message}`;
      }
    }

    // 4. Nhận diện ý định KIỂM TRA TÀI NGUYÊN SERVER
    if (
      lower.includes('tài nguyên server') || 
      lower.includes('kiểm tra server') || 
      lower.includes('tình trạng server') || 
      lower.includes('ram bot') || 
      lower.includes('cpu bot') ||
      lower.includes('thông số server')
    ) {
      const sysRep = SystemService.getSystemReport();
      aiAssistant.memory.addTurn(text, sysRep);
      return sysRep;
    }

    // 5. Nhận diện ý định DỌN DẸP HỆ THỐNG / BỘ NHỚ
    if (lower.includes('dọn dẹp server') || lower.includes('dọn rác') || lower.includes('giải phóng ram')) {
      const cleanRep = SystemService.cleanGarbage();
      aiAssistant.memory.addTurn(text, cleanRep);
      return cleanRep;
    }

    // 6. Nhận diện ý định TẠO MÃ QR CODE
    if ((lower.startsWith('tạo mã qr') || lower.startsWith('tạo qr') || lower.startsWith('tao qr')) && text.length > 8) {
      const contentToEncode = text.replace(/^(tạo mã qr|tạo qr|tao qr|mã qr cho)\s*(cho\s*)?/i, '').trim();
      if (contentToEncode) {
        try {
          const qrRes = await QRService.generateQRCodeImage(contentToEncode);
          const msg = `🔲 Dạ em Diana đã tạo xong mã QR Code cho nội dung: "${contentToEncode}" rồi ạ! 🌸`;
          aiAssistant.memory.addTurn(text, msg);
          return {
            text: msg,
            attachments: [qrRes.filePath]
          };
        } catch (err) {
          return `❌ Lỗi khi tạo mã QR: ${err.message}`;
        }
      }
    }

    // 7. Nhận diện ý định TÌM KIẾM WEB REALTIME TRỰC TIẾP
    if (lower.startsWith('tìm kiếm ') || lower.startsWith('tra cứu ') || lower.startsWith('search ')) {
      const query = text.replace(/^(tìm kiếm|tra cứu|search)\s*(trên web\s*|google\s*)?/i, '').trim();
      if (query.length > 2) {
        const results = await SearchService.searchWeb(query, 4);
        const searchFormatted = SearchService.formatSearchResults(query, results);
        aiAssistant.memory.addTurn(text, searchFormatted);
        return searchFormatted;
      }
    }

    // 8. Nhận diện ý định ĐẶT LỊCH HẸN GIỜ (NLP Reminder Extraction)
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

    // 9. Nếu không thuộc các trường hợp trên, chuyển cho Gemini AI Agent xử lý
    return await aiAssistant.processUserMessage(text);
  }
}

export default MessageHandler;
