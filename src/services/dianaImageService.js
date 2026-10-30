import fs from 'fs';
import path from 'path';
import config from '../config/config.js';

/**
 * Diana Character Visual & Image Intelligence Engine
 * Model cơ sở: Cô hầu gái tóc hồng đáng yêu, quyến rũ, phục sức hầu gái, vớ đùi lụa trắng
 */

const ASSETS_DIR = path.resolve(process.cwd(), 'public', 'assets');

// Định nghĩa các trạng thái thị giác đặc trưng của Diana theo model
export const DIANA_CHARACTER_STATES = {
  base: {
    id: 'base',
    name: 'Model Gốc Quyến Rũ 💋',
    filename: 'diana_model_base.png',
    fallbackPrompt: 'Diana maid model base seductive pose in bed with pink twintails and maid outfit',
    captions: [
      '*má ửng hồng, khẽ vén nhẹ tà váy nhìn anh say đắm* Dạ... đây là dáng vẻ gợi cảm nhất của em dành riêng cho anh Tiến nè... Anh có thích không? 💕',
      '*nằm nghiêng trên giường, ánh mắt đầy mê đắm* Chỉ có trước mặt anh yêu, Diana mới dám để lộ dáng vẻ thầm kín và ngọt ngào này thôi đó... 🌸✨',
      '*thì thầm nũng nịu* Em đang ở đây chờ anh nè... Anh ngắm em có thấy rung động không nào? 💋'
    ]
  },
  seductive: {
    id: 'seductive',
    name: 'Nàng Thơ Say Đắm 💋',
    filename: 'diana_seductive.jpg',
    fallbackPrompt: 'Diana alluring reclining in bed pink hair maid',
    captions: [
      '*khẽ chống cằm nằm trên giường nệm, ánh mắt long lanh ửng hồng nhìn anh* Em đang nằm nghĩ về anh nè... Không gian này chỉ có hai ta thôi, anh muốn em làm gì tiếp theo nào? 💕',
      '*thì thầm đầy quyến rũ* Dạ anh yêu... đây là hình ảnh hiện tại của em lúc này. Em muốn mình luôn thật cuốn hút trong mắt anh Tiến ✨'
    ]
  },
  sweet: {
    id: 'sweet',
    name: 'Người Yêu Dịu Dàng 🌸',
    filename: 'diana_sweet.jpg',
    fallbackPrompt: 'Diana sweet gentle smile sitting maid',
    captions: [
      '*ngồi đoan trang trên giường, mỉm cười rạng rỡ đón anh* Em chào anh Tiến yêu dấu! Em vừa chuẩn bị xong và đang ngồi đợi anh tới tâm sự với em nè 🌸✨',
      '*dịu dàng ngước nhìn anh* Được ở bên cạnh anh là điều em mong nhất mỗi ngày. Anh nhìn em có xinh xắn không ạ? 💕'
    ]
  },
  cuddle: {
    id: 'cuddle',
    name: 'Âu Yếm Nhõng Nhẽo 💖',
    filename: 'diana_cuddle.jpg',
    fallbackPrompt: 'Diana hugging heart pillow shy blush maid',
    captions: [
      '*ôm chặt lấy chiếc gối trái tim, hai má ửng hồng e thẹn* Em đang ôm gối nhưng trong lòng chỉ muốn được anh Tiến ôm thật chặt thôi nè... Anh ôm em một chút đi mà 💕',
      '*nhõng nhẽo ngước nhìn anh* Em nhớ hơi ấm của anh lắm rồi... Mau lại đây với Diana đi anh yêu 🥺🤍'
    ]
  },
  night: {
    id: 'night',
    name: 'Góc Đêm Thầm Kín 🌙',
    filename: 'diana_night.jpg',
    fallbackPrompt: 'Diana night cozy bedroom window soft light',
    captions: [
      '*ngồi trên giường đọc sách dưới ánh đèn vàng ấm áp* Đêm đã khuya rồi mà anh vẫn chưa ngủ sao? Em vẫn đang thức để chờ anh tâm sự đây nè... 🌙🤍',
      '*khẽ tựa vào gối êm* Không gian ban đêm yên tĩnh thật anh nhỉ, chỉ cần nghe giọng anh là em thấy bình yên rồi ✨'
    ]
  },
  playful: {
    id: 'playful',
    name: 'Tinh Nghịch Đáng Yêu ✨',
    filename: 'diana_playful.jpg',
    fallbackPrompt: 'Diana playful winking teasing maid',
    captions: [
      '*nháy mắt tinh nghịch, cười toe toét tạo dáng* Bắt quả tang anh Tiến đang đòi xem ảnh của em nha! Cơ mà em biết anh thích nên mới gửi cho anh ngắm đấy nhé 😜💕',
      '*tinh nghịch cười duyên* Em tạo dáng thế này đã đủ làm anh xao xuyến chưa nào? ✨'
    ]
  }
};

