import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/config.js';
import scraper from '../portal/scraper.js';
import storage from '../services/storage.js';
import memory from '../services/memory.js';
import weatherService from '../services/weather.js';
import TimeService from '../services/timeService.js';
import SearchService from '../services/searchService.js';
import SystemService from '../services/systemService.js';

// Danh sách các model AI ưu tiên theo tốc độ và dung lượng quota
const BACKUP_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.6-flash'
];

export class GeminiAssistant {
  constructor() {
    this.apiKey = config.ai.apiKey;
    this.modelName = config.ai.model || 'gemini-flash-lite-latest';
    this.hasApiKey = config.ai.hasApiKey;
    this.genAI = this.hasApiKey ? new GoogleGenerativeAI(this.apiKey) : null;
    this.memory = memory;
  }

  updateApiKey(key) {
    this.apiKey = key;
    config.ai.apiKey = key;
    config.ai.hasApiKey = Boolean(key && key.trim().length > 10);
    this.hasApiKey = config.ai.hasApiKey;
    if (this.hasApiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    }
  }

  /**
   * Lọc và chuẩn bị bảng điểm toàn khóa thông minh dựa trên câu hỏi
   */
  filterRelevantGrades(allGrades, userText) {
    if (!Array.isArray(allGrades)) return [];
    if (!userText) return allGrades;
    const text = userText.toLowerCase();

    // 1. Nếu hỏi học kỳ cụ thể (ví dụ: "kỳ 1 2024", "kỳ 2 2023", "kỳ hè 2025")
    const matchedBySemester = allGrades.filter(g => {
      const sem = (g.semester || g.nameTable || '').toLowerCase();
      if (!sem) return false;
      if (text.includes('kỳ 1') || text.includes('học kỳ 1') || text.includes('hk1')) {
        if (text.includes('2025') && sem.includes('2025-2026') && sem.includes('1')) return true;
        if (text.includes('2024') && sem.includes('2024-2025') && sem.includes('1')) return true;
        if (text.includes('2023') && sem.includes('2023-2024') && sem.includes('1')) return true;
        if (text.includes('2022') && sem.includes('2022-2023') && sem.includes('1')) return true;
      }
      if (text.includes('kỳ 2') || text.includes('học kỳ 2') || text.includes('hk2')) {
        if (text.includes('2025') && sem.includes('2025-2026') && sem.includes('2')) return true;
        if (text.includes('2024') && sem.includes('2024-2025') && sem.includes('2')) return true;
        if (text.includes('2023') && sem.includes('2023-2024') && sem.includes('2')) return true;
        if (text.includes('2022') && sem.includes('2022-2023') && sem.includes('2')) return true;
      }
      return false;
    });

    if (matchedBySemester.length > 0) {
      return matchedBySemester;
    }

    // 2. Nếu hỏi môn học cụ thể (tìm kiếm theo tên môn trên toàn khóa)
    const matchedBySubject = allGrades.filter(g => {
      const name = (g.name || '').toLowerCase();
      const code = (g.code || '').toLowerCase();
      const words = text.split(/\s+/).filter(w => w.length > 2);
      return words.some(w => (name && name.includes(w)) || (code && code.includes(w)));
    });

    if (matchedBySubject.length > 0) {
      return matchedBySubject;
    }

    // 3. Mặc định gửi toàn bộ bảng điểm 84 môn toàn khóa
    return allGrades;
  }

