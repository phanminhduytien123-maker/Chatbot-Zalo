import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import cron from 'node-cron';
import config from '../config/config.js';

const REMINDERS_FILE = path.resolve(config.paths.dataDir, 'reminders.json');

const STOP_WORDS_SET = new Set([
  'và', 'với', 'đồng', 'thời', 'lúc', 'vào', 'lặp', 'lại', 'mỗi', 'ngày', 
  'hàng', 'hằng', 'hôm', 'nay', 'mai', 'tối', 'chiều', 'sáng', 'đêm', 'trưa', 
  'nhé', 'nha', 'ạ', 'đi', 'giúp', 'nhe', 'nhá', 'nghen', 'nhen', 'nhớ', 'ha', 
  'nhắc', 'em', 'anh', 'tôi', 'mình', 'ơn', 'cài', 'hẹn', 'giờ', 'lịch'
]);

export class SchedulerService {
  constructor() {
    this.reminders = [];
    this.cronJobs = new Map();
    this.timeouts = new Map();
    this.zaloLive = null;
    this.loadReminders();
  }

  /**
   * Khởi tạo scheduler và gắn Zalo connector
   */
  init(zaloLiveInstance) {
    this.zaloLive = zaloLiveInstance;
    this.loadReminders();
    this.restoreSchedules();
    console.log(chalk.cyan(`⏰ [Scheduler] Đã nạp ${this.getActiveReminders().length} lịch hẹn giờ hoạt động.`));
  }

  /**
   * Đọc danh sách nhắc nhở từ file JSON
   */
  loadReminders() {
    try {
      if (!fs.existsSync(config.paths.dataDir)) {
        fs.mkdirSync(config.paths.dataDir, { recursive: true });
      }
      if (fs.existsSync(REMINDERS_FILE)) {
        const raw = fs.readFileSync(REMINDERS_FILE, 'utf8');
        this.reminders = JSON.parse(raw);
      } else {
        this.reminders = [];
        this.saveReminders();
      }
    } catch (err) {
      console.error(chalk.red('❌ Lỗi khi đọc reminders.json:'), err.message);
      this.reminders = [];
    }
  }

  /**
   * Lưu danh sách nhắc nhở ra file JSON
   */
  saveReminders() {
    try {
      fs.writeFileSync(REMINDERS_FILE, JSON.stringify(this.reminders, null, 2), 'utf8');
    } catch (err) {
      console.error(chalk.red('❌ Lỗi khi lưu reminders.json:'), err.message);
    }
  }

  /**
   * Lấy danh sách lịch còn hiệu lực
   */
  getActiveReminders() {
    return this.reminders.filter(r => r.status === 'active');
  }

  /**
   * Khôi phục tất cả lịch khi bot khởi động lại
   */
  restoreSchedules() {
    const active = this.getActiveReminders();
    const now = Date.now();

    for (const rem of active) {
      if (rem.type === 'daily') {
        this.scheduleDailyCron(rem);
      } else if (rem.type === 'once') {
        if (rem.targetTimestamp && rem.targetTimestamp > now) {
          this.scheduleOnceTimeout(rem);
        } else {
          rem.status = 'completed';
        }
      }
    }
    this.saveReminders();
  }

  /**
   * Đăng ký cron job lặp lại hàng ngày
   */
  scheduleDailyCron(rem) {
    if (this.cronJobs.has(rem.id)) {
      try { this.cronJobs.get(rem.id).stop(); } catch (_) {}
    }

    const [hour, minute] = rem.timeStr.split(':').map(Number);
    const cronExpr = `${minute} ${hour} * * *`;

    try {
      const task = cron.schedule(cronExpr, async () => {
        console.log(chalk.magenta.bold(`⏰ [Alarm Fired - Daily] Đến giờ: "${rem.title}" (${rem.timeStr})`));
        await this.triggerAlarm(rem);
      }, {
        timezone: 'Asia/Ho_Chi_Minh'
      });

      this.cronJobs.set(rem.id, task);
    } catch (err) {
      console.error(chalk.red(`❌ Lỗi đăng ký cron cho [${rem.id}]:`), err.message);
    }
  }

  /**
   * Đăng ký timeout cho lịch 1 lần
   */
  scheduleOnceTimeout(rem) {
    if (this.timeouts.has(rem.id)) {
      clearTimeout(this.timeouts.get(rem.id));
    }

    const delayMs = rem.targetTimestamp - Date.now();
    if (delayMs <= 0) {
      this.triggerAlarm(rem);
      rem.status = 'completed';
      this.saveReminders();
      return;
    }

    const timer = setTimeout(async () => {
      console.log(chalk.magenta.bold(`⏰ [Alarm Fired - Once] Đến giờ: "${rem.title}" (${rem.timeStr})`));
      await this.triggerAlarm(rem);
      rem.status = 'completed';
      this.saveReminders();
      this.timeouts.delete(rem.id);
    }, delayMs);

    this.timeouts.set(rem.id, timer);
  }

