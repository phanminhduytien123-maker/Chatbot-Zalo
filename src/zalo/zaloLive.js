import { Zalo, LoginQRCallbackEventType, ThreadType } from 'zca-js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dns from 'dns/promises';
import { exec } from 'child_process';
import config from '../config/config.js';
import MessageHandler from './messageHandler.js';
import monitor from '../services/monitor.js';
import scheduler from '../services/scheduler.js';

const APPSTATE_FILE = path.resolve(config.paths.dataDir, 'appstate.json');
const QR_FILE = path.resolve(config.paths.rootDir, 'qr.png');

export class ZaloLiveConnector {
  constructor() {
    this.zalo = new Zalo({
      selfListen: true,
      checkUpdate: false
    });
    this.api = null;
    this.targetThreadId = null;
    this.targetThreadType = ThreadType.User;
    this.ownerThreadId = '4150026493728653560'; // UID Zalo của Phan Minh Duy Tiến (0847839234)
    this.ownerThreadType = ThreadType.User;
    
    // Bộ nhớ lưu các tin nhắn do chính Bot gửi đi để chống lặp
    this.botSentContents = new Set();
    this.botSentMsgIds = new Set();

    // Trạng thái kết nối và tự phục hồi
    this.isConnected = false;
    this.isReconnecting = false;
    this.isSchedulerInitialized = false;
    this.reconnectAttempts = 0;
    this.lastActiveTime = Date.now();
    this.wasOnline = true;
    this.watchdogInterval = null;
  }

  /**
   * Khởi động kết nối Zalo
   */
  async start() {
    console.log(chalk.cyan.bold('\n📱 [Zalo Live] Đang chuẩn bị kết nối Zalo...'));

    // 0. Khôi phục session từ biến môi trường APPSTATE_JSON (nếu chạy trên Render Cloud)
    if (!fs.existsSync(APPSTATE_FILE) && process.env.APPSTATE_JSON) {
      try {
        if (!fs.existsSync(config.paths.dataDir)) {
          fs.mkdirSync(config.paths.dataDir, { recursive: true });
        }
        fs.writeFileSync(APPSTATE_FILE, process.env.APPSTATE_JSON.trim(), 'utf8');
        console.log(chalk.green('💾 [Cloud Session] Đã nạp phiên đăng nhập Zalo từ biến môi trường APPSTATE_JSON.'));
      } catch (e) {
        console.error(chalk.red('⚠️ Lỗi nạp APPSTATE_JSON:'), e.message);
      }
    }

    // 1. Kiểm tra session đã lưu trước đó
    if (fs.existsSync(APPSTATE_FILE)) {
      try {
        console.log(chalk.yellow('🔑 Đang đăng nhập tự động bằng phiên đăng nhập đã lưu (appstate.json)...'));
        const credentials = JSON.parse(fs.readFileSync(APPSTATE_FILE, 'utf8'));
        this.api = await this.zalo.login(credentials);
        
        await this.resolveTargetUser();

        console.log(chalk.green.bold('🎉 ĐĂNG NHẬP ZALO THÀNH CÔNG (KHÔNG CẦN QUÉT MÃ QR)!'));
        this.setupListeners();
        this.scanAllFriends(false).catch(() => {});
        return;
      } catch (err) {
        console.log(chalk.red('⚠️ Phiên đăng nhập cũ có lỗi, tiến hành tạo mã QR mới:'), err.message);
      }
    }

    // 2. Tạo mã QR nếu chưa có session
    console.log(chalk.yellow('📲 Đang tạo mã QR đăng nhập...'));

    try {
      this.api = await this.zalo.loginQR({}, async (event) => {
        if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
          console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════════╗'));
          console.log(chalk.cyan('║           📷 ĐÃ TẠO MÃ QR ĐĂNG NHẬP ZALO                 ║'));
          console.log(chalk.cyan('╚══════════════════════════════════════════════════════════╝'));

          const base64Data = event.data?.image || (typeof event.data === 'string' && event.data.startsWith('iVBOR') ? event.data : null);
          
          if (base64Data) {
            const cleanBase64 = base64Data.replace(/^data:image\/png;base64,/, '');
            fs.writeFileSync(QR_FILE, cleanBase64, 'base64');
            console.log(chalk.green.bold(`\n🖼️ ĐÃ LƯU ẢNH QR VÀO: ${QR_FILE}`));
            exec(`start "" "${QR_FILE}"`, () => {});
          }

          if (event.data?.qr) {
            qrcode.generate(event.data.qr, { small: true });
          }
        } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
          fs.writeFileSync(APPSTATE_FILE, JSON.stringify(event.data, null, 2), 'utf8');
          console.log(chalk.green.bold('\n💾 Đã lưu phiên đăng nhập vào data/appstate.json thành công!'));

          if (fs.existsSync(QR_FILE)) {
            try { fs.unlinkSync(QR_FILE); } catch (_) {}
          }
        }
      });

