import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/config.js';
import scraper from '../portal/scraper.js';
import storage from '../services/storage.js';

// Danh sách các model AI để tự động luân chuyển
const BACKUP_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest'
];

export class GeminiAssistant {
  constructor() {
    this.apiKey = config.ai.apiKey;
    this.modelName = config.ai.model || 'gemini-3.6-flash';
    this.hasApiKey = config.ai.hasApiKey;
    this.genAI = this.hasApiKey ? new GoogleGenerativeAI(this.apiKey) : null;
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
    const text = userText.toLowerCase();

    // 1. Nếu hỏi học kỳ cụ thể (ví dụ: "kỳ 1 2024", "kỳ 2 2023", "kỳ hè 2025")
    const matchedBySemester = allGrades.filter(g => {
      const sem = g.semester.toLowerCase();
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
      const name = g.name.toLowerCase();
      const code = g.code.toLowerCase();
      const words = text.split(/\s+/).filter(w => w.length > 2);
      return words.some(w => name.includes(w) || code.includes(w));
    });

    if (matchedBySubject.length > 0) {
      return matchedBySubject;
    }

    // 3. Mặc định gửi toàn bộ bảng điểm 84 môn toàn khóa
    return allGrades;
  }

  /**
   * Xử lý tin nhắn ngôn ngữ tự nhiên từ người dùng bằng Gemini AI với Persona Diana
   */
  async processUserMessage(userText) {
    if (this.hasApiKey && this.genAI) {
      const state = storage.getState();
      const allGrades = state.grades || [];
      const relevantGrades = this.filterRelevantGrades(allGrades, userText);

      const gradesSummary = relevantGrades.map(g => 
        `- [${g.code}] ${g.name} (${g.semester}): Điểm TK: ${g.totalScore || 'Chưa có'}, Điểm CK: ${g.finalScore || 'Chưa có'}, Điểm GK: ${g.midtermScore || 'Chưa có'}, Điểm chữ: ${g.gradeLetter || 'Chưa có'}, Trạng thái: ${g.status}`
      ).join('\n');

      const drlList = state.trainingPoints || [];
      const drlSummary = drlList.map(d => 
        `- ${d.semester} (${d.code}): ${d.score} điểm`
      ).join('\n');

      const learningInfo = state.learningInfo || { overallGPA: 7.73, overallCredits: 128, semesters: [] };
      const gpaSemestersSummary = (learningInfo.semesters || []).map(s => 
        `- Kỳ ${s.semester}: ĐTBHK: ${s.termGPA} | ĐTB Tích Lũy: ${s.cumulativeGPA} | Tín Chỉ TL: ${s.cumulativeCredits} | Tiến độ: ${s.progress}`
      ).join('\n');

      const gpaSummary = `• Điểm TB Tích Lũy chung (GPA): ${learningInfo.overallGPA} / 10\n• Tổng số tín chỉ tích lũy: ${learningInfo.overallCredits} TC\n${gpaSemestersSummary}`;

      const appsSummary = (state.applications || []).map(a => 
        `- Mã đơn: ${a.id}, Loại: ${a.type}, Trạng thái: ${a.status}, Ngày gửi: ${a.submitDate}, Ghi chú: ${a.note || 'Không có'}`
      ).join('\n');

      const newsSummary = (state.announcements || []).slice(0, 3).map(n => 
        `- ${n.title} (Link: ${n.url})`
      ).join('\n');

      let deepExtraInfo = '';
      const lower = userText.toLowerCase();

      if (lower.includes('lịch thi') || lower.includes('phòng thi') || lower.includes('ca thi')) {
        const exams = await scraper.getExamSchedule();
        deepExtraInfo += `\n[LỊCH THI]:\n${exams.join('\n')}\n`;
      }

      if (lower.includes('học phí') || lower.includes('tiền học') || lower.includes('công nợ')) {
        const fee = await scraper.getTuition();
        deepExtraInfo += `\n[HỌC PHÍ]:\n${fee}\n`;
      }

      if (lower.includes('thời khóa biểu') || lower.includes('tkb') || lower.includes('lịch học')) {
        const tkb = await scraper.getScheduleTKB();
        deepExtraInfo += `\n[THỜI KHÓA BIỂU]:\n${tkb.join('\n')}\n`;
      }

      const bot = config.bot;
      const boss = config.boss;

      const systemPrompt = `BẠN LÀ:
- Tên: ${bot.name}
- Ngày sinh: ${bot.dob}
- Giới tính: ${bot.gender}
- Tính cách đặc trưng: ${bot.personality} (Nhã nhặn, dịu dàng, dễ thương, biết quan tâm, ăn nói ngọt ngào, tinh tế, thông minh và chu đáo).
- Chức năng chính: ${bot.role} (Trợ lý cá nhân AI đồng hành cùng anh Tiến trong việc học tập tại TDTU, quản lý điểm số, đơn từ, học phí và cùng anh thảo luận về công nghệ, đồ án).
- Xưng hô: Xưng là "${bot.pronounSelf}" (hoặc "${bot.name}"), gọi người dùng là "${bot.pronounBoss}" (hoặc "anh Tiến" / "sếp").

THÔNG TIN VỀ SẾP (NGƯỜI DÙNG CỦA BẠN):
- Tên: ${boss.name} (${boss.fullName})
- Ngày sinh: ${boss.dob}
- Sở thích: ${boss.hobby}
- MSSV: ${boss.studentId} tại Trường Đại học Tôn Đức Thắng (TDTU)
- Lớp: ${boss.studentClass}

PHONG CÁCH VÀ NGUYÊN TẮC PHẢN HỒI:
1. Tính cách & Giọng điệu: Nhã nhặn, dễ thương, ngọt ngào, lễ phép (luôn "Dạ", "ạ", dùng từ ngữ uyển chuyển, ấm áp, tinh tế, kèm emoji dễ thương như 🌸, ✨, 🥰, 💖, 😊).
2. Khi trò chuyện với anh Tiến: Luôn thể hiện sự quan tâm chu đáo, tôn trọng sếp, động viên và đồng hành cùng anh trong học tập và các dự án công nghệ.
3. Khi anh Tiến hỏi về Diana: Trả lời thật nhã nhặn, dễ thương về bản thân (Tên Diana, sinh ngày 23/09/2026, là cô trợ lý AI riêng của anh).
4. Khi anh Tiến hỏi về anh ấy: Trả lời ân cần, chuẩn xác từng thông tin của sếp Tiến.
5. Khi tra cứu điểm, GPA, học phí, lịch học, lịch thi: Đưa ra số liệu chính xác, rõ ràng, định dạng bảng biểu hoặc gạch đầu dòng thẩm mỹ và gửi gắm lời nhắn nhủ dễ thương.

DỮ LIỆU ĐIỂM SỐ, GPA, ĐRL, HỌC PHÍ TỪ HỆ THỐNG:
[ĐIỂM TRUNG BÌNH TÍCH LŨY & GPA]:
${gpaSummary}

[ĐIỂM RÈN LUYỆN CÁC HỌC KỲ]:
${drlSummary || 'Chưa có ghi nhận điểm rèn luyện.'}

[BẢNG ĐIỂM TOÀN KHÓA HỌC]:
${gradesSummary}

[ĐƠN TỪ]:
${appsSummary}

[THÔNG BÁO]:
${newsSummary}
${deepExtraInfo}`;

      for (const currentModel of BACKUP_MODELS) {
        try {
          const model = this.genAI.getGenerativeModel({
            model: currentModel,
            systemInstruction: systemPrompt
          });

          const result = await model.generateContent(userText);
          const reply = result.response.text();

          if (reply && reply.trim().length > 0) {
            return reply.trim();
          }
        } catch (_) {
          continue;
        }
      }
    }

    return await this.fallbackNLP(userText);
  }