  /**
   * Bắn chuông báo tin nhắn trực tiếp qua Zalo
   */
  async triggerAlarm(rem) {
    const threadId = rem.threadId || this.zaloLive?.ownerThreadId || '4150026493728653560';
    const alertMsg = `⏰ Dạ anh Tiến ơi! Đến giờ: ${rem.title} rồi ạ! 🌸\n(Lịch hẹn: ${rem.type === 'daily' ? 'Mỗi ngày lúc' : 'Hôm nay lúc'} ${rem.timeStr})`;

    if (this.zaloLive?.api) {
      try {
        await this.zaloLive.api.sendMessage(alertMsg, threadId, 0); // 0: ThreadType.User
        console.log(chalk.green(`🔔 Đã gửi tin nhắn nhắc hẹn giờ thành công tới Zalo UID: ${threadId}`));
      } catch (err) {
        console.error(chalk.red('❌ Lỗi gửi tin nhắn nhắc hẹn:'), err.message);
      }
    } else {
      console.log(chalk.yellow(`[Offline Alarm]: ${alertMsg}`));
    }
  }

  /**
   * Tạo lịch hẹn mới từ thông tin bóc tách
   */
  async addReminders({ title, type = 'once', times = [], targetTimestamp = null, threadId = null }) {
    const createdList = [];
    const targetUid = threadId || this.zaloLive?.ownerThreadId || '4150026493728653560';

    for (let i = 0; i < times.length; i++) {
      const { hour, minute } = times[i];
      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const remId = `rem_${Date.now()}_${i + 1}`;

      let computedTimestamp = targetTimestamp;
      if (!computedTimestamp) {
        const d = new Date();
        d.setHours(hour, minute, 0, 0);
        if (type === 'once' && d.getTime() <= Date.now()) {
          d.setDate(d.getDate() + 1);
        }
        computedTimestamp = d.getTime();
      }

      const reminderRecord = {
        id: remId,
        title: title,
        type: type,
        timeStr: timeStr,
        targetTimestamp: computedTimestamp,
        threadId: targetUid,
        zaloReminderId: null,
        createdAt: new Date().toISOString(),
        status: 'active'
      };

      // 1. Gọi API tạo Reminder gốc trên Zalo (Zalo Native Reminder)
      if (this.zaloLive?.api?.createReminder) {
        try {
          const zaloRes = await this.zaloLive.api.createReminder({
            title: title,
            startTime: computedTimestamp,
            repeat: type === 'daily' ? 1 : 0, // 1 = Daily, 0 = None
            emoji: '⏰'
          }, targetUid, 0);

          if (zaloRes && (zaloRes.reminderId || zaloRes.id)) {
            reminderRecord.zaloReminderId = String(zaloRes.reminderId || zaloRes.id);
            console.log(chalk.green(`✅ Đã tạo Zalo Native Reminder thành công: ID ${reminderRecord.zaloReminderId}`));
          }
        } catch (zaloErr) {
          console.log(chalk.yellow(`⚠️ Ghi nhận: Chưa tạo Zalo Native card (${zaloErr.message}), Bot kích hoạt chuông đẩy tin nhắn trực tiếp.`));
        }
      }

      // 2. Kích hoạt timer / cron ngầm trên bot
      if (type === 'daily') {
        this.scheduleDailyCron(reminderRecord);
      } else {
        this.scheduleOnceTimeout(reminderRecord);
      }

      this.reminders.push(reminderRecord);
      createdList.push(reminderRecord);
    }

    this.saveReminders();
    return createdList;
  }

  /**
   * Xóa lịch theo ID
   */
  removeReminder(id) {
    const cleanId = id.trim();
    const idx = this.reminders.findIndex(r => r.id === cleanId || r.id.endsWith(cleanId));
    if (idx === -1) return false;

    const rem = this.reminders[idx];
    rem.status = 'cancelled';

    if (this.cronJobs.has(rem.id)) {
      try { this.cronJobs.get(rem.id).stop(); } catch (_) {}
      this.cronJobs.delete(rem.id);
    }
    if (this.timeouts.has(rem.id)) {
      clearTimeout(this.timeouts.get(rem.id));
      this.timeouts.delete(rem.id);
    }

    if (rem.zaloReminderId && this.zaloLive?.api?.removeReminder) {
      try {
        this.zaloLive.api.removeReminder(rem.zaloReminderId, rem.threadId, 0).catch(() => {});
      } catch (_) {}
    }

    this.reminders.splice(idx, 1);
    this.saveReminders();
    return true;
  }