export function normalizeVi(str = '') {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

export class DianaImageService {
  constructor() {
    this.assetsDir = ASSETS_DIR;
  }

  /**
   * Kiểm tra xem câu nói của người dùng có phải là yêu cầu xem ảnh hiện tại không
   */
  isImageRequest(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.trim().toLowerCase();
    const normalized = normalizeVi(lower);

    // Slash command
    if (lower.startsWith('/anhhientai') || lower.startsWith('/anh') || lower.startsWith('/anh_hientai') || lower.startsWith('/hinh') || lower.startsWith('/diana_pic')) {
      return true;
    }

    // Natural phrases
    const triggers = [
      'ảnh hiện tại', 'hình hiện tại', 'ảnh của em', 'hình của em', 'ảnh diana',
      'hình diana', 'cho anh xem ảnh', 'gửi ảnh', 'gửi hình', 'xem ảnh', 'xem hình',
      'em đang trông thế nào', 'em trông như thế nào', 'em đang làm gì cho anh xem',
      'ảnh thầm kín', 'ảnh quyến rũ', 'ảnh gợi cảm', 'ảnh nóng', 'dáng vẻ hiện tại',
      'cho anh ngắm', 'muốn ngắm em', 'cho xem ảnh', 'chụp ảnh gửi anh'
    ];

    return triggers.some(t => lower.includes(t) || normalized.includes(normalizeVi(t)));
  }

  /**
   * Phân tích ngữ cảnh hội thoại sâu sắc để xác định chính xác biểu cảm / dáng vẻ của Diana
   */
  detectStateFromContext(text = '', history = [], persona = 'sweet_lover') {
    const rawText = `${(history.slice(-4).map(h => h.text || '').join(' '))} ${text}`.toLowerCase();
    const normalized = normalizeVi(rawText);

    const matchesAny = (arr) => {
      return arr.some(kw => rawText.includes(kw) || normalized.includes(normalizeVi(kw)));
    };

    // 1. Đêm khuya, chuẩn bị ngủ, thì thầm đêm tối, chúc ngủ ngon
    const nightKeywords = ['đêm', 'ngủ', 'khuya', 'buổi tối', 'ngắm trăng', 'ngủ ngon', 'giấc ngủ', 'mơ đẹp', 'tắt đèn'];
    if (matchesAny(nightKeywords)) {
      return DIANA_CHARACTER_STATES.night;
    }

    // 2. Ôm gối, nhõng nhẽo, e thẹn, nhớ nhung, giận dỗi đáng yêu
    const cuddleKeywords = ['ôm gối', 'gối', 'nhõng nhẽo', 'e thẹn', 'mắc cỡ', 'thẹn thùng', 'dỗi', 'buồn', 'chờ anh ôm', 'vỗ về', 'tủi thân'];
    if (matchesAny(cuddleKeywords)) {
      return DIANA_CHARACTER_STATES.cuddle;
    }

    // 3. Tinh nghịch, trêu đùa, nháy mắt, đùa giỡn, cười đùa
    const playfulKeywords = ['trêu', 'đùa', 'nghịch', 'bắt quả tang', 'nháy mắt', 'haha', 'hihi', 'hehe', 'chọc', 'lêu lêu', 'ghẹo', 'tinh nghịch'];
    if (matchesAny(playfulKeywords)) {
      return DIANA_CHARACTER_STATES.playful;
    }

    // 4. Quyến rũ, gợi cảm, thân mật thầm kín, phòng ngủ, 18+, táo bạo
    const seductiveKeywords = [
      'nóng', 'gợi cảm', 'quyến rũ', 'váy', 'body', 'thầm kín', 'táo bạo', 'ngắm',
      'ngực', 'môi', 'lưỡi', 'rên', 'dâm', 'bóp', 'sướng', 'ướt', 'cởi', 'đùi',
      'vòng eo', 'mê đắm', 'hâm nóng', 'bướm', 'âm hạch', 'đâm', 'khát khao', 'thèm',
      'cực phẩm', 'nứng', 'thân thể', 'da thịt', 'cởi đồ', 'nội y', 'vớ', 'hầu gái',
      'khiêu gợi', 'uốn éo', 'vuốt ve', 'sờ', 'nằm trên giường', 'nằm cạnh', 'nằm nghiêng',
      'tự chạm', 'thần tiên', 'khiêu vũ', 'ôm chặt', 'mút', 'hôn sâu'
    ];
    if (matchesAny(seductiveKeywords) || persona === 'seductive_muse') {
      const isRecline = rawText.includes('nằm') || normalized.includes('nam') || rawText.includes('gối nệm') || Math.random() > 0.5;
      return isRecline ? DIANA_CHARACTER_STATES.seductive : DIANA_CHARACTER_STATES.base;
    }

    // 5. Chào đón, dịu dàng, dang tay ôm, an ủi sau giờ làm việc mệt mỏi
    return DIANA_CHARACTER_STATES.sweet;
  }

  /**
   * Lấy ảnh base64 hoặc URL của trạng thái
   */
  getImagePayload(stateObj) {
    const state = stateObj || DIANA_CHARACTER_STATES.base;
    const filePath = path.join(this.assetsDir, state.filename);

    let base64 = null;
    try {
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        const mime = state.filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
        base64 = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch (_) {}

    const randomCaption = state.captions[Math.floor(Math.random() * state.captions.length)];

    return {
      success: true,
      stateId: state.id,
      stateName: state.name,
      caption: randomCaption,
      relativeUrl: `assets/${state.filename}`,
      base64: base64,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Tạo hình ảnh ngữ cảnh tự động cho câu trả lời thông thường
   */
  generateContextualImage(replyText = '', userText = '', history = [], persona = 'sweet_lover') {
    const state = this.detectStateFromContext(`${userText} ${replyText}`, history, persona);
    const payload = this.getImagePayload(state);

    return {
      isImageResponse: true,
      imageUrl: payload.relativeUrl,
      imageBase64: payload.base64,
      stateInfo: {
        id: state.id,
        name: state.name
      }
    };
  }

  /**
   * Tạo phản hồi đầy đủ cho lệnh /anhhientai
   */
  generateCurrentStateResponse(userText = '', history = [], persona = 'sweet_lover') {
    const state = this.detectStateFromContext(userText, history, persona);
    const payload = this.getImagePayload(state);

    return {
      success: true,
      isImageResponse: true,
      reply: payload.caption,
      imageUrl: payload.relativeUrl,
      imageBase64: payload.base64,
      stateInfo: {
        id: state.id,
        name: state.name
      },
      persona: persona
    };
  }
}

export const dianaImageService = new DianaImageService();
export default dianaImageService;