      await this.resolveTargetUser();
      console.log(chalk.green.bold('\n🎉 ĐĂNG NHẬP ZALO THÀNH CÔNG! BOT ĐÃ ONLINE TRÊN ZALO!'));
      this.setupListeners();
      this.scanAllFriends(false).catch(() => {});
    } catch (err) {
      console.error(chalk.red('❌ Lỗi khi đăng nhập QR Zalo:'), err.message);
    }
  }

  /**
   * Tự động nhận diện UID của số điện thoại cần nhận thông báo
   */
  async resolveTargetUser() {
    if (!this.api) return;
    if (config.zalo.targetPhone) {
      try {
        const targetUser = await this.api.findUser(config.zalo.targetPhone);
        if (targetUser && targetUser.uid) {
          this.ownerThreadId = String(targetUser.uid);
          console.log(chalk.green(`🎯 Đã kết nối nhận thông báo Zalo: ${targetUser.display_name || targetUser.zalo_name || ''} (${config.zalo.targetPhone} -> UID: ${this.ownerThreadId})`));
        }
      } catch (_) {
        this.ownerThreadId = '4150026493728653560';
      }
    }
  }

  /**
   * Quét và cập nhật toàn bộ danh sách bạn bè chính thức của tài khoản Zalo
   */
  async scanAllFriends(forceRefresh = true) {
    if (!this.api) {
      // Đọc từ file cache nếu API chưa sẵn sàng
      return this.loadCachedFriends();
    }

    try {
      console.log(chalk.cyan('🔄 [Zalo Live] Đang quét danh sách bạn bè Zalo từ máy chủ Zalo...'));
      const friends = await this.api.getAllFriends();
      if (Array.isArray(friends)) {
        this.cachedFriends = friends.map(u => ({
          userId: String(u.userId || u.uid || ''),
          displayName: String(u.displayName || u.display_name || '').trim(),
          zaloName: String(u.zaloName || u.zalo_name || '').trim(),
          avatar: u.avatar || '',
          phoneNumber: u.phoneNumber || '',
          gender: u.gender,
          isFr: u.isFr !== undefined ? u.isFr : 1
        })).filter(f => f.userId && (f.displayName || f.zaloName));

        this.lastFriendsFetch = Date.now();
        console.log(chalk.green(`✅ [Zalo Live] Đã quét thành công ${this.cachedFriends.length} bạn bè Zalo.`));

        // Lưu vào data/zaloFriends.json
        try {
          const friendsFile = path.join(config.paths.dataDir, 'zaloFriends.json');
          fs.writeFileSync(friendsFile, JSON.stringify(this.cachedFriends, null, 2), 'utf8');
        } catch (e) {
          console.error('⚠️ Không thể ghi cache zaloFriends.json:', e.message);
        }

        return this.cachedFriends;
      }
    } catch (err) {
      console.error(chalk.red('❌ Lỗi khi quét bạn bè Zalo:'), err.message);
    }
    return this.loadCachedFriends();
  }

  /**
   * Đọc danh sách bạn bè Zalo từ cache
   */
  loadCachedFriends() {
    if (this.cachedFriends && this.cachedFriends.length > 0) {
      return this.cachedFriends;
    }
    try {
      const friendsFile = path.join(config.paths.dataDir, 'zaloFriends.json');
      if (fs.existsSync(friendsFile)) {
        this.cachedFriends = JSON.parse(fs.readFileSync(friendsFile, 'utf8'));
        return this.cachedFriends;
      }
    } catch (_) {}
    return [];
  }

  /**
   * Lấy danh sách bạn bè (tự động nạp cache nếu cần)
   */
  async getFriendsList() {
    if (!this.cachedFriends || this.cachedFriends.length === 0) {
      return await this.scanAllFriends(false);
    }
    return this.cachedFriends;
  }

  /**
   * Tìm kiếm bạn bè Zalo chính xác bằng tiếng Việt có dấu / không dấu
   */
  async searchZaloFriends(query) {
    if (!query || !query.trim()) return [];
    const friends = await this.getFriendsList();
    if (!friends || friends.length === 0) return [];

    const removeAccents = (str) => {
      if (!str) return '';
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
    };

    const normQuery = removeAccents(query);
    const queryWords = normQuery.split(/\s+/).filter(Boolean);

    const scored = [];
    for (const f of friends) {
      const name = f.displayName || f.zaloName;
      const normName = removeAccents(name);
      const normZaloName = removeAccents(f.zaloName);

      let score = 0;
      if (normName === normQuery || normZaloName === normQuery) {
        score = 100;
      } else if (normName.startsWith(normQuery) || normZaloName.startsWith(normQuery)) {
        score = 80;
      } else if (normName.includes(' ' + normQuery + ' ') || normName.endsWith(' ' + normQuery) || normName.startsWith(normQuery + ' ')) {
        score = 70;
      } else if (normName.includes(normQuery) || normZaloName.includes(normQuery)) {
        score = 50;
      } else {
        let allMatch = true;
        for (const w of queryWords) {
          if (!normName.includes(w) && !normZaloName.includes(w)) {
            allMatch = false;
            break;
          }
        }
        if (allMatch && queryWords.length > 0) score = 40;
      }

      if (score > 0) {
        scored.push({
          ...f,
          name: name,
          score: score
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /**
   * Kiểm tra kết nối Internet thực tế bằng cách phân giải DNS đa nguồn
   */
  async checkInternet() {
    try {
      await Promise.any([
        dns.lookup('chat.zalo.me'),
        dns.lookup('google.com'),
        dns.lookup('old-stdportal.tdtu.edu.vn')
      ]);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Tự động kết nối lại an toàn khi gặp sự cố mạng (Đổi WiFi, rớt mạng, socket treo)
   */
  async safeReconnect(reason = 'Mất kết nối hoặc mạng gián đoạn') {
    const now = Date.now();
    if (this.isReconnecting || (this.lastReconnectTime && now - this.lastReconnectTime < 5000)) {
      return;
    }
    this.isReconnecting = true;
    this.lastReconnectTime = now;

    console.log(chalk.yellow(`\n🔄 [Zalo Live Reconnect] ${reason}. Đang chuẩn bị kết nối lại...`));

    try {
      // 1. Dọn dẹp listener cũ
      if (this.api?.listener) {
        try {
          this.api.listener.stop();
        } catch (_) {}
      }

      // 2. Chờ socket cũ giải phóng hoàn toàn
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. Kiểm tra internet trước khi thử kết nối
      const isOnline = await this.checkInternet();
      if (!isOnline) {
        console.log(chalk.gray('⏳ [Zalo Live] Thiết bị hiện chưa có kết nối Internet. Chờ có mạng để thử lại...'));
        this.isReconnecting = false;
        return;
      }

      // 4. Nếu đã thử nhiều lần (>= 3 lần) hoặc api bị hỏng, làm mới phiên đăng nhập từ appstate.json
      if ((this.reconnectAttempts >= 3 || !this.api) && fs.existsSync(APPSTATE_FILE)) {
        console.log(chalk.yellow('🔑 Đang làm mới phiên đăng nhập Zalo từ appstate.json...'));
        const credentials = JSON.parse(fs.readFileSync(APPSTATE_FILE, 'utf8'));
        this.api = await this.zalo.login(credentials);
        await this.resolveTargetUser();
      }

      // 5. Khởi động lại listener
      this.setupListeners();
      this.reconnectAttempts = 0;
      this.isConnected = true;
      this.lastActiveTime = Date.now();
      console.log(chalk.green.bold('🎉 [Zalo Live] ĐÃ KẾT NỐI LẠI THÀNH CÔNG! ĐIANA ĐANG ONLINE TRÊN ZALO.'));
    } catch (err) {
      this.reconnectAttempts++;
      console.error(chalk.red(`❌ [Zalo Live] Kết nối lại thất bại (Lần ${this.reconnectAttempts}):`), err.message);
      
      // Lên lịch thử lại theo lũy thừa
      const delay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts), 30000);
      setTimeout(() => {
        this.isReconnecting = false;
        this.safeReconnect('Tự động thử lại theo chu kỳ');
      }, delay);
      return;
    }

    this.isReconnecting = false;
  }

  /**
   * Lắng nghe tin nhắn đến và gửi phản hồi (Tự động phục hồi khi rớt mạng / đổi WiFi)
   */
  setupListeners() {
    if (!this.api) return;

    // Khởi tạo hệ thống Hẹn giờ & Nhắc nhở (chỉ khởi tạo 1 lần)
    if (!this.isSchedulerInitialized) {
      scheduler.init(this);
      monitor.setSender(async (alertMessage) => {
        await this.broadcastAlert(alertMessage);
      });
      this.isSchedulerInitialized = true;
    }

    const myUid = String(this.api?.listener?.ctx?.uid || this.api?.getOwnId?.() || '');

    // Dọn dẹp listener sự kiện cũ để tránh đăng ký hàm trùng lặp
    if (this.api.listener) {
      try {
        this.api.listener.removeAllListeners?.();
      } catch (_) {}
    }

    // Ghi nhận trạng thái kết nối thành công
    this.api.listener.on('connected', () => {
      this.isConnected = true;
      this.lastActiveTime = Date.now();
      this.reconnectAttempts = 0;
      console.log(chalk.green('⚡ [Zalo Socket] Đã thiết lập kết nối dữ liệu trực tiếp với Zalo!'));
    });

    this.api.listener.on('cipher_key', () => {
      this.isConnected = true;
      this.lastActiveTime = Date.now();
    });

    // Bắt sự kiện ngắt kết nối và tự động phục hồi
    this.api.listener.on('disconnected', (code, reason) => {
      this.isConnected = false;
      console.log(chalk.yellow(`⚠️ [Zalo Socket] Tạm ngắt kết nối (Code: ${code}, Lý do: ${reason || 'Không rõ'}). zca-js đang phục hồi...`));
    });

    this.api.listener.on('closed', (code, reason) => {
      this.isConnected = false;
      const isNormal = code === 1000;
      const waitTime = isNormal ? 30000 : 8000;
      if (this.scheduledReconnectTimer) clearTimeout(this.scheduledReconnectTimer);
      this.isReconnecting = true;
      console.log(chalk.yellow(`⚠️ [Zalo Socket] Đóng kết nối (Code: ${code}, Lý do: ${reason || 'Không rõ'}). Tự phục hồi sau ${waitTime / 1000}s...`));
      this.scheduledReconnectTimer = setTimeout(() => {
        this.isReconnecting = false;
        this.safeReconnect('Socket đã đóng hoàn toàn (closed)');
      }, waitTime);
    });

    this.api.listener.on('error', (err) => {
      console.error(chalk.red('⚠️ [Zalo Socket Error]:'), err?.message || err);
    });

    // Bắt đầu lắng nghe tin nhắn
    this.api.listener.on('message', async (message) => {
      this.lastActiveTime = Date.now();
      try {
        const msgId = message.data.msgId || message.data.cliMsgId;
        const senderId = message.data.uidFrom || message.data.from;
        const threadId = message.threadId || message.data.idTo || senderId;
        const threadType = message.type || ThreadType.User;
        let content = (typeof message.data.content === 'string' ? message.data.content : (message.data.msg || '')).trim();

        if (!content) return;

        // 🛑 BẢO VỆ CHỐNG TỰ TRẢ LỜI TIN NHẮN CỦA CHÍNH BOT (Anti-Self Echo)
        if (myUid && String(senderId) === myUid) {
          return;
        }

        if (msgId && this.botSentMsgIds.has(String(msgId))) {
          return;
        }

        if (this.botSentContents.has(content)) {
          return;
        }

        // Kiểm tra xem tin nhắn có phải do Bot vừa gửi đi không
        const botPrefixes = ['🎓', '📑', '📢', '🚨', '🤖', '👋', '📊', '⏰', '🌸', '🗑️', '【Trợ lý AI】', '[Trợ lý AI]', '[AI Assistant]'];
        for (const p of botPrefixes) {
          if (content.startsWith(p)) {
            this.botSentContents.add(content);
            return;
          }
        }

        console.log(chalk.blue(`\n📩 [Zalo Nhận Tin]: "${content}"`));

        // Cập nhật người gửi thành ownerThreadId nếu tin nhắn đến từ người dùng riêng
        if (threadType === ThreadType.User && senderId && String(senderId) !== myUid) {
          this.ownerThreadId = String(senderId);
          this.ownerThreadType = threadType;
        }

        // Chuẩn hóa lệnh
        const lower = content.toLowerCase();
        let finalQuery = content;

        if (lower === 'check' || lower === '/check') finalQuery = '/check';
        else if (lower === 'diem' || lower === '/diem' || lower === 'xem diem') finalQuery = '/diem';
        else if (lower === 'don' || lower === '/don' || lower === 'xem don') finalQuery = '/don';
        else if (lower === 'tintuc' || lower === '/tintuc' || lower === 'tin tuc') finalQuery = '/tintuc';
        else if (lower === 'hoatdong' || lower === '/hoatdong') finalQuery = '/hoatdong';
        else if (lower === 'menu' || lower === 'help' || lower === '/help') finalQuery = '/menu';
        else if (lower === 'reminders' || lower === '/reminders' || lower === 'lich' || lower === '/lich' || lower === 'lich nhac' || lower === '/lichnhac') finalQuery = '/reminders';
        else if (lower.startsWith('bot ') || lower.startsWith('@bot ')) {
          finalQuery = content.replace(/^(bot|@bot)\s*/i, '');
        }

        // Xử lý tin nhắn qua MessageHandler / Gemini AI (bất đồng bộ độc lập)
        MessageHandler.handleIncomingMessage(finalQuery, threadId).then(async (reply) => {
          if (!reply) return;

          let cleanReply = '';
          let attachments = [];

          if (typeof reply === 'string') {
            cleanReply = reply.trim();
          } else if (typeof reply === 'object') {
            cleanReply = (reply.text || '').trim();
            if (Array.isArray(reply.attachments)) {
              attachments = reply.attachments.filter(f => typeof f === 'string' && fs.existsSync(f));
            }
          }

          if (cleanReply) {
            this.botSentContents.add(cleanReply);
            if (this.botSentContents.size > 100) {
              const first = this.botSentContents.values().next().value;
              this.botSentContents.delete(first);
            }
          }

          try {
            if (cleanReply) {
              await this.sendSafeMessage(cleanReply, threadId, threadType);
            }
            if (attachments.length > 0 && this.api) {
              for (const attPath of attachments) {
                try {
                  await this.api.sendMessage({
                    msg: '',
                    attachments: [attPath]
                  }, threadId, threadType);
                  console.log(chalk.green(`📎 [Zalo] Đã gửi file đính kèm: ${path.basename(attPath)}`));
                } catch (attErr) {
                  console.error(chalk.red(`❌ Lỗi gửi file đính kèm ${attPath}:`), attErr.message);
                }
              }
            }
            console.log(chalk.green(`📤 [Zalo Đã Trả Lời Xong]`));
          } catch (sendErr) {
            console.error(chalk.red('❌ Lỗi khi gửi phản hồi Zalo:'), sendErr.message);
            if (sendErr.message?.includes('socket') || sendErr.message?.includes('network') || sendErr.message?.includes('ECONNRESET')) {
              this.safeReconnect('Lỗi socket khi gửi phản hồi');
            }
          }
        }).catch((procErr) => {
          console.error(chalk.red('❌ Lỗi khi xử lý tin nhắn:'), procErr.message);
        });

      } catch (err) {
        console.error(chalk.red('❌ Lỗi ngoài sự kiện tin nhắn:'), err.message);
      }
    });

    try {
      this.api.listener.start({ retryOnClose: false });
      console.log(chalk.cyan.bold('\n👂 Điana đang lắng nghe tin nhắn trên Zalo.'));
    } catch (err) {
      if (!err.message?.includes('Already started')) {
        console.error(chalk.red('❌ Lỗi khi khởi động Listener:'), err.message);
      }
    }

    // Kích hoạt Watchdog giám sát kết nối
    this.startWatchdog();
  }

  /**
   * Gửi tin nhắn an toàn tự động phân đoạn nếu vượt quá giới hạn ký tự của Zalo (~1200 ký tự)
   */
  async sendSafeMessage(text, threadId, threadType = ThreadType.User) {
    if (!this.api || !text) return;
    const cleanText = text.trim();
    const MAX_CHUNK = 1200;

    if (cleanText.length <= MAX_CHUNK) {
      this.botSentContents.add(cleanText);
      const res = await this.api.sendMessage(cleanText, threadId, threadType);
      if (res?.message?.msgId) this.botSentMsgIds.add(String(res.message.msgId));
      return res;
    }

    // Nếu tin nhắn dài, chia nhỏ theo từng đoạn hoặc dòng
    const lines = cleanText.split('\n');
    let currentChunk = '';
    const chunks = [];

    for (const line of lines) {
      if ((currentChunk + '\n' + line).length > MAX_CHUNK) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n' + line : line;
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // Gửi từng phần cách nhau 400ms
    for (const chunk of chunks) {
      this.botSentContents.add(chunk);
      const res = await this.api.sendMessage(chunk, threadId, threadType);
      if (res?.message?.msgId) this.botSentMsgIds.add(String(res.message.msgId));
      await new Promise(r => setTimeout(r, 400));
    }
  }

  /**
   * Watchdog định kỳ 15s kiểm tra kết nối mạng và tình trạng WebSocket
   */
  startWatchdog() {
    if (this.watchdogInterval) return;

    this.watchdogInterval = setInterval(async () => {
      try {
        const isOnline = await this.checkInternet();

        if (!isOnline) {
          if (this.wasOnline) {
            console.log(chalk.yellow('\n📡 [Watchdog] Phát hiện mất kết nối Internet (đổi WiFi/sóng yếu). Điana đang đợi có mạng lại...'));
            this.wasOnline = false;
            this.isConnected = false;
          }
          return;
        }

        // Nếu vừa có mạng trở lại sau khi mất mạng
        if (!this.wasOnline) {
          console.log(chalk.green.bold('\n📶 [Watchdog] Đã khôi phục kết nối Internet! Tiến hành kết nối lại Zalo ngay...'));
          this.wasOnline = true;
          await this.safeReconnect('Khôi phục kết nối mạng');
          return;
        }

        // Chỉ kết nối lại nếu WebSocket thực sự bị ngắt (không ở trạng thái OPEN = 1)
        const wsState = this.api?.listener?.ws?.readyState;
        if (wsState !== undefined && wsState !== 1 && !this.isReconnecting) {
          console.log(chalk.yellow(`\n🔄 [Watchdog] Phát hiện Socket Zalo bị ngắt (Trạng thái: ${wsState}). Đang tự động kết nối lại...`));
          await this.safeReconnect('Socket Zalo không ở trạng thái OPEN');
          return;
        }
      } catch (_) {}
    }, 15000);
  }

  /**
   * Bắn tin nhắn cảnh báo tự động về Zalo DUY NHẤT cho SĐT 0847839234 (Duy Tiến)
   */
  async broadcastAlert(alertText) {
    if (!this.api) return;

    try {
      const cleanAlert = alertText.trim();
      if (!cleanAlert) return;

      const targetId = this.ownerThreadId || '4150026493728653560';
      const targetType = this.ownerThreadType || ThreadType.User;

      await this.sendSafeMessage(cleanAlert, targetId, targetType);
      console.log(chalk.green.bold(`🚨 [Zalo Alert] Đã gửi thông báo biến động mới thành công tới SĐT ${config.zalo.targetPhone} (Duy Tiến)!`));
    } catch (err) {
      console.error(chalk.red('❌ Lỗi khi gửi alert Zalo:'), err.message);
      if (err.message?.includes('socket') || err.message?.includes('network') || err.message?.includes('ECONNRESET')) {
        this.safeReconnect('Lỗi socket khi gửi cảnh báo');
      }
    }
  }
}

export const zaloLive = new ZaloLiveConnector();
export default zaloLive;