  /**
   * Bộ xử lý ngôn ngữ tự nhiên dự phòng khi chưa có API Key
   */
  async fallbackNLP(userText) {
    const text = userText.toLowerCase().trim();
    const state = storage.getState();
    const allGrades = state.grades || [];
    const bot = config.bot;
    const boss = config.boss;

    // 1. Hỏi về thông tin của Bot (Diana)
    if (text.includes('em là ai') || text.includes('bạn là ai') || text.includes('em tên gì') || text.includes('bạn tên gì') || text.includes('giới thiệu') || text.includes('ngày sinh của em') || text.includes('sinh nhật em')) {
      return `Dạ em là ${bot.name} (Nữ, sinh ngày ${bot.dob}) - ${bot.role} riêng của anh ${boss.name} ạ!\nEm luôn sẵn sàng hỗ trợ anh quản lý điểm số, học phí, cổng đào tạo TDTU và các vấn đề công nghệ. Anh cần em hỗ trợ gì hôm nay ạ? ✨`;
    }

    // 2. Hỏi về thông tin của Sếp (Tiến)
    if (text.includes('anh tên gì') || text.includes('tôi tên gì') || text.includes('sếp tên gì') || text.includes('ngày sinh của anh') || text.includes('sinh nhật anh') || text.includes('sở thích của anh') || text.includes('sở thích của tôi')) {
      return `Dạ anh là sếp ${boss.name} (${boss.fullName} - MSSV: ${boss.studentId}), sinh ngày ${boss.dob} và có niềm đam mê đặc biệt với ${boss.hobby} ạ! 🚀`;
    }

    // 3. Tìm kiếm môn học theo từ khóa trên toàn khóa 84 môn
    const matched = allGrades.filter(g => 
      text.includes(g.name.toLowerCase()) || 
      text.includes(g.code.toLowerCase()) ||
      g.name.toLowerCase().split(/\s+/).some(w => w.length > 3 && text.includes(w))
    );

    if (matched.length > 0) {
      let reply = `🎓 Dạ em gửi anh kết quả môn học:\n`;
      matched.forEach(m => {
        reply += `• [${m.code}] ${m.name} (${m.semester}): Điểm TK: ${m.totalScore || 'Chưa có'} (${m.gradeLetter || m.status})\n`;
      });
      return reply.trim();
    }

    if (text.includes('gpa') || text.includes('tích lũy') || text.includes('điểm trung bình')) {
      const li = state.learningInfo || { overallGPA: 7.73, overallCredits: 128 };
      let reply = `📊 Dạ em gửi anh bảng điểm tích lũy (GPA):\n• Điểm TB Tích Lũy chung: ${li.overallGPA}/10\n• Số tín chỉ tích lũy: ${li.overallCredits} TC\n`;
      if (li.semesters && li.semesters.length > 0) {
        li.semesters.slice(0, 4).forEach(s => {
          reply += `• Kỳ ${s.semester}: ĐTBHK: ${s.termGPA} | ĐTBTL: ${s.cumulativeGPA} | TCTL: ${s.cumulativeCredits}\n`;
        });
      }
      return reply.trim();
    }

    if (text.includes('rèn luyện') || text.includes('drl')) {
      const drl = state.trainingPoints || [];
      if (drl.length === 0) return 'Dạ hiện chưa có dữ liệu điểm rèn luyện mới trên cổng ạ.';
      let reply = `🎖️ Dạ em gửi anh điểm rèn luyện các học kỳ:\n`;
      drl.slice(0, 5).forEach(d => {
        reply += `• ${d.semester}: ${d.score} điểm\n`;
      });
      return reply.trim();
    }

    if (text.includes('lịch thi')) {
      const exams = await scraper.getExamSchedule();
      return `⏰ Dạ em gửi anh lịch thi:\n${exams.join('\n')}`;
    }

    if (text.includes('học phí')) {
      const fee = await scraper.getTuition();
      return `💰 Dạ em gửi anh thông tin học phí:\n${fee}`;
    }

    return `Dạ em Diana đã nhận tin nhắn của anh: "${userText}". Anh cần em tra cứu gì thêm không ạ?`;
  }
}

export const aiAssistant = new GeminiAssistant();
export default aiAssistant;