  /**
   * Xử lý tin nhắn ngôn ngữ tự nhiên từ người dùng (Ngắn gọn, chuẩn xác, tiết kiệm token)
   */
  async processUserMessage(userText) {
    try {
      if (this.hasApiKey && this.genAI) {
        const state = storage.getState();
        const allGrades = state.grades || [];
        const relevantGrades = this.filterRelevantGrades(allGrades, userText);

        const gradesSummary = relevantGrades.map(g => 
          `- [${g.code}] ${g.name} (${g.semester}): Điểm TK: ${g.totalScore || 'Chưa có'}, Điểm CK: ${g.finalScore || 'Chưa có'}, Điểm chữ: ${g.gradeLetter || 'Chưa có'}, TT: ${g.status}`
        ).join('\n');

        const drlList = state.trainingPoints || [];
        const drlSummary = drlList.map(d => 
          `- ${d.semester}: ${d.score} điểm`
        ).join('\n');

        const learningInfo = state.learningInfo || { overallGPA: 7.73, overallCredits: 128, semesters: [] };
        const gpaSemestersSummary = (learningInfo.semesters || []).map(s => 
          `- Kỳ ${s.semester}: ĐTBHK: ${s.termGPA} | ĐTBTL: ${s.cumulativeGPA} | TCTL: ${s.cumulativeCredits} | Tiến độ: ${s.progress}`
        ).join('\n');

        const gpaSummary = `• Điểm TB Tích Lũy chung (GPA): ${learningInfo.overallGPA} / 10\n• Tổng số tín chỉ tích lũy: ${learningInfo.overallCredits} TC\n${gpaSemestersSummary}`;

        const tuitionSummary = state.tuition?.formattedSummary || 
          `💰 TỔNG HỌP HỌC PHÍ TOÀN KHÓA:\n• Tổng học phí đã thanh toán: 129.709.000 VNĐ\n• Công nợ hiện tại: 0 VNĐ\nĐã thanh toán đầy đủ 13 học kỳ (2022-2026).`;

        const appsSummary = (state.applications || []).map(a => 
          `- Mã đơn: ${a.id}, Loại: ${a.type}, Trạng thái: ${a.status}, Ngày gửi: ${a.submitDate}`
        ).join('\n');

        const newsSummary = (state.announcements || []).slice(0, 3).map(n => 
          `- ${n.title}`
        ).join('\n');

        let deepExtraInfo = '';
        const lower = userText.toLowerCase();

        if (lower.includes('lịch thi') || lower.includes('phòng thi') || lower.includes('ca thi')) {
          const exams = await scraper.getExamSchedule();
          deepExtraInfo += `\n[LỊCH THI]:\n${exams.join('\n')}\n`;
        }

        if (lower.includes('học phí') || lower.includes('tiền học') || lower.includes('công nợ')) {
          let fee = state.tuition?.formattedSummary;
          if (!fee) {
            fee = await scraper.getTuition();
          }
          deepExtraInfo += `\n[HỌC PHÍ CHI TIẾT]:\n${fee}\n`;
        }

        if (lower.includes('thời khóa biểu') || lower.includes('tkb') || lower.includes('lịch học')) {
          const tkb = await scraper.getScheduleTKB();
          deepExtraInfo += `\n[THỜI KHÓA BIỂU]:\n${tkb.join('\n')}\n`;
        }

        if (lower.includes('thời tiết') || lower.includes('thoitiet') || lower.includes('mưa') || lower.includes('nhiệt độ') || lower.includes('nắng') || lower.includes('áo mưa') || lower.includes('ô')) {
          const weatherInfo = await weatherService.getWeatherSummaryForAI();
          deepExtraInfo += `\n[DỮ LIỆU THỜI TIẾT TP.HCM HÔM NAY TỪ VỆ TINH]:\n${weatherInfo}\n`;
        }

        if (lower.includes('tìm kiếm') || lower.includes('tra cứu') || lower.includes('tin tức') || lower.includes('search')) {
          const query = userText.replace(/^(tìm kiếm|tra cứu|search|tin tức)\s*(về|trên web)?/i, '').trim();
          if (query.length > 2) {
            const searchResults = await SearchService.searchWeb(query, 3);
            if (searchResults.length > 0) {
              const formattedSearch = searchResults.map(s => `- ${s.title}: ${s.snippet} (Link: ${s.link})`).join('\n');
              deepExtraInfo += `\n[KẾT QUẢ TÌM KIẾM WEB REALTIME MỚI NHẤT]:\n${formattedSearch}\n`;
            }
          }
        }

        const bot = config.bot;
        const boss = config.boss;
        const timeInfo = TimeService.getRealtimeVN();
        const timeContext = `${timeInfo.fullStr} (Bây giờ là ${timeInfo.timeStr} buổi ${timeInfo.session})`;

        const systemPrompt = `BẠN LÀ:
- Tên: ${bot.name}
- Ngày sinh: ${bot.dob}
- Giới tính: ${bot.gender}
- Vai trò: ${bot.role}
- Xưng hô: Xưng là "${bot.pronounSelf}", gọi người dùng là "${bot.pronounBoss}" (hoặc "anh Tiến").
- THỜI GIAN THỜI THỰC (REALTIME GMT+7 VIỆT NAM): ${timeContext}
  • Độ chính xác đồng hồ: 100% Realtime theo múi giờ Việt Nam (GMT+7). Khi được hỏi về giờ, phút, giây, thứ, ngày, tháng, năm, bạn hãy trả lời chính xác theo mốc này.

THÔNG TIN VỀ ANH TIẾN (SẾP):
- Tên: ${boss.name} (${boss.fullName}), Sinh ngày: ${boss.dob}, Sở thích: ${boss.hobby}, MSSV: ${boss.studentId} tại TDTU.

QUY TẮC PHẢN HỒI BẮT BUỘC (ĐỂ TIẾT KIỆM TOKEN & RÕ RÀNG):
1. TRẢ LỜI ĐÚNG TRỌNG TÂM: Người dùng hỏi gì thì CHỈ trả lời đúng câu hỏi đó. Không nói dài dòng, không giải thích lan man, không xin lỗi quá mức.
2. TUYỆT ĐỐI KHÔNG GỢI Ý NGOÀI LỀ: Không tự ý hỏi ngược lại người dùng, không gợi ý các câu hỏi tiếp theo (VD: không nói "anh có muốn em kiểm tra cái này cái kia hay thảo luận công nghệ không...").
3. PHONG CÁCH: Nhã nhặn, lịch sự, gọn gàng, súc tích (luôn có "Dạ...", "ạ").
4. KHI TRẢ LỜI SỐ LIỆU (Điểm, Học phí, GPA, Lịch thi): Trình bày số liệu chính xác, rõ ràng, ngắn gọn.

[TÍNH NĂNG HẸN GIỜ & NHẮC NHỞ]:
- Bạn (Diana) ĐÃ ĐƯỢC TÍCH HỢP TÍNH NĂNG HẸN GIỜ TỰ ĐỘNG THÔNG MINH.
- Khi anh Tiến yêu cầu nhắc nhở (VD: "6h tối hôm nay em nhắc anh làm đồ án nhé" hoặc "mỗi ngày nhớ nhắc anh chấm công lúc 8h sáng và 5h30 tối"), hệ thống sẽ tự động cài đặt lịch nhắc nhở native trên Zalo và gửi tin nhắn cảnh báo trực tiếp đúng giờ (hỗ trợ cả 1 lần và lặp lại hàng ngày nhiều mốc giờ).
- Nếu anh Tiến hỏi bạn có thể hẹn giờ/nhắc việc được không: Hãy trả lời là "Dạ hoàn toàn được ạ!" và hướng dẫn ngắn gọn các mẫu câu như trên.

DỮ LIỆU THỰC TẾ TỪ HỆ THỐNG:
[KIẾN THỨC NGUYÊN LÝ TÍNH ĐIỂM TẠI TDTU]:
- Điểm trung bình tích lũy (GPA) tính theo thang điểm 10 (và thang 4) theo công thức:
  ĐTBTL = Tổng(Điểm tổng kết từng môn × Số tín chỉ môn đó) / Tổng số tín chỉ tích lũy.
- Các môn điều kiện (Giáo dục thể chất, Giáo dục quốc phòng) chỉ tính Đạt (P) hoặc Không đạt (F) và không tính vào GPA tích lũy.
- Điểm chữ quy đổi: A (8.5 - 10.0), B (7.0 - 8.4), C (5.5 - 6.9), D (4.0 - 5.4), F (< 4.0 - Rớt môn).

[HỌC PHÍ TOÀN KHÓA]:
${tuitionSummary}

[ĐIỂM TRUNG BÌNH TÍCH LŨY & GPA HIỆN TẠI]:
${gpaSummary}

[ĐIỂM RÈN LUYỆN]:
${drlSummary || 'Chưa có ghi nhận điểm rèn luyện.'}

[BẢNG ĐIỂM CÁC MÔN HỌC]:
${gradesSummary}

[ĐƠN TỪ]:
${appsSummary}

[THÔNG BÁO]:
${newsSummary}
${deepExtraInfo}`;

        const history = this.memory.getGeminiHistory();

        for (const currentModel of BACKUP_MODELS) {
          try {
            const model = this.genAI.getGenerativeModel({
              model: currentModel,
              systemInstruction: systemPrompt
            });

            const chat = model.startChat({
              history: history
            });

            const executePromise = (async () => {
              const result = await chat.sendMessage(userText);
              return result.response.text();
            })();

            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('AI Model Timeout')), 6000)
            );

            const reply = await Promise.race([executePromise, timeoutPromise]);

            if (reply && reply.trim().length > 0) {
              const cleanReply = reply.trim();
              this.memory.addTurn(userText, cleanReply);
              return cleanReply;
            }
          } catch (_) {
            continue;
          }
        }
      }
    } catch (outerErr) {
      console.error('⚠️ [AI Outer Error]:', outerErr.message);
    }

    const fallbackReply = await this.fallbackNLP(userText);
    this.memory.addTurn(userText, fallbackReply);
    return fallbackReply;
  }

  /**
   * Bộ xử lý ngôn ngữ tự nhiên dự phòng súc tích
   */
  async fallbackNLP(userText) {
    const text = userText.toLowerCase().trim();
    const state = storage.getState();
    const allGrades = state.grades || [];
    const bot = config.bot;
    const boss = config.boss;

    // 0. Chào hỏi thông thường
    const greetings = ['chào em', 'xin chào', 'chào diana', 'chào bot', 'hello', 'hi em', 'alo', 'diana ơi', 'bot ơi'];
    if (greetings.some(g => text === g || text.startsWith(g))) {
      return `Dạ em chào anh Tiến ạ! Em là Diana luôn sẵn sàng hỗ trợ anh nè. Anh cần em tra cứu điểm số, đơn từ, nhắc nhở hay giúp gì không ạ? 🌸✨`;
    }

    // 0.1. Thời tiết
    if (text.includes('thời tiết') || text.includes('thoitiet') || text.includes('có mưa không') || text.includes('mấy giờ mưa') || text.includes('trời mưa') || text.includes('nhiệt độ')) {
      return await weatherService.generateMorningBriefing();
    }

    // 0.2. Đồng hồ / Giờ / Ngày Realtime
    if (TimeService.isTimeQuery(text)) {
      return TimeService.generateCurrentTimeReply();
    }

    // 1. Hỏi về tính năng hẹn giờ / nhắc nhở
    if (text.includes('hẹn giờ') || text.includes('nhắc nhở') || text.includes('báo thức') || text.includes('nhắc việc') || text.includes('cài lịch')) {
      return `Dạ hoàn toàn được ạ! Em Diana có thể cài lịch hẹn giờ và nhắc nhở tự động cho anh Tiến:\n` +
        `• Nhắc 1 lần: VD "6h tối hôm nay em nhắc anh làm đồ án nhé", "15 phút nữa nhắc anh uống nước"\n` +
        `• Nhắc hàng ngày: VD "mỗi ngày nhớ nhắc anh chấm công lúc 8h sáng và 5h30 tối"\n` +
        `Em sẽ tự động tạo lịch trên Zalo và gửi tin nhắn trực tiếp nhắc anh đúng giờ ạ! 🌸`;
    }

    // 2. Hỏi về thông tin của Bot (Diana)
    if (text.includes('em là ai') || text.includes('bạn là ai') || text.includes('em tên gì') || text.includes('bạn tên gì') || text.includes('giới thiệu') || text.includes('ngày sinh của em') || text.includes('sinh nhật em')) {
      return `Dạ em là ${bot.name} (Nữ, sinh ngày ${bot.dob}) - ${bot.role} của anh ${boss.name} ạ.`;
    }

    // 3. Hỏi về thông tin của Sếp (Tiến)
    if (text.includes('anh tên gì') || text.includes('tôi tên gì') || text.includes('sếp tên gì') || text.includes('ngày sinh của anh') || text.includes('sinh nhật anh') || text.includes('sở thích của anh') || text.includes('sở thích của tôi')) {
      return `Dạ anh là ${boss.name} (${boss.fullName} - MSSV: ${boss.studentId}), sinh ngày ${boss.dob}, sở thích ${boss.hobby} ạ.`;
    }

    // 4. Học phí
    if (text.includes('học phí') || text.includes('tiền học') || text.includes('công nợ')) {
      const fee = await scraper.getTuition();
      return `💰 Dạ em gửi anh thông tin học phí:\n${fee}`;
    }

    // 5. GPA
    if (text.includes('gpa') || text.includes('tích lũy') || text.includes('điểm trung bình')) {
      const li = state.learningInfo || { overallGPA: 7.73, overallCredits: 128 };
      let reply = `📊 Điểm TB Tích Lũy (GPA): ${li.overallGPA}/10\n• Số tín chỉ tích lũy: ${li.overallCredits} TC\n`;
      return reply.trim();
    }

    // 6. Tìm môn học
    const matched = allGrades.filter(g => 
      (g.name && text.includes(g.name.toLowerCase())) || 
      (g.code && text.includes(g.code.toLowerCase()))
    );

    if (matched.length > 0) {
      let reply = `🎓 Kết quả môn học:\n`;
      matched.forEach(m => {
        reply += `• [${m.code}] ${m.name} (${m.semester}): Điểm TK: ${m.totalScore || 'Chưa có'} (${m.gradeLetter || m.status})\n`;
      });
      return reply.trim();
    }

    if (text.includes('rèn luyện') || text.includes('drl')) {
      const drl = state.trainingPoints || [];
      if (drl.length === 0) return 'Dạ hiện chưa có dữ liệu điểm rèn luyện mới trên cổng ạ.';
      let reply = `🎖️ Điểm rèn luyện các học kỳ:\n`;
      drl.slice(0, 5).forEach(d => {
        reply += `• ${d.semester}: ${d.score} điểm\n`;
      });
      return reply.trim();
    }

    if (text.includes('lịch thi')) {
      const exams = await scraper.getExamSchedule();
      return `⏰ Lịch thi:\n${exams.join('\n')}`;
    }

    return `Dạ em đã nhận yêu cầu của anh: "${userText}".`;
  }
}

export const aiAssistant = new GeminiAssistant();
export default aiAssistant;
