/**
 * VIETNAMESE VOICE NORMALIZER & PHONETIC CORRECTION SERVICE
 * Chuẩn hóa các từ mượn, lỗi phát âm, từ đồng âm khi chuyển giọng nói thành văn bản
 */

export class VoiceNormalizer {
  /**
   * Danh sách quy tắc thay thế ngữ âm / lỗi phiên âm STT phổ biến
   */
  static PHONETIC_MAP = [
    // 1. Tên Bot & Xưng hô
    { pattern: /\b(?:đai\s*a\s*na|đi\s*a\s*na|đa\s*na|đai\s*na|di\s*a\s*na|dia\s*na|điana)\b/gi, replacement: 'Diana' },
    { pattern: /\b(?:anh\s+tiếng|anh\s+tiến|sếp\s+tiến)\b/gi, replacement: 'anh Tiến' },

    // 2. Ứng dụng & Dịch vụ phổ biến
    { pattern: /\b(?:du\s*túp|du\s*tuýp|diu\s*túp|du\s*túp\s*be|yutube|yu\s*túp|dút\s*túp)\b/gi, replacement: 'youtube' },
    { pattern: /\b(?:phây\s*búc|phây|phây\s*s\s*búc|phe\s*búc|face\s*book)\b/gi, replacement: 'facebook' },
    { pattern: /\b(?:gia\s*lo|da\s*lo|za\s*nô|za\s*lo)\b/gi, replacement: 'zalo' },
    { pattern: /\b(?:cờ\s*rôm|ch\s*rome|gúc\s*gồ\s*ch\s*rome|crôm)\b/gi, replacement: 'chrome' },
    { pattern: /\b(?:v\s*s\s*cốt|v\s*ét\s*cốt|vi\s*ét\s*cốt|vsc\s*code|vi\s*ét\s*cốt)\b/gi, replacement: 'vscode' },
    { pattern: /\b(?:gúc\s*gồ|gúc\s*gồ|gu\s*gồ|gồ)\b/gi, replacement: 'google' },
    { pattern: /\b(?:s\s*po\s*ti\s*phai|xì\s*po\s*ti\s*phai|xì\s*po|spo\s*ti\s*fy)\b/gi, replacement: 'spotify' },
    { pattern: /\b(?:an\s*ti\s*gra\s*vi\s*ti|an\s*ti\s*gờ\s*ra\s*vi\s*ti|antigravity\s*ide)\b/gi, replacement: 'antigravity' },
    { pattern: /\b(?:quép|vép|wép|trang\s*quép)\b/gi, replacement: 'web' },

    // 3. Lệnh Điều Khiển Máy Tính (Windows)
    { pattern: /\b(?:màng\s*hình)\b/gi, replacement: 'màn hình' },
    { pattern: /\b(?:chụp\s+(?:lại\s+)?(?:màng|màn)\s*hình)\b/gi, replacement: 'chụp màn hình' },
    { pattern: /\b(?:chụp\s+đét\s*tóp|chụp\s+đéc\s*tóp|chụp\s+màn\s+ảnh)\b/gi, replacement: 'chụp màn hình' },
    { pattern: /\b(?:khoá\s*máy|khoá\s*màn\s*hình|khóa\s*màng\s*hình|lốc\s*máy|lốc\s*màn\s*hình|lóc\s*máy)\b/gi, replacement: 'khóa màn hình' },
    { pattern: /\b(?:mở\s*khoá|mở\s*máy|ăn\s*lốc|an\s*lốc)\b/gi, replacement: 'mở khóa' },
    { pattern: /\b(?:sút\s*đao|sắt\s*đao|sất\s*đao)\b/gi, replacement: 'tắt máy' },
    { pattern: /\b(?:sờ\s*líp|sì\s*líp|xì\s*líp)\b/gi, replacement: 'cho máy ngủ' },
    { pattern: /\b(?:bật\s*sáng\s*màn\s*hình|đánh\s*thức\s*màn\s*hình)\b/gi, replacement: 'bật màn hình' },
    { pattern: /\b(?:tối\s*màn\s*hình)\b/gi, replacement: 'tắt màn hình' },
    { pattern: /\b(?:chỉnh\s*loa|tăng\s*loa|giảm\s*loa|vo\s*lum|vô\s*lum|vo\s*lùm)\b/gi, replacement: 'âm lượng' },
    { pattern: /\b(?:tắt\s*loa|câm\s*loa|miu\s*tơ|miút)\b/gi, replacement: 'tắt tiếng' },
    { pattern: /\b(?:bát\s*tơ\s*ri|bét\s*tơ\s*ri)\b/gi, replacement: 'pin' },

    // 4. Thuật ngữ Học tập & Cổng TDTU
    { pattern: /\b(?:gê\s*pê\s*a|vê\s*pê\s*a|g\s*p\s*a|rê\s*pê\s*a)\b/gi, replacement: 'GPA' },
    { pattern: /\b(?:đê\s*rờ\s*lờ|điểm\s*rèn\s*luyện|d\s*r\s*l|đrl)\b/gi, replacement: 'điểm rèn luyện' },
    { pattern: /\b(?:tê\s*ca\s*bê|t\s*k\s*b|thời\s*khoá\s*biểu)\b/gi, replacement: 'thời khóa biểu' },
    { pattern: /\b(?:t\s*c\s*t\s*l|tín\s*chỉ\s*tích\s*luỹ|tín\s*chỉ\s*tích\s*lũy)\b/gi, replacement: 'tín chỉ tích lũy' },
    { pattern: /\b(?:hột\s*phí|hộc\s*phí|tiền\s*hột)\b/gi, replacement: 'học phí' },
    { pattern: /\b(?:bản\s*điểm|bản\s*điểm\s*học\s*tập)\b/gi, replacement: 'bảng điểm' },
    { pattern: /\b(?:t\s*d\s*t\s*u|tôn\s*đức\s*thắng|trường\s*tôn\s*đức\s*thắng)\b/gi, replacement: 'TDTU' },

    // 5. Từ cảm thán / đệm ngắt quãng do STT ghi nhận
    { pattern: /^(?:ừm|à|ờ|ơi|nè|này|ê|alo|a\s*lô)\s*,?\s*/gi, replacement: '' },
    { pattern: /\s+(?:nè|nha|nhé|nhá|ạ|nhe|ha)\s*[.?!]*$/gi, replacement: '' }
  ];

