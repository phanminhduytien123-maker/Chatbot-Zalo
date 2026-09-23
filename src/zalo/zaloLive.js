import { Zalo, LoginQRCallbackEventType, ThreadType } from 'zca-js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import config from '../config/config.js';
import MessageHandler from './messageHandler.js';
import monitor from '../services/monitor.js';

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
    
    // Bộ nhớ lưu các tin nhắn do chính Bot gửi đi để tuyệt đối không tự trả lời lại mình
    this.botSentContents = new Set();
    this.botSentMsgIds = new Set();
    this.isProcessing = false;
  }

  /**
   * Khởi động kết nối Zalo
   */
  async start() {
    console.log(chalk.cyan.bold('\n📱 [Zalo Live] Đang chuẩn bị kết nối Zalo...'));

    // 1. Kiểm tra session đã lưu trước đó
    if (fs.existsSync(APPSTATE_FILE)) {
      try {
        console.log(chalk.yellow('🔑 Đang đăng nhập tự động bằng phiên đăng nhập đã lưu (appstate.json)...'));
        const credentials = JSON.parse(fs.readFileSync(APPSTATE_FILE, 'utf8'));
        this.api = await this.zalo.login(credentials);
        
        await this.resolveTargetUser();

        console.log(chalk.green.bold('🎉 ĐĂNG NHẬP ZALO THÀNH CÔNG (KHÔNG CẦN QUÉT MÃ QR)!'));
        this.setupListeners();
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
   * Lắng nghe tin nhắn đến và gửi phản hồi
   */
  setupListeners() {
    if (!this.api) return;

    // Đăng ký gửi thông báo chủ động từ Monitor tới Zalo
    monitor.setSender(async (alertMessage) => {
      await this.broadcastAlert(alertMessage);
    });

    const myUid = String(this.api?.listener?.ctx?.uid || this.api?.getOwnId?.() || '');

    // Bắt đầu lắng nghe tin nhắn
    this.api.listener.on('message', async (message) => {
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

        // Kiểm tra xem tin nhắn có chứa dấu hiệu phản hồi của Bot không
        const botPrefixes = ['🎓', '📑', '📢', '🚨', '🤖', '👋', '📊', '【Trợ lý AI】', '[Trợ lý AI]', '[AI Assistant]', 'Kính gửi Thầy/Cô', 'Bot đã kiểm tra hệ thống'];
        for (const p of botPrefixes) {
          if (content.startsWith(p) || content.includes(p)) {
            this.botSentContents.add(content);
            return;
          }
        }

        // Bỏ qua nếu đang trong quá trình gửi phản hồi
        if (this.isProcessing) return;

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
        else if (lower.startsWith('bot ') || lower.startsWith('@bot ')) {
          finalQuery = content.replace(/^(bot|@bot)\s*/i, '');
        }

        this.isProcessing = true;

        // Xử lý tin nhắn qua MessageHandler / Gemini AI (trả lời trực tiếp đúng người gửi)
        const reply = await MessageHandler.handleIncomingMessage(finalQuery);

        if (reply && reply.trim().length > 0) {
          const cleanReply = reply.trim();

          // Lưu nội dung phản hồi vào danh sách đã gửi để không bị lặp lại
          this.botSentContents.add(cleanReply);

          // Giới hạn bộ nhớ cache 100 tin
          if (this.botSentContents.size > 100) {
            const first = this.botSentContents.values().next().value;
            this.botSentContents.delete(first);
          }

          const sendResult = await this.api.sendMessage(cleanReply, threadId, threadType);
          
          if (sendResult?.message?.msgId) {
            this.botSentMsgIds.add(String(sendResult.message.msgId));
          }

          console.log(chalk.green(`📤 [Zalo Đã Trả Lời Xong]`));
        }

        this.isProcessing = false;
      } catch (err) {
        this.isProcessing = false;
        console.error(chalk.red('❌ Lỗi khi xử lý tin nhắn Zalo:'), err.message);
      }
    });

    this.api.listener.start();
    console.log(chalk.cyan.bold('\n👂 Bot đang lắng nghe tin nhắn trên Zalo.'));
  }

  /**
   * Bắn tin nhắn cảnh báo tự động về Zalo DUY NHẤT cho SĐT 0847839234 (Duy Tiến)
   */
  async broadcastAlert(alertText) {
    if (!this.api) return;

    try {
      const cleanAlert = alertText.trim();
      this.botSentContents.add(cleanAlert);

      const targetId = this.ownerThreadId || '4150026493728653560';
      const targetType = this.ownerThreadType || ThreadType.User;

      await this.api.sendMessage(cleanAlert, targetId, targetType);
      console.log(chalk.green.bold(`🚨 [Zalo Alert] Đã gửi thông báo biến động mới thành công tới SĐT ${config.zalo.targetPhone} (Duy Tiến)!`));
    } catch (err) {
      console.error(chalk.red('❌ Lỗi khi gửi alert Zalo:'), err.message);
    }
  }
}

export const zaloLive = new ZaloLiveConnector();
export default zaloLive;
