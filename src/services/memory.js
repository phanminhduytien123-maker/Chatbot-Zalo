import fs from 'fs';
import path from 'path';
import config from '../config/config.js';

const MEMORY_FILE = path.resolve(config.paths.dataDir, 'memory.json');
const MAX_TURNS = 20; // Lưu tối đa 20 lượt hội thoại (10 câu của anh Tiến + 10 câu của Diana)

export class MemoryService {
  constructor() {
    this.history = this.loadMemory();
  }

  /**
   * Đọc lịch sử hội thoại từ file lưu trữ
   */
  loadMemory() {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (_) {}
    return [];
  }

  /**
   * Lưu lịch sử hội thoại ra file
   */
  saveMemory() {
    try {
      const dir = path.dirname(MEMORY_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (_) {}
  }

  /**
   * Lấy lịch sử hội thoại dưới định dạng chuẩn của Gemini API
   */
  getGeminiHistory() {
    return this.history.map(item => ({
      role: item.role === 'model' ? 'model' : 'user',
      parts: [{ text: item.text }]
    }));
  }

  /**
   * Ghi nhớ thêm 1 lượt trao đổi mới
   */
  addTurn(userText, modelReply) {
    if (userText && userText.trim().length > 0) {
      this.history.push({
        role: 'user',
        text: userText.trim(),
        timestamp: new Date().toISOString()
      });
    }

    if (modelReply && modelReply.trim().length > 0) {
      this.history.push({
        role: 'model',
        text: modelReply.trim(),
        timestamp: new Date().toISOString()
      });
    }

    // Giữ lại số lượng turn hợp lý để tránh tràn context
    if (this.history.length > MAX_TURNS * 2) {
      this.history = this.history.slice(-MAX_TURNS * 2);
    }

    this.saveMemory();
  }

  /**
   * Xóa toàn bộ trí nhớ khi cần bắt đầu lại
   */
  clear() {
    this.history = [];
    this.saveMemory();
  }
}

export const memory = new MemoryService();
export default memory;