  /**
   * Chuẩn hóa văn bản thu được từ nhận diện giọng nói
   * @param {string} text 
   * @returns {string} Văn bản đã được chuẩn hóa ngữ âm và cú pháp
   */
  static normalize(text) {
    if (!text || typeof text !== 'string') return '';
    
    let normalized = text.trim();

    // 1. Loại bỏ các dấu ngoặc kép hoặc ký tự bao bọc thừa do AI sinh ra
    normalized = normalized.replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim();

    // 2. Chuyển đổi các dạng ngữ âm thông dụng
    for (const rule of this.PHONETIC_MAP) {
      normalized = normalized.replace(rule.pattern, rule.replacement);
    }

    // 3. Khử trùng lặp từ ngữ nếu xuất hiện
    normalized = normalized.replace(/\b(máy tính)\s+\1\b/gi, 'máy tính');
    normalized = normalized.replace(/\b(màn hình)\s+\1\b/gi, 'màn hình');

    // 4. Chuẩn hóa khoảng trắng và dấu câu
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // 5. Nếu câu kết thúc bằng dấu chấm đơn độc lập thì bỏ bớt nếu ngắn gọn
    if (normalized.endsWith('.') && normalized.length < 50 && !normalized.includes('. ')) {
      normalized = normalized.slice(0, -1).trim();
    }

    return normalized;
  }
}

export default VoiceNormalizer;
