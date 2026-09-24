/**
 * Dịch vụ cung cấp thông tin thời gian thời thực chuẩn xác (Múi giờ Asia/Ho_Chi_Minh GMT+7)
 */

export class TimeService {
  /**
   * Lấy thông tin thời gian thực chi tiết tại Việt Nam
   */
  static getRealtimeVN(date = new Date()) {
    const timeZone = 'Asia/Ho_Chi_Minh';

    const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const shortTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const weekdayFormatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone,
      weekday: 'long'
    });

    const timeStr = timeFormatter.format(date);
    const shortTimeStr = shortTimeFormatter.format(date);
    const dateStr = dateFormatter.format(date);
    let weekdayStr = weekdayFormatter.format(date);
    // Viết hoa chữ cái đầu (vd: "thứ năm" -> "Thứ Năm")
    weekdayStr = weekdayStr.charAt(0).toUpperCase() + weekdayStr.slice(1);

    // Lấy giờ số để phân loại buổi
    const hour = parseInt(timeStr.split(':')[0], 10);
    let session = 'sáng';
    if (hour >= 11 && hour < 14) session = 'trưa';
    else if (hour >= 14 && hour < 18) session = 'chiều';
    else if (hour >= 18 && hour < 22) session = 'tối';
    else if (hour >= 22 || hour < 5) session = 'đêm';

    return {
      date,
      timeStr,
      shortTimeStr,
      dateStr,
      weekday: weekdayStr,
      session,
      fullStr: `${weekdayStr}, ngày ${dateStr}, lúc ${timeStr} (GMT+7)`
    };
  }

  /**
   * Kiểm tra câu hỏi có phải đang hỏi về giờ/ngày thực tế không
   */
  static isTimeQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();

    // Loại trừ các trường hợp hỏi hẹn giờ / thời tiết có dính chữ "giờ"
    if (
      lower.includes('nhắc') || 
      lower.includes('hẹn') || 
      lower.includes('mưa') || 
      lower.includes('báo thức') ||
      lower.includes('bao lâu') ||
      lower.includes('lịch thi') ||
      lower.includes('tkb') ||
      lower.includes('thời khóa biểu')
    ) {
      return false;
    }

    const patterns = [
      /mấy\s+giờ/i,
      /may\s+gio/i,
      /bây\s+giờ\s+là\s+mấy\s+giờ/i,
      /bay\s+gio\s+la\s+may\s+gio/i,
      /mấy\s+giờ\s+rồi/i,
      /may\s+gio\s+roi/i,
      /hôm\s+nay\s+(là\s+)?ngày\s+mấy/i,
      /hom\s+nay\s+(la\s+)?ngay\s+may/i,
      /hôm\s+nay\s+(là\s+)?ngày\s+bao\s+nhiêu/i,
      /hom\s+nay\s+(la\s+)?ngay\s+bao\s+nhieu/i,
      /hôm\s+nay\s+(là\s+)?thứ\s+mấy/i,
      /hom\s+nay\s+(la\s+)?thu\s+may/i,
      /ngày\s+mấy\s+rồi/i,
      /thời\s+gian\s+hiện\s+tại/i,
      /thoi\s+gian\s+hien\s+tai/i,
      /xem\s+giờ/i,
      /xem\s+gio/i,
      /đồng\s+hồ/i,
      /dong\s+ho/i,
      /bây\s+giờ\s+là\s+thứ\s+mấy/i,
      /^giờ$/i,
      /^gio$/i,
      /^ngày$/i,
      /^ngay$/i
    ];

    return patterns.some(p => p.test(lower));
  }

  /**
   * Trả về câu trả lời chuẩn xác và lịch sự
   */
  static generateCurrentTimeReply() {
    const info = this.getRealtimeVN();
    return `⏰ Dạ bây giờ là **${info.timeStr}** - **${info.weekday}, ngày ${info.dateStr}** (Buổi ${info.session}, Giờ Việt Nam GMT+7) ạ! 🌸✨`;
  }
}

export default TimeService;
