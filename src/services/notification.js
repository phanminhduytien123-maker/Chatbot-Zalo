/**
 * Trình định dạng tin nhắn Zalo đẹp mắt và chuyên nghiệp
 */

export class NotificationFormatter {
  static getFormattedTimestamp() {
    const now = new Date();
    const time = now.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
    const date = now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    return `${time} | ${date}`;
  }

  /**
   * Báo cáo tình trạng tổng quan (Chuẩn định dạng như trong ảnh của bạn)
   */
  static formatStatusReport(cookieStatus, grades, checkIntervalMinutes = 480) {
    const timestamp = this.getFormattedTimestamp();
    const hasScoresCount = grades.filter(g => g.status === 'Đã có điểm').length;
    const totalCount = grades.length;
    
    let summaryText = '🎓 Chưa có điểm môn nào.';
    if (hasScoresCount === totalCount && totalCount > 0) {
      summaryText = `🎉 Đã có đủ điểm ${hasScoresCount}/${totalCount} môn!`;
    } else if (hasScoresCount > 0) {
      summaryText = `⚡ Đã có điểm ${hasScoresCount}/${totalCount} môn.`;
    }

    const intervalDisplay = checkIntervalMinutes >= 60 
      ? `${checkIntervalMinutes / 60} tiếng` 
      : `${checkIntervalMinutes} phút`;

    let message = `📊 BÁO CÁO TÌNH TRẠNG (${timestamp})\n\n`;
    message += `✅ Trạng thái Cookie: ${cookieStatus.valid ? 'CÒN HẠN (Hoạt động tốt)' : '⚠️ HẾT HẠN (Cần cập nhật)'}\n`;
    message += `⚙ Trạng thái Code: Đang quét ngầm mỗi ${intervalDisplay}\n`;
    message += `📝 Tình trạng điểm: ${summaryText}\n\n`;
    message += `Chi tiết môn học:\n`;

    grades.forEach(g => {
      let scoreDetail = 'Chưa có điểm';
      if (g.totalScore !== null) {
        scoreDetail = `Tổng: ${g.totalScore} (${g.gradeLetter || 'Đạt'})`;
      } else if (g.processScore !== null) {
        scoreDetail = `Quá trình: ${g.processScore} (Chờ CK)`;
      }
      message += `🎓 [${g.code}] ${g.name}: ${scoreDetail}\n`;
    });

    return message.trim();
  }

  /**
   * Danh sách chi tiết bảng điểm
   */
  static formatGradesList(grades) {
    const timestamp = this.getFormattedTimestamp();
    let msg = `🎓 BẢNG ĐIỂM CHI TIẾT (${timestamp})\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    grades.forEach((g, index) => {
      msg += `${index + 1}. [${g.code}] ${g.name} (${g.credits} TC)\n`;
      msg += `   • Điểm quá trình: ${g.processScore !== null ? g.processScore : 'Chưa có'}\n`;
      msg += `   • Điểm thi giữa kỳ: ${g.midtermScore !== null ? g.midtermScore : 'Chưa có'}\n`;
      msg += `   • Điểm thi cuối kỳ: ${g.finalScore !== null ? g.finalScore : 'Chưa có'}\n`;
      msg += `   • Tổng kết: ${g.totalScore !== null ? `👉 ${g.totalScore} [Điểm chữ: ${g.gradeLetter || ''}]` : 'Chưa tổng kết'}\n`;
      msg += `   • Trạng thái: ${g.status === 'Đã có điểm' ? '✅ Đã có điểm' : '⏳ ' + g.status}\n\n`;
    });

    return msg.trim();
  }

  /**
   * Danh sách thông báo mới
   */
  static formatAnnouncements(news) {
    const timestamp = this.getFormattedTimestamp();
    let msg = `📢 THÔNG BÁO TỪ TRƯỜNG / KHOA (${timestamp})\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (!news || news.length === 0) {
      return msg + 'Hiện tại không có thông báo mới nào.';
    }

    news.slice(0, 5).forEach((item, idx) => {
      const tag = item.isImportant ? '🔴 [QUAN TRỌNG]' : '📌';
      msg += `${idx + 1}. ${tag} ${item.title}\n`;
      msg += `   🏛 Đơn vị: ${item.department} | 📅 Ngày: ${item.publishedDate}\n`;
      msg += `   📝 Tóm tắt: ${item.summary}\n`;
      if (item.url) msg += `   🔗 Link: ${item.url}\n`;
      msg += `\n`;
    });

    return msg.trim();
  }

  /**
   * Trạng thái đơn từ
   */
  static formatApplications(apps) {
    const timestamp = this.getFormattedTimestamp();
    let msg = `📑 THEO DÕI ĐƠN TỪ TRỰC TUYẾN (${timestamp})\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (!apps || apps.length === 0) {
      return msg + 'Bạn chưa gửi đơn từ nào gần đây.';
    }

    apps.forEach((app, idx) => {
      let icon = '⏳';
      if (app.status.includes('Đã duyệt') || app.status.includes('Hoàn thành')) icon = '✅';
      if (app.status.includes('Từ chối') || app.status.includes('Không duyệt')) icon = '❌';

      msg += `${idx + 1}. ${icon} [${app.id}] ${app.type}\n`;
      msg += `   • Trạng thái: ${app.status.toUpperCase()}\n`;
      msg += `   • Ngày nộp: ${app.submitDate}\n`;
      if (app.note) msg += `   • Ghi chú: ${app.note}\n`;
      msg += `\n`;
    });

    return msg.trim();
  }

  /**
   * Danh sách hoạt động ngoại khóa
   */
  static formatActivities(activities) {
    let msg = `🏃 HOẠT ĐỘNG NGOẠI KHÓA & RÈN LUYỆN\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (!activities || activities.length === 0) {
      return msg + 'Chưa có hoạt động mới nào mở đăng ký.';
    }

    activities.forEach((act, idx) => {
      msg += `${idx + 1}. 🌟 ${act.name}\n`;
      msg += `   • Điểm rèn luyện: +${act.points} ĐRL\n`;
      msg += `   • Nhóm: ${act.category}\n`;
      msg += `   • Hạn chót: ⏰ ${act.regDeadline}\n`;
      msg += `   • Tình trạng: ${act.status}\n\n`;
    });

    return msg.trim();
  }