  /**
   * Xóa toàn bộ lịch
   */
  clearAll() {
    for (const [id, task] of this.cronJobs.entries()) {
      try { task.stop(); } catch (_) {}
    }
    this.cronJobs.clear();

    for (const [id, timer] of this.timeouts.entries()) {
      clearTimeout(timer);
    }
    this.timeouts.clear();

    this.reminders = [];
    this.saveReminders();
  }

  /**
   * Format danh sách lịch hẹn đẹp mắt
   */
  formatRemindersList() {
    const active = this.getActiveReminders();
    if (active.length === 0) {
      return `⏰ Hiện tại anh Tiến chưa có lịch hẹn giờ nào ạ.\n👉 Anh có thể nhắn: "6h tối nhắc anh làm đồ án" hoặc "mỗi ngày nhắc anh chấm công lúc 8h sáng và 5h30 tối" nhé! ✨`;
    }

    let msg = `⏰ DANH SÁCH LỊCH HẸN GIỜ CỦA ANH TIẾN (${active.length} lịch):\n`;
    active.forEach((r, idx) => {
      const typeLabel = r.type === 'daily' ? '🔁 Mỗi ngày' : '⏳ Một lần';
      msg += `\n${idx + 1}. [${typeLabel}] Lúc ${r.timeStr}\n   📝 Nội dung: ${r.title}\n   🆔 Lệnh xóa: /xoalich ${r.id}`;
    });

    msg += `\n\n💡 Để xóa: Gõ /xoalich <Mã_Lịch> hoặc /xoalich all`;
    return msg.trim();
  }

  /**
   * Format tin nhắn xác nhận đã tạo lịch thành công
   */
  formatCreatedResponse(createdList) {
    if (!createdList || createdList.length === 0) return '';

    const first = createdList[0];
    const isDaily = first.type === 'daily';
    const timesStr = createdList.map(r => r.timeStr).join(' và ');

    if (isDaily) {
      return `🌸 Dạ em Diana đã cài lịch nhắc nhở HÀNG NGÀY cho anh Tiến rồi ạ!\n🔁 Lặp lại: Mỗi ngày lúc ${timesStr}\n📝 Nội dung: ${first.title}\n⏰ Em đã đồng bộ vào lịch Zalo và sẽ nhắn tin nhắc anh mỗi ngày nhé! ✨`;
    } else {
      return `🌸 Dạ em Diana đã cài lịch hẹn giờ cho anh Tiến rồi ạ!\n⏳ Thời gian: Lúc ${timesStr} hôm nay\n📝 Nội dung: ${first.title}\n⏰ Em đã đồng bộ vào lịch Zalo và sẽ gửi tin nhắn trực tiếp nhắc anh đúng giờ ạ! ✨`;
    }
  }

