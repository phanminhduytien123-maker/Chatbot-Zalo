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
import { pcBridge } from '../pc/pcBridge.js';
import VoiceNormalizer from '../services/voiceNormalizer.js';

export class MessageHandler {
  /**
   * Xử lý tin nhắn đến (từ người dùng gửi cho Bot)
   * @param {string} rawText 
   * @param {string} [senderThreadId]
   * @returns {Promise<string|object>} Tin nhắn phản hồi hoặc object đính kèm file
   */
  static async handleIncomingMessage(rawText, senderThreadId = null) {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText.trim();
    if (!text.startsWith('/')) {
      text = VoiceNormalizer.normalize(text);
    }
    const lower = text.toLowerCase();

    // 1. Phân loại lệnh tắt nhanh (Slash commands)
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const command = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ').trim();

      switch (command) {
        // --- NHÓM 1: ĐIỀU KHIỂN MÁY TÍNH WINDOWS (PC BRIDGE) ---
        case '/lock': {
          const res = await pcBridge.executeCommand('lock');
          return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể khóa màn hình.');
        }

        case '/unlock':
        case '/mokhoa': {
          const pass = args || '\\';
          const res = await pcBridge.executeCommand('unlock', { password: pass });
          return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể mở khóa.');
        }

        case '/off':
        case '/tatmanhinh': {
          const res = await pcBridge.executeCommand('turnoff_display');
          return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể tắt màn hình.');
        }

        case '/on':
        case '/batmanhinh': {
          const res = await pcBridge.executeCommand('wake_display');
          return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể bật màn hình.');
        }



        case '/screenshot':
        case '/chupmanhinh': {
          const res = await pcBridge.executeCommand('screenshot');
          if (res.success && (res.filePath || res.screenshotBase64)) {
            return {
              text: '📸 Dạ em gửi ảnh chụp màn hình máy tính của anh đây ạ! 🌸',
              attachments: res.filePath ? [res.filePath] : [],
              screenshotBase64: res.screenshotBase64
            };
          }
          return res.message || res.error || '❌ Không thể chụp ảnh màn hình máy tính.';
        }

        case '/pin':
        case '/battery': {
          const res = await pcBridge.executeCommand('battery');
          return res.message || res.error || '❌ Không thể đọc thông tin pin.';
        }

        case '/mayin':
        case '/bambu':
        case '/printer': {
          const res = await pcBridge.executeCommand('bambu_status');
          if (res && res.status) {
            const b = res.status;
            const stateStr = b.gcode_state === 'RUNNING' ? 'Đang in (Printing)' : (b.gcode_state === 'PAUSE' ? 'Tạm dừng (Paused)' : (b.gcode_state === 'PREPARE' ? 'Đang chuẩn bị / Gia nhiệt' : (b.gcode_state === 'IDLE' ? 'Sẵn sàng (Idle)' : b.gcode_state)));
            return `🖨️ [BAMBU LAB A1 MINI]:\n• Trạng thái: ${stateStr}\n• Tệp in: ${b.subtask_name || b.gcode_file || 'Không có'}\n• Tiến độ: ${b.mc_percent}% (Lớp ${b.layer_num}/${b.total_layer_num})\n• Còn lại: ~${b.mc_remaining_time} phút\n• Đầu phun: ${b.nozzle_temper}°C / ${b.nozzle_target_temper}°C\n• Bàn in: ${b.bed_temper}°C / ${b.bed_target_temper}°C\n• Tốc độ: ${b.spd_mag}%\n• Tín hiệu Wi-Fi: ${b.wifi_signal} 🌸`;
          }
          return res.message || res.error || '❌ Chưa kết nối được với máy in Bambu Lab A1 mini.';
        }

        case '/pc': {
          const subCommand = parts[1]?.toLowerCase() || '';
          const subArgs = parts.slice(2).join(' ').trim();

          switch (subCommand) {
            case 'lock':
            case 'khoa': {
              const res = await pcBridge.executeCommand('lock');
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể khóa máy.');
            }

            case 'unlock':
            case 'mokhoa': {
              const pass = subArgs || '\\';
              const res = await pcBridge.executeCommand('unlock', { password: pass });
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể mở khóa.');
            }

            case 'off':
            case 'tatmanhinh': {
              const res = await pcBridge.executeCommand('turnoff_display');
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể tắt màn hình.');
            }

            case 'on':
            case 'batmanhinh': {
              const res = await pcBridge.executeCommand('wake_display');
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể bật màn hình.');
            }



            case 'screen':
            case 'screenshot':
            case 'chup': {
              const res = await pcBridge.executeCommand('screenshot');
              if (res.success && (res.filePath || res.screenshotBase64)) {
                return {
                  text: '📸 Dạ em gửi ảnh chụp màn hình máy tính của anh đây ạ! 🌸',
                  attachments: res.filePath ? [res.filePath] : [],
                  screenshotBase64: res.screenshotBase64
                };
              }
              return res.message || res.error || '❌ Không thể chụp ảnh màn hình máy tính.';
            }

            case 'pin':
            case 'battery': {
              const res = await pcBridge.executeCommand('battery');
              return res.message || res.error || '❌ Không thể đọc thông tin pin.';
            }

            case 'vol':
            case 'volume':
            case 'amluong': {
              const level = parseInt(subArgs, 10) || 50;
              const res = await pcBridge.executeCommand('volume', { level });
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể chỉnh âm lượng.');
            }

            case 'turnoff_display':
            case 'tatmanhinh':
            case 'tatman': {
              const res = await pcBridge.executeCommand('turnoff_display');
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể tắt màn hình.');
            }

            case 'wake_display':
            case 'batmanhinh':
            case 'batman':
            case 'momanhinh':
            case 'moman': {
              const res = await pcBridge.executeCommand('wake_display');
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể bật màn hình.');
            }

            case 'mute': {
              const res = await pcBridge.executeCommand('mute');
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể tắt/bật âm thanh.');
            }

            case 'mirror':
            case 'stream':
            case 'phone': {
              if (subArgs && (subArgs.includes('tat') || subArgs.includes('stop') || subArgs.includes('off'))) {
                const res = await pcBridge.executeCommand('stop_phone_mirror');
                return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể tắt stream.');
              }
              const target = subArgs && subArgs.includes(':') ? subArgs.trim() : '';
              const res = await pcBridge.executeCommand('start_phone_mirror', { target });
              return res.success !== false ? '📱 Dạ em đã truyền trực tiếp màn hình điện thoại lên máy tính cho anh rồi ạ! ✨' : (res.error || res.message || '❌ Không thể stream màn hình điện thoại.');
            }

            case 'open':
            case 'mo': {
              if (!subArgs) return '⚠️ Vui lòng nhập tên ứng dụng hoặc link cần mở (VD: /pc open chrome hoặc /pc open https://tdtu.edu.vn)';
              const res = await pcBridge.executeCommand('open', { target: subArgs });
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể mở ứng dụng.');
            }

            case 'clip':
            case 'copy': {
              if (!subArgs) return '⚠️ Vui lòng nhập nội dung cần copy vào máy tính (VD: /pc clip Xin chao)';
              const res = await pcBridge.executeCommand('clipboard', { text: subArgs });
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể copy.');
            }

            case 'notify':
            case 'thongbao': {
              const notiParts = subArgs.split('|');
              const title = notiParts[0]?.trim() || 'Diana Assistant';
              const msg = notiParts[1]?.trim() || notiParts[0]?.trim() || 'Anh Tiến ơi!';
              const res = await pcBridge.executeCommand('notify', { title, message: msg });
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể hiện thông báo.');
            }

            case 'shutdown':
            case 'tatmay': {
              const minutes = parseInt(subArgs, 10) || 0;
              const res = await pcBridge.executeCommand('shutdown', { minutes });
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể tắt máy.');
            }

            case 'sleep':
            case 'ngu': {
              const res = await pcBridge.executeCommand('sleep');
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể cho máy ngủ.');
            }

            case 'cancel':
            case 'huy': {
              const res = await pcBridge.executeCommand('cancel_shutdown');
              return res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể hủy tắt máy.');
            }

            case 'status': {
              const online = pcBridge.isPCOnline();
              return `🖥️ TRẠNG THÁI KẾT NỐI MÁY TÍNH:\n• Máy tính: ${pcBridge.pcInfo.name}\n• Trạng thái: ${online ? '🟢 ĐANG ONLINE (Sẵn sàng nhận lệnh)' : '🔴 OFFLINE (Chưa chạy script pcAgent trên máy)'}\n${!online ? '👉 Anh hãy mở máy tính và chạy file `Chay_PC_Agent.bat` hoặc lệnh `node pcAgent.js` nhé!' : '👉 Anh có thể ra lệnh: /pc lock, /pc screen, /pc vol 50, /pc open chrome...'}`;
            }

            default:
              return `🖥️ CÁC LỆNH ĐIỀU KHIỂN MÁY TÍNH WINDOWS (/pc):\n` +
                `• /pc status - Kiểm tra máy tính có đang kết nối online không\n` +
                `• /pc lock - Khóa màn hình máy tính (Win + L)\n` +
                `• /pc unlock [pass] - Đánh thức và mở khóa máy tính (mặc định pass: /)\n` +
                `• /pc screen - Chụp ảnh màn hình Desktop gửi qua Zalo\n` +
                `• /pc pin - Xem % pin và trạng thái sạc laptop\n` +
                `• /pc vol <0-100> - Chỉnh âm lượng loa máy tính\n` +
                `• /pc mute - Tắt/bật âm thanh loa máy tính\n` +
                `• /pc open <app/link> - Mở ứng dụng (chrome, vscode) hoặc link\n` +
                `• /pc clip <văn bản> - Copy văn bản vào Clipboard máy tính\n` +
                `• /pc notify <tiêu đề> | <nội dung> - Bắn thông báo lên góc màn hình\n` +
                `• /pc shutdown [phút] - Hẹn giờ tắt máy tính\n` +
                `• /pc cancel - Hủy lệnh tắt máy\n` +
                `• /pc sleep - Cho máy tính vào chế độ Ngủ`;

          }
        }

        // --- NHÓM 2: ĐỒNG HỒ & THỜI TIẾT ---
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
            const res = await ExcelService.generateGradesWorkbook();
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
          return await scheduler.formatRemindersList(senderThreadId);
        }

        case '/xoalich':
        case '/delrem': {
          if (!args) {
            return `⚠️ Vui lòng cung cấp mã lịch hoặc tên việc cần xóa (VD: /xoalich rem_123, /xoalich tắm) hoặc /xoalich all\n(Gõ /reminders để xem danh sách mã lịch)`;
          }
          if (args.toLowerCase() === 'all' || args.toLowerCase() === 'tatca' || args.toLowerCase() === 'toanbo') {
            const res = await scheduler.clearAll(senderThreadId);
            return `🗑️ Dạ em Diana đã xóa toàn bộ ${res.removedCount} lịch hẹn giờ trên cả hệ thống và Zalo rồi ạ!`;
          }
          const res = await scheduler.removeMatchingReminders(args, senderThreadId);
          if (res.removedCount > 0) {
            return `✅ Dạ em Diana đã xóa thành công ${res.removedCount} lịch nhắc liên quan đến "${args}" trên cả hệ thống và Zalo rồi ạ!`;
          } else {
            return `⚠️ Không tìm thấy lịch nhắc nào khớp với [${args}]. Anh gõ /reminders để xem danh sách lịch hiện có nhé!`;
          }
        }

        case '/huychamcong':
        case '/xoachamcong':
        case '/bochamcong': {
          await scheduler.removeAttendanceReminders(senderThreadId);
          return `🌸 Dạ em Diana đã tắt và xóa hoàn toàn các lịch tự động nhắc chấm công (8h sáng & 17h30) trên Zalo cho anh Tiến rồi ạ! ✨`;
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
        const res = await ExcelService.generateGradesWorkbook();
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

    // Helper làm sạch hậu tố kính ngữ, từ đệm tiếng Việt
    const cleanCommandSuffix = (raw) => {
      if (!raw || typeof raw !== 'string') return '';
      let str = raw.trim();
      const suffixRegex = /\s+(?:giùm\s+anh|dùm\s+anh|giúp\s+anh|hộ\s+anh|cho\s+anh|với\s+anh|giùm\s+em|dùm\s+em|giúp\s+em|hộ\s+em|cho\s+em|với\s+em|giùm\s+tôi|giúp\s+tôi|hộ\s+tôi|cho\s+tôi|giùm\s+mình|giúp\s+mình|hộ\s+mình|cho\s+mình|cho\s+anh\s+xem|cho\s+anh\s+coi|cho\s+anh\s+nghe|để\s+anh\s+xem|để\s+anh\s+lướt|để\s+anh\s+nghe|giùm|dùm|hộ|giúp|cho|với|đi\s+em|đi\s+anh|đi|lên|xíu|chút|nhanh|lẹ|ngay|liền|xem\s+với|coi\s+với|nghe\s+với|xem|coi|nghe|thử|và\s+gửi\s+cho\s+anh|và\s+gửi\s+anh|gửi\s+cho\s+anh|gửi\s+anh|gửi\s+qua\s+zalo|gửi\s+zalo|gửi\s+em|trên\s+máy\s+tính\s+của\s+anh|trên\s+máy\s+tính|trên\s+pc|trên\s+máy|trên\s+laptop|nhé\s+em|nhé\s+anh|nhé|nhe|nha|ạ|nhá|ha|diana|em)+$/i;
      while (suffixRegex.test(str)) {
        str = str.replace(suffixRegex, '').trim();
      }
      return str;
    };

    // 8. Nhận diện ý định ĐIỀU KHIỂN MÁY TÍNH WINDOWS (NLP PC Commands)
    // 8.00. PHONE MIRROR (Stream & điều khiển màn hình điện thoại lên máy tính)
    if (
      lower.includes('stream màn hình') || lower.includes('stream man hinh') ||
      lower.includes('chiếu màn hình điện thoại') || lower.includes('chieu man hinh dien thoai') ||
      lower.includes('chiếu điện thoại') || lower.includes('chieu dien thoai') ||
      lower.includes('stream điện thoại') || lower.includes('stream dien thoai') ||
      lower.includes('mở màn hình điện thoại') || lower.includes('mo man hinh dien thoai') ||
      lower.includes('điều khiển điện thoại') || lower.includes('dieu khien dien thoai') ||
      lower.includes('phone mirror') || lower.includes('mirror phone') || lower.includes('scrcpy')
    ) {
      if (lower.includes('tắt') || lower.includes('tat') || lower.includes('dừng') || lower.includes('dung') || lower.includes('đóng') || lower.includes('dong')) {
        const res = await pcBridge.executeCommand('stop_phone_mirror');
        const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể dừng stream.');
        aiAssistant.memory.addTurn(text, reply);
        return reply;
      } else {
        const res = await pcBridge.executeCommand('start_phone_mirror', { target: '' });
        const reply = res.success !== false ? 'Dạ em đã mở cửa sổ truyền trực tiếp màn hình điện thoại lên máy tính cho anh rồi ạ! 📱✨🖥️' : (res.error || res.message || '❌ Không thể kết nối truyền màn hình điện thoại.');
        aiAssistant.memory.addTurn(text, reply);
        return reply;
      }
    }

    // 8.0. WAKE DISPLAY (Bật màn hình / Mở màn hình / Đánh thức màn hình)
    if (
      lower.includes('bật màn hình') || lower.includes('bat man hinh') || 
      lower.includes('mở màn hình') || lower.includes('mo man hinh') || 
      lower.includes('sáng màn hình') || lower.includes('sang man hinh') || 
      lower.includes('bật lại màn hình') || lower.includes('bat lai man hinh') || 
      lower.includes('mở lại màn hình') || lower.includes('mo lai man hinh') || 
      lower.includes('đánh thức màn hình') || lower.includes('danh thuc man hinh') || 
      lower.includes('bật display') || lower.includes('bat display') || 
      lower.includes('mở display') || lower.includes('mo display') || 
      lower.includes('bật màn') || lower.includes('bat man') || 
      lower.includes('mở màn') || lower.includes('mo man') ||
      lower.includes('wake display')
    ) {
      const res = await pcBridge.executeCommand('wake_display');
      const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể bật màn hình.');
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.0b. TURNOFF DISPLAY (Tắt màn hình / Làm tối màn hình)
    if (
      (lower.includes('tắt màn hình') || lower.includes('tat man hinh') || 
       lower.includes('làm tối màn hình') || lower.includes('lam toi man hinh') || 
       lower.includes('tối màn hình') || lower.includes('toi man hinh') || 
       lower.includes('tắt màn') || lower.includes('tat man') || 
       lower.includes('tắt display') || lower.includes('tat display') || 
       lower.includes('turnoff display')) &&
      !lower.includes('khóa') && !lower.includes('khoa')
    ) {
      const res = await pcBridge.executeCommand('turnoff_display');
      const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể tắt màn hình.');
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.1. UNLOCK (Mở khóa máy)
    if (
      lower.includes('mở khóa') || lower.includes('mo khoa') || 
      lower.includes('mở máy tính') || lower.includes('mo may tinh') || 
      lower.includes('mở pc') || lower.includes('mo pc') || 
      lower.includes('mở laptop') || lower.includes('mo laptop') || 
      lower.includes('unlock')
    ) {
      let pass = '\\';
      const passMatch = text.match(/(?:pass(?:word)?|mật khẩu|mat khau)(?:\s+là|\s*:)?\s*([^\s]+)/i);
      if (passMatch) {
        pass = passMatch[1].trim();
      }
      const res = await pcBridge.executeCommand('unlock', { password: pass });
      const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể mở khóa máy tính.');
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.2. SLEEP (Cho máy tính ngủ)
    if (
      lower.includes('sleep') || 
      lower.includes('cho máy ngủ') || lower.includes('cho may ngu') || 
      lower.includes('ngủ máy') || lower.includes('ngu may') || 
      lower.includes('vào chế độ ngủ')
    ) {
      const res = await pcBridge.executeCommand('sleep');
      const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể đưa máy vào chế độ Sleep.');
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.3. LOCK (Khóa máy)
    if (
      (lower.includes('lock') || lower.includes('khóa máy') || lower.includes('khoa may') || 
       lower.includes('khóa màn hình') || lower.includes('khoa man hinh') || 
       lower.includes('khóa pc') || lower.includes('khoa pc')) && 
      !lower.includes('xoalich') && !lower.includes('xóa')
    ) {
      const res = await pcBridge.executeCommand('lock');
      const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể khóa màn hình.');
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.4. SCREENSHOT (Chụp ảnh màn hình)
    if (
      lower.includes('chụp ảnh màn hình') || lower.includes('chup anh man hinh') || 
      lower.includes('chụp màn hình') || lower.includes('chup man hinh') || 
      lower.includes('chụp ảnh desktop') || lower.includes('chup anh desktop') || 
      lower.includes('chụp desktop') || lower.includes('chup desktop') || 
      lower.includes('chụp ảnh pc') || lower.includes('chup anh pc') || 
      lower.includes('chụp pc') || lower.includes('chup pc') || 
      lower.includes('chụp ảnh máy') || lower.includes('chup anh may') || 
      lower.includes('screenshot') || lower.includes('chụp màn') || lower.includes('chup man')
    ) {
      const res = await pcBridge.executeCommand('screenshot');
      if (res.success && (res.filePath || res.screenshotBase64)) {
        const replyObj = {
          text: '📸 Dạ em gửi ảnh chụp màn hình máy tính của anh đây ạ! 🌸',
          attachments: res.filePath ? [res.filePath] : [],
          screenshotBase64: res.screenshotBase64
        };
        aiAssistant.memory.addTurn(text, replyObj.text);
        return replyObj;
      }
      const reply = res.message || res.error || '❌ Không thể chụp ảnh màn hình máy tính.';
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.5. BATTERY (Pin)
    if (
      lower.includes('pin laptop') || lower.includes('pin máy') || lower.includes('pin may') || 
      lower.includes('kiểm tra pin') || lower.includes('xem pin') || lower.includes('battery')
    ) {
      const res = await pcBridge.executeCommand('battery');
      const reply = res.message || res.error || '❌ Không thể đọc thông tin pin.';
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.6. CANCEL SHUTDOWN (Hủy tắt máy)
    if (
      lower.includes('hủy tắt máy') || lower.includes('huy tat may') || 
      lower.includes('không tắt máy') || lower.includes('khong tat may') || 
      lower.includes('cancel shutdown')
    ) {
      const res = await pcBridge.executeCommand('cancel_shutdown');
      const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể hủy tắt máy.');
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.7. SHUTDOWN (Tắt máy)
    if (lower.includes('tắt máy') || lower.includes('tat may') || lower.includes('shutdown')) {
      let minutes = 0;
      const minMatch = text.match(/(\d+)\s*(?:phút|p|m)/i);
      if (minMatch) minutes = parseInt(minMatch[1], 10);
      const res = await pcBridge.executeCommand('shutdown', { minutes });
      const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể tắt máy.');
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.8. VOLUME / MUTE (Âm lượng / Tắt tiếng)
    if (lower.includes('tắt tiếng') || lower.includes('tat tieng') || lower.includes('bật tiếng') || lower.includes('bat tieng') || lower.includes('mute')) {
      const res = await pcBridge.executeCommand('mute');
      const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể đổi trạng thái âm thanh.');
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }
    if (lower.includes('âm lượng') || lower.includes('am luong') || lower.includes('volume') || lower.includes('chỉnh loa') || lower.includes('tăng loa') || lower.includes('giảm loa')) {
      const volMatch = text.match(/(\d+)\s*%?/);
      const level = volMatch ? parseInt(volMatch[1], 10) : 50;
      const res = await pcBridge.executeCommand('volume', { level });
      const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || '❌ Không thể chỉnh âm lượng.');
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.9. OPEN APP / WEB (Mở app, mở web linh hoạt không cứng nhắc)
    const openMatch = text.match(/^(?:diana\s+ơi\s*,?\s*|diana\s*,?\s*|em\s+ơi\s*,?\s*|bot\s+ơi\s*,?\s*)?(?:hãy\s+|nhờ\s+em\s+|làm\s+phiền\s+em\s+|phiền\s+em\s+|vui\s+lòng\s+|làm\s+ơn\s+)?(?:mở|bật|open|khởi\s+động|chạy|vào)\s+(?:ứng\s+dụng\s+|app\s+|phần\s+mềm\s+|web\s+|trang\s+web\s+|trang\s+|link\s+)?(.+?)$/i);
    if (openMatch && openMatch[1] && !lower.includes('thời tiết') && !lower.includes('bảng điểm') && !lower.includes('nhắc') && !lower.includes('hẹn')) {
      const target = cleanCommandSuffix(openMatch[1]);
      if (target.length > 0) {
        const res = await pcBridge.executeCommand('open', { target });
        const reply = res.success !== false ? 'Đã hoàn thành' : (res.error || res.message || `❌ Không thể mở "${target}".`);
        aiAssistant.memory.addTurn(text, reply);
        return reply;
      }
    }

    // 8.94. Nhận diện ý định HỦY / XÓA TOÀN BỘ LỊCH NHẮC NHỞ (Tự nhiên 100%)
    const isClearAllReminders = (
      /(?:xóa|hủy|bỏ|tắt|dẹp)\s+(?:hết|toàn\s*bộ|tất\s*cả|mọi)\s*(?:các\s*)?(?:lịch|nhắc\s*nhở|lịch\s*nhắc|hẹn\s*giờ)/i.test(text) ||
      /(?:bỏ|hủy|xóa|tắt|ngưng|dừng)\s+(?:việc\s+)?nhắc\s*nhở\s*(?:luôn|hết|đi|nhé|nha|ạ)?$/i.test(text.trim()) ||
      /(?:bỏ|hủy|xóa|tắt)\s+(?:hết\s+)?lịch\s*nhắc(?:\s+luôn)?/i.test(text) ||
      (lower.includes('bỏ việc nhắc') || lower.includes('bỏ nhắc nhở luôn') || lower.includes('xóa hết nhắc') || lower.includes('tắt hết nhắc'))
    );

    if (isClearAllReminders) {
      const res = await scheduler.clearAll(senderThreadId);
      const reply = `🌸 Dạ em Diana đã tắt và xóa toàn bộ mọi lịch hẹn giờ / nhắc nhở (${res.removedCount} lịch) trên cả hệ thống và Zalo cho anh Tiến rồi ạ! ✨\nTừ nay em sẽ không tự động nhắc gì nữa nhé 🥰.`;
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.95. Nhận diện ý định HỦY / BỎ TỰ ĐỘNG NHẮC CHẤM CÔNG (Tự nhiên 100%)
    const isCancelAttendance = (
      /(?:không|bỏ|hủy|xóa|tắt|đừng|ngưng|dừng)\s+(?:tự\s+động\s+)?(?:nhắc|hẹn|báo|cài)?\s*(?:lịch\s+)?chấm\s*công/i.test(text) ||
      /(?:bỏ|hủy|xóa|tắt)\s+(?:lịch\s+)?chấm\s*công/i.test(text) ||
      (lower.includes('chấm công') && (lower.includes('bỏ nhắc') || lower.includes('hủy nhắc') || lower.includes('không nhắc') || lower.includes('tắt nhắc') || lower.includes('đừng nhắc') || lower.includes('không tự động nhắc') || lower.includes('không cần nhắc') || lower.includes('xóa nhắc') || lower.includes('xóa lịch')))
    );

    if (isCancelAttendance) {
      const res = await scheduler.removeMatchingReminders('chấm công', senderThreadId);
      const reply = `🌸 Dạ em Diana đã tắt và xóa hoàn toàn các lịch tự động nhắc chấm công (cả sáng 8h00 và chiều 17h30) trên Zalo cho anh Tiến rồi ạ! ✨\nLịch thời tiết 7h00 sáng và các lịch khác của anh vẫn được duy trì bình thường. Từ nay em sẽ tuyệt đối không nhắc chấm công nữa nhé! 🥰`;
      aiAssistant.memory.addTurn(text, reply);
      return reply;
    }

    // 8.96. Nhận diện ý định HỦY / XÓA LỊCH NHẮC CỤ THỂ THEO TÊN (VD: "xóa nhắc nhở tắm", "bỏ nhắc họp", "hủy lịch nộp bài"...)
    const cancelReminderMatch = text.match(/(?:xóa|hủy|bỏ|tắt|đừng)\s+(?:lịch\s+nhắc\s+|lịch\s+|nhắc\s+nhở\s+|nhắc\s+|hẹn\s+giờ\s+)(.+)/i);
    if (cancelReminderMatch && cancelReminderMatch[1]) {
      const rawTarget = cancelReminderMatch[1].trim();
      const cleanTarget = rawTarget.replace(/\s*(?:đi|nha|nhé|nghen|nhen|giúp\s*anh|cho\s*anh|luôn|ạ)$/i, '').trim();
      // Loại trừ các lệnh điều khiển máy tính như "tắt máy tính", "đóng app", v.v.
      const isComputerCmd = /^(?:máy|màn\s*hình|loa|âm\s*lượng|cửa\s*sổ|app|ứng\s*dụng)/i.test(cleanTarget);
      if (cleanTarget.length > 0 && !isComputerCmd) {
        const res = await scheduler.removeMatchingReminders(cleanTarget, senderThreadId);
        let reply = '';
        if (res.removedCount > 0) {
          reply = `🌸 Dạ em Diana đã xóa thành công ${res.removedCount} lịch nhắc liên quan đến "${cleanTarget}" trên cả hệ thống và Zalo cho anh Tiến rồi ạ! ✨`;
        } else {
          reply = `🌸 Em đã kiểm tra hệ thống và Zalo, hiện tại không còn lịch nhắc nào khớp với "${cleanTarget}" nữa rồi anh Tiến nhé! 🥰`;
        }
        aiAssistant.memory.addTurn(text, reply);
        return reply;
      }
    }

    // 9. Nhận diện ý định ĐẶT LỊCH HẸN GIỜ (NLP Reminder Extraction)
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

    // 10. Nếu không thuộc các trường hợp trên, chuyển cho Gemini AI Agent xử lý
    return await aiAssistant.processUserMessage(text);
  }
}

export default MessageHandler;
