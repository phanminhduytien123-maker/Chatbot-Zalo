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
  'nhắc', 'nhở', 'tạo', 'đặt', 'em', 'anh', 'tôi', 'mình', 'ơn', 'cài', 'hẹn', 'giờ', 'lịch'
]);

import weatherService from './weather.js';

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
    this.setupMorningWeatherCron();
    // Tự động kiểm tra và gỡ bỏ hoàn toàn mọi lịch nhắc chấm công (8h00 & 17h30)
    this.removeAttendanceReminders().catch(err => {
      console.warn(chalk.yellow('⚠️ [Scheduler] Gỡ bỏ lịch nhắc chấm công khi khởi động:'), err.message);
    });
    console.log(chalk.cyan(`⏰ [Scheduler] Đã nạp ${this.getActiveReminders().length} lịch hẹn giờ hoạt động.`));
  }

  /**
   * Đăng ký cron job tự động gửi Bản tin Thời tiết & Nhắc nhở lúc 7h00 sáng mỗi ngày
   */
  setupMorningWeatherCron() {
    if (this.cronJobs.has('morning_weather_7am')) {
      try { this.cronJobs.get('morning_weather_7am').stop(); } catch (_) {}
    }

    try {
      const task = cron.schedule('0 7 * * *', async () => {
        console.log(chalk.cyan.bold('⛅ [7:00 AM] Đang chuẩn bị gửi bản tin thời tiết buổi sáng cho anh Tiến...'));
        const briefing = await weatherService.generateMorningBriefing();
        const targetId = this.zaloLive?.ownerThreadId || '4150026493728653560';

        if (this.zaloLive?.sendSafeMessage) {
          await this.zaloLive.sendSafeMessage(briefing, targetId, 0);
          console.log(chalk.green('✅ Đã gửi bản tin thời tiết 7h00 sáng thành công tới Zalo của anh Tiến!'));
        }
      }, {
        timezone: 'Asia/Ho_Chi_Minh'
      });

      this.cronJobs.set('morning_weather_7am', task);
      console.log(chalk.cyan('⏰ [Scheduler] Đã kích hoạt lịch tự động gửi Bản tin Thời tiết mỗi sáng lúc 07:00!'));
    } catch (err) {
      console.error(chalk.red('❌ Lỗi khi đăng ký cron thời tiết 7h00:'), err.message);
    }
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
      // Bỏ qua và hủy mọi lịch nhắc liên quan đến chấm công (8h00 / 17h30)
      const isAttendance = /chấm\s*công|cham\s*cong|attendance/i.test(rem.title || '') ||
        ((rem.timeStr === '08:00' || rem.timeStr === '8:00' || rem.timeStr === '17:30') && /công|chấm|cham|cong/i.test(rem.title || ''));
      if (isAttendance) {
        rem.status = 'cancelled';
        continue;
      }

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
   * Xóa lịch theo ID (hỗ trợ cả bot ID và zaloReminderId)
   */
  async removeReminder(id, threadId = null) {
    const cleanId = String(id).trim();
    const targetUid = threadId || this.zaloLive?.ownerThreadId || '4150026493728653560';
    let removed = false;

    const idx = this.reminders.findIndex(r => r.id === cleanId || r.id.endsWith(cleanId) || String(r.zaloReminderId) === cleanId);
    if (idx !== -1) {
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

      const zId = rem.zaloReminderId || cleanId;
      if (zId && this.zaloLive?.api?.removeReminder) {
        try {
          await this.zaloLive.api.removeReminder(String(zId), rem.threadId || targetUid, 0);
        } catch (_) {}
      }

      this.reminders.splice(idx, 1);
      this.saveReminders();
      removed = true;
    }

    // Nếu không có trong local reminders hoặc cần đảm bảo xóa trên Zalo Native
    if (this.zaloLive?.api?.removeReminder) {
      try {
        await this.zaloLive.api.removeReminder(cleanId, targetUid, 0);
        removed = true;
      } catch (_) {}
    }

    return removed;
  }

  /**
   * Xóa toàn bộ tất cả lịch nhắc nhở (cả local timer/cron và Zalo Native Reminders trên server)
   */
  async clearAll(targetThreadId = null) {
    const threadId = targetThreadId || this.zaloLive?.ownerThreadId || '4150026493728653560';
    let removedCount = 0;

    for (const [id, task] of this.cronJobs.entries()) {
      try { task.stop(); } catch (_) {}
    }
    this.cronJobs.clear();

    for (const [id, timer] of this.timeouts.entries()) {
      clearTimeout(timer);
    }
    this.timeouts.clear();

    removedCount += this.reminders.length;
    this.reminders = [];
    this.saveReminders();

    // Dọn sạch toàn bộ Native Reminders trên server Zalo
    if (this.zaloLive?.api?.getListReminder && this.zaloLive?.api?.removeReminder) {
      try {
        console.log(chalk.cyan('🔍 [Scheduler] Đang quét xóa TOÀN BỘ Zalo Native Reminders trên server Zalo...'));
        const nativeReminders = await this.zaloLive.api.getListReminder({ page: 1, count: 100 }, threadId, 0);
        if (Array.isArray(nativeReminders)) {
          for (const item of nativeReminders) {
            const reminderId = item.reminderId || item.id;
            if (reminderId) {
              try {
                await this.zaloLive.api.removeReminder(String(reminderId), threadId, 0);
                console.log(chalk.green(`🗑️ [Scheduler] Đã xóa Zalo Native Reminder: [ID ${reminderId}] "${item.params?.title || ''}"`));
                removedCount++;
              } catch (delErr) {
                console.warn(chalk.yellow(`⚠️ Lỗi xóa native reminder [${reminderId}]:`), delErr.message);
              }
            }
          }
        }
      } catch (err) {
        console.warn(chalk.yellow('⚠️ Lỗi khi quét getListReminder từ Zalo:'), err.message);
      }
    }

    console.log(chalk.green(`✅ [Scheduler] Đã dọn sạch toàn bộ ${removedCount} lịch hẹn.`));
    return { success: true, removedCount };
  }

  /**
   * Tìm và xóa lịch nhắc theo từ khóa, tên nội dung, mốc giờ hoặc ID
   * Hỗ trợ tìm kiếm thông minh tiếng Việt (cả có dấu, không dấu và theo mốc thời gian)
   */
  async removeMatchingReminders(searchQuery, targetThreadId = null) {
    const threadId = targetThreadId || this.zaloLive?.ownerThreadId || '4150026493728653560';
    let removedCount = 0;
    const removedTitles = [];
    let query = (searchQuery || '').trim();

    // Làm sạch các từ đệm mở đầu câu lệnh xóa
    query = query.replace(/^(?:diana\s+|em\s+|hãy\s+|làm\s*ơn\s+)?(?:xóa|hủy|bỏ|tắt|dẹp)\s+(?:lịch\s+nhắc\s+nhở|lịch\s+nhắc|nhắc\s+nhở|lịch|nhắc|hẹn\s+giờ|báo\s*thức)?\s*/i, '').trim();

    if (!query || /^(?:all|tatca|tat\s*ca|toanbo|toan\s*bo|het|toàn\s*bộ|tất\s*cả|luôn)$/i.test(query)) {
      return await this.clearAll(threadId);
    }

    const normalize = (str) => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const cleanQuery = normalize(query);

    // Bóc tách mốc giờ nếu câu truy vấn chứa giờ (ví dụ: "20h", "20:00", "20h tối nay", "8h sáng", "17h30")
    let targetHour = null;
    let targetMin = null;
    const timeMatch = query.match(/(?:(?:lúc|vào\s+lúc)\s+)?(\d{1,2})(?:[h:p](\d{1,2})?)?\s*(sáng|trưa|chiều|tối|đêm|am|pm)?/i);
    if (timeMatch && (timeMatch[0].includes('h') || timeMatch[0].includes(':') || timeMatch[0].includes('p') || timeMatch[3])) {
      let h = parseInt(timeMatch[1], 10);
      let m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : '';
      if ((period === 'tối' || period === 'chiều' || period === 'đêm' || period === 'pm' || cleanQuery.includes('toi') || cleanQuery.includes('chieu')) && h < 12) {
        h += 12;
      } else if ((period === 'sáng' || period === 'am') && h === 12) {
        h = 0;
      }
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        targetHour = h;
        targetMin = m;
      }
    }

    const isMatch = (title, id, zaloReminderId, timeStr, startTime) => {
      // 1. Khớp theo ID
      if (id && (id === query || id.endsWith(query))) return true;
      if (zaloReminderId && String(zaloReminderId) === query) return true;

      // 2. Khớp theo MỐC THỜI GIAN (nếu câu xóa nhắc đến giờ như "20h", "20h tối nay", "8h sáng"...)
      if (targetHour !== null) {
        if (timeStr) {
          const [th, tm] = timeStr.split(':').map(Number);
          if (th === targetHour && (targetMin === null || targetMin === 0 || tm === targetMin)) {
            return true;
          }
        }
        if (startTime) {
          const d = new Date(startTime);
          const vnH = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hour12: false }).format(d), 10);
          const vnM = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', minute: 'numeric' }).format(d), 10);
          if (vnH === targetHour && (targetMin === null || targetMin === 0 || vnM === targetMin)) {
            return true;
          }
        }
      }

      // 3. Khớp theo TIÊU ĐỀ
      const normTitle = normalize(title);
      // Lấy từ khóa nội dung (bỏ các từ chỉ thời gian như 20h, tối nay...)
      const titleKeyword = cleanQuery.replace(/\b\d{1,2}[hp:]\d{0,2}\b|\b(sang|trua|chieu|toi|dem|hom nay|nay|mai)\b/gi, '').trim();
      if (titleKeyword && (normTitle.includes(titleKeyword) || titleKeyword.includes(normTitle))) {
        return true;
      }
      if (cleanQuery && (normTitle.includes(cleanQuery) || cleanQuery.includes(normTitle))) {
        return true;
      }

      // 4. Đặc biệt cho chấm công
      if (cleanQuery.includes('cham cong') || cleanQuery.includes('cham') || cleanQuery.includes('cong')) {
        if (/chấm\s*công|cham\s*cong|attendance/i.test(title || '')) return true;
      }

      return false;
    };

    // 1. Dọn dẹp trong danh sách reminders cục bộ
    const remainingReminders = [];
    for (const rem of this.reminders) {
      if (isMatch(rem.title, rem.id, rem.zaloReminderId, rem.timeStr, rem.targetTimestamp)) {
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
            await this.zaloLive.api.removeReminder(String(rem.zaloReminderId), rem.threadId || threadId, 0);
          } catch (_) {}
        }
        removedCount++;
        removedTitles.push(rem.title || rem.id);
      } else {
        remainingReminders.push(rem);
      }
    }
    this.reminders = remainingReminders;
    this.saveReminders();

    // 2. Dọn dẹp trực tiếp trên Zalo Native Reminders
    if (this.zaloLive?.api?.getListReminder && this.zaloLive?.api?.removeReminder) {
      try {
        const nativeReminders = await this.zaloLive.api.getListReminder({ page: 1, count: 50 }, threadId, 0);
        if (Array.isArray(nativeReminders)) {
          for (const item of nativeReminders) {
            const rawTitle = item.params?.title || item.title || '';
            const reminderId = item.reminderId || item.id;
            if (reminderId && isMatch(rawTitle, null, String(reminderId), null, item.startTime)) {
              try {
                await this.zaloLive.api.removeReminder(String(reminderId), threadId, 0);
                console.log(chalk.green(`🗑️ [Scheduler] Đã xóa Zalo Native Reminder: [ID ${reminderId}] "${rawTitle}"`));
                removedCount++;
                removedTitles.push(rawTitle || reminderId);
              } catch (delErr) {
                console.warn(chalk.yellow(`⚠️ Lỗi xóa native reminder [${reminderId}]:`), delErr.message);
              }
            }
          }
        }
      } catch (err) {
        console.warn(chalk.yellow('⚠️ Lỗi khi quét getListReminder từ Zalo:'), err.message);
      }
    }

    return {
      success: true,
      removedCount,
      removedTitles: [...new Set(removedTitles)]
    };
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
    const cancelKeywords = [
      'không nhắc', 'đừng nhắc', 'bỏ nhắc', 'hủy nhắc', 'xóa nhắc', 'tắt nhắc',
      'không cần nhắc', 'thôi nhắc', 'ngưng nhắc', 'dừng nhắc', 'không tự động nhắc'
    ];
    if (cancelKeywords.some(kw => lower.includes(kw))) {
      return null;
    }

    // Tuyệt đối không tạo lịch nhắc chấm công
    if (/chấm\s*công|cham\s*cong/i.test(lower)) {
      return null;
    }

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
    // Làm sạch từ mở đầu: "em tạo nhắc nhở...", "Diana nhắc anh...", "đặt lịch nhắc..."
    titleRaw = titleRaw.replace(/^(?:diana|em\s*ơi|alo|bot\s*ơi|ơi|hãy|làm\s*ơn)?\s*(?:em\s+)?(?:tạo|đặt|cài|lập|hẹn|thêm)?\s*(?:lịch\s+nhắc\s+nhở|lịch\s+nhắc|nhắc\s+nhở|báo\s*thức|nhắc\s*anh|nhắc\s*em|nhắc\s*tôi|nhắc\s*giúp|nhớ\s*nhắc|hẹn\s*giờ|lịch|nhắc)\s*/i, '');
    titleRaw = titleRaw.replace(/^.*?\b(?:tạo|đặt|cài|hẹn)\s+(?:lịch\s+nhắc|nhắc\s+nhở|báo\s+thức|lịch|giờ)\s*/i, '');

    for (const occ of timeOccurrences) {
      titleRaw = titleRaw.replace(occ, ' ');
    }
    // Bỏ các từ thời gian phụ như "tối nay", "sáng nay", "chiều nay", "hôm nay", "ngày mai"
    titleRaw = titleRaw.replace(/\b(?:sáng|trưa|chiều|tối|đêm)?\s*(?:hôm\s+nay|nay|mai|ngày\s+mai)\b/gi, ' ');

    const words = titleRaw.split(/[,\.\?!;:\s]+/).filter(w => w.trim().length > 0);
    while (words.length > 0 && STOP_WORDS_SET.has(words[0].toLowerCase())) {
      words.shift();
    }
    while (words.length > 0 && STOP_WORDS_SET.has(words[words.length - 1].toLowerCase())) {
      const lastWord = words[words.length - 1].toLowerCase();
      if (words.length > 1) {
        const prevWord = words[words.length - 2].toLowerCase();
        if ((lastWord === 'tối' || lastWord === 'sáng' || lastWord === 'trưa') && (prevWord === 'ăn' || prevWord === 'bữa' || prevWord === 'buổi')) {
          break;
        }
      }
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