  /**
   * Bộ phân tích ngôn ngữ tự nhiên tiếng Việt cho yêu cầu hẹn giờ (NLP Engine)
   */
  parseNaturalLanguage(userText) {
    const text = userText.trim();
    const lower = text.toLowerCase();

    // 1. Kiểm tra có phải ý định hẹn giờ / nhắc nhở không
    const reminderKeywords = [
      'nhắc anh', 'nhắc em', 'nhắc tôi', 'hẹn giờ', 'cài lịch', 'đặt lịch',
      'nhắc nhở', 'báo thức', 'nhớ nhắc', 'nhắc giúp', 'nhắc tao', 'remind'
    ];
    const hasIntent = reminderKeywords.some(kw => lower.includes(kw));
    if (!hasIntent) return null;

    // 2. Xác định tần suất (Daily vs Once)
    const isDaily = lower.includes('mỗi ngày') || 
                    lower.includes('hàng ngày') || 
                    lower.includes('hằng ngày') || 
                    lower.includes('mỗi sáng') || 
                    lower.includes('mỗi tối') || 
                    lower.includes('mỗi chiều') || 
                    lower.includes('lặp lại') || 
                    lower.includes('daily');

    const type = isDaily ? 'daily' : 'once';

    // 3. Xử lý trường hợp thời gian tương đối (VD: "10 phút nữa", "30 phút nữa", "1 tiếng nữa")
    const relativeMatch = lower.match(/(\d+)\s*(phút|p|tiếng|giờ|h)\s*nữa/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();
      let addMs = 0;
      if (unit.startsWith('p')) {
        addMs = amount * 60 * 1000;
      } else {
        addMs = amount * 60 * 60 * 1000;
      }

      const targetDate = new Date(Date.now() + addMs);
      const hour = targetDate.getHours();
      const minute = targetDate.getMinutes();

      let titleRaw = text
        .replace(/.*(nhắc anh|nhắc em|nhắc tôi|nhắc giúp|nhớ nhắc)\s*/i, '')
        .replace(/(\d+)\s*(phút|p|tiếng|giờ|h)\s*nữa/i, '')
        .trim();

      const words = titleRaw.split(/[,\.\?!;:\s]+/).filter(w => w.trim().length > 0);
      while (words.length > 0 && STOP_WORDS_SET.has(words[0].toLowerCase())) {
        words.shift();
      }
      while (words.length > 0 && STOP_WORDS_SET.has(words[words.length - 1].toLowerCase())) {
        words.pop();
      }

      let title = words.join(' ').trim();
      if (!title || title.length < 2) title = 'Công việc đã hẹn';
      title = title.charAt(0).toUpperCase() + title.slice(1);

      return {
        type: 'once',
        times: [{ hour, minute }],
        targetTimestamp: targetDate.getTime(),
        title: title
      };
    }

    // 4. Bóc tách các mốc giờ trong câu (Bắt buộc có h, p, :, từ chỉ buổi, hoặc đi sau 'lúc')
    const times = [];
    const timeOccurrences = [];
    const timeRegex = /(?:(?:vào\s+lúc|lúc)\s+)?(\d{1,2})(?:[h:p](\d{1,2})?)?\s*(sáng|trưa|chiều|tối|đêm|am|pm)?/gi;
    
    let match;
    while ((match = timeRegex.exec(text)) !== null) {
      const fullMatch = match[0].trim();
      const hasLuc = /^(?:vào\s+lúc|lúc)\b/i.test(fullMatch);
      const hasUnit = /[h:p]/i.test(fullMatch);
      const hasPeriod = Boolean(match[3]);

      // Bắt buộc phải có 'h', 'p', ':', từ chỉ buổi, hoặc đi sau 'lúc'/'vào lúc'
      if (!hasUnit && !hasPeriod && !hasLuc) {
        continue;
      }

      const rawHour = parseInt(match[1], 10);
      const rawMin = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3] ? match[3].toLowerCase() : '';

      if (rawHour >= 0 && rawHour <= 24 && rawMin >= 0 && rawMin <= 59) {
        let hour = rawHour;
        let minute = rawMin;

        if (period === 'chiều' || period === 'tối' || period === 'đêm' || period === 'pm') {
          if (hour < 12) hour += 12;
        } else if (period === 'sáng' || period === 'am') {
          if (hour === 12) hour = 0;
        } else if (!period) {
          if ((lower.includes('tối') || lower.includes('chiều')) && hour < 12 && !lower.includes('sáng')) {
            hour += 12;
          }
        }

        times.push({ hour, minute });
        timeOccurrences.push(fullMatch);
      }
    }

    if (times.length === 0) {
      return null;
    }

    // 5. Bóc tách tiêu đề/nội dung cần nhắc
    let titleRaw = text;
    titleRaw = titleRaw.replace(/^(diana|em ơi|alo|bot ơi|ơi|hãy|nhớ|làm ơn)\s*/i, '');
    titleRaw = titleRaw.replace(/^.*?\b(nhớ nhắc anh|nhớ nhắc em|nhớ nhắc tôi|nhớ nhắc|nhắc anh|nhắc em|nhắc tôi|nhắc giúp|nhắc)\s*/i, '');

    for (const occ of timeOccurrences) {
      titleRaw = titleRaw.replace(occ, ' ');
    }

    const words = titleRaw.split(/[,\.\?!;:\s]+/).filter(w => w.trim().length > 0);
    while (words.length > 0 && STOP_WORDS_SET.has(words[0].toLowerCase())) {
      words.shift();
    }
    while (words.length > 0 && STOP_WORDS_SET.has(words[words.length - 1].toLowerCase())) {
      words.pop();
    }

    let title = words.join(' ').trim();
    if (!title || title.length < 2) {
      title = 'Công việc đã hẹn';
    }

    title = title.charAt(0).toUpperCase() + title.slice(1);

    return {
      type,
      times,
      title
    };
  }
}

export const scheduler = new SchedulerService();
export default scheduler;