  /**
   * Cảnh báo biến động thời gian thực (Push Alert)
   */
  static formatAlert(diff) {
    let msg = `🚨 BÁO ĐỘNG BIẾN ĐỘNG TỪ CỔNG TRƯỜNG!\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (diff.gradeUpdates.length > 0) {
      msg += `🎉 PHÁT HIỆN CẬP NHẬT ĐIỂM MỚI (${diff.gradeUpdates.length} môn):\n`;
      diff.gradeUpdates.slice(0, 10).forEach(item => {
        msg += `👉 Môn [${item.subject.code}] ${item.subject.name}: `;
        if (item.subject.totalScore !== null) {
          msg += `Điểm TK: ${item.subject.totalScore} (${item.subject.gradeLetter || ''})\n`;
        } else {
          msg += `Trạng thái: ${item.subject.status}\n`;
        }
      });
      if (diff.gradeUpdates.length > 10) {
        msg += `... và ${diff.gradeUpdates.length - 10} môn khác (Gõ /diem để xem chi tiết).\n`;
      }
      msg += `\n`;
    }

    if (diff.applicationUpdates.length > 0) {
      msg += `📑 CẬP NHẬT TIẾN ĐỘ ĐƠN TỪ:\n`;
      diff.applicationUpdates.slice(0, 5).forEach(item => {
        msg += `👉 Đơn "${item.application.type}" vừa chuyển sang: 【${item.application.status.toUpperCase()}】\n`;
      });
      msg += `\n`;
    }

    if (diff.newAnnouncements.length > 0) {
      msg += `📢 CÓ THÔNG BÁO MỚI TỪ TRƯỜNG (${diff.newAnnouncements.length} tin):\n`;
      diff.newAnnouncements.slice(0, 5).forEach(item => {
        msg += `👉 ${item.title} (${item.department})\n`;
      });
      if (diff.newAnnouncements.length > 5) {
        msg += `... và ${diff.newAnnouncements.length - 5} tin khác (Gõ /tintuc để xem tất cả).\n`;
      }
      msg += `\n`;
    }

    msg += `⏰ Thời gian phát hiện: ${this.getFormattedTimestamp()}`;
    return msg;
  }

  /**
   * Menu trợ giúp
   */
  static formatHelpMenu() {
    return `🤖 DIANA - AI AGENT TRỢ LÝ TOÀN NĂNG CỦA ANH TIẾN:\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Dạ em chào anh Tiến! Dưới đây là các nhóm lệnh và tính năng thực thi em có thể làm cho anh:\n\n` +
      `🎓 [HỌC TẬP & EXCEL]:\n` +
      `• /excel - Xuất file Excel Bảng điểm toàn khóa (3 Sheet: Điểm, GPA, Học phí)\n` +
      `• /check - Báo cáo tổng quan tình trạng điểm & hệ thống\n` +
      `• /diem - Xem bảng điểm chi tiết các môn\n` +
      `• /don - Theo dõi tiến độ duyệt đơn từ trực tuyến\n` +
      `• /tintuc - Xem các thông báo mới nhất từ trường\n` +
      `• /hoatdong - Xem hoạt động ngoại khóa & điểm rèn luyện\n\n` +
      `💻 [QUẢN TRỊ SERVER & DEVOPS]:\n` +
      `• /server - Báo cáo tài nguyên máy chủ (RAM, CPU, Uptime, Node.js)\n` +
      `• /clean - Dọn dẹp file tạm và giải phóng bộ nhớ\n` +
      `• /ping <url> - Đo độ trễ kết nối (ms) tới trang web bất kỳ\n\n` +
      `🔍 [TIỆN ÍCH & ĐA PHƯƠNG TIỆN]:\n` +
      `• /search <từ khóa> - Tìm kiếm Web Google / Wikipedia Realtime\n` +
      `• /qr <nội dung/link> - Tạo ảnh mã QR Code gửi qua Zalo\n` +
      `• /vietqr <bank> <stk> [tiền] [noidung] - Tạo mã VietQR thanh toán nhanh\n` +
      `• /thoitiet - Dự báo thời tiết TP.HCM & khung giờ mưa hôm nay\n` +
      `• /time - Xem đồng hồ thời gian thực chính xác từng giây\n\n` +
      `⏰ [HẸN GIỜ & NHẮC VIỆC]:\n` +
      `• /reminders - Xem danh sách lịch hẹn đang bật\n` +
      `• /xoalich <Mã> - Hủy lịch hẹn giờ (hoặc /xoalich all)\n` +
      `• Chat tự nhiên: "6h tối nay nhắc anh làm đồ án", "mỗi ngày nhắc anh chấm công lúc 8h sáng và 5h30 chiều"\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌸 Anh có thể gõ lệnh hoặc chat tự nhiên như người thật với em nhé! ✨`;
  }
}

export default NotificationFormatter;
