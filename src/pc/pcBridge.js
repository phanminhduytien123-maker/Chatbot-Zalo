import path from 'path';
import fs from 'fs';
import WindowsController from './windowsController.js';
import config from '../config/config.js';


export class PCBridgeService {
  constructor() {
    this.pendingCommands = [];
    this.commandPromises = new Map();
    this.lastHeartbeat = 0;
    this.mirrorActive = false;
    this.pcInfo = {
      name: 'Windows PC (Duy Tiến)',
      online: false,
      lastSeen: 0
    };
  }

  isMirrorActive() {
    return Boolean(this.mirrorActive);
  }

  /**
   * Kiểm tra máy tính Windows có đang kết nối online tới Bot không
   */
  isPCOnline() {
    if (process.platform === 'win32') return true; // Đang chạy trực tiếp trên Windows
    return (Date.now() - this.lastHeartbeat) < 15000; // Nhận heartbeat trong 15s gần nhất
  }

  /**
   * Thực thi lệnh điều khiển máy tính (Hỗ trợ cả chạy Local và qua Cloud Bridge)
   * @param {string} action 
   * @param {Object} [params={}]
   * @returns {Promise<{ success: boolean, message?: string, filePath?: string, error?: string }>}
   */
  async executeCommand(action, params = {}) {
    // 1. Nếu Bot đang chạy trực tiếp trên máy Windows (Local)
    if (process.platform === 'win32') {
      return await this.executeLocalCommand(action, params);
    }

    // 2. Nếu Bot đang chạy trên Cloud Render, gửi lệnh xuống Client Agent qua Bridge
    if (!this.isPCOnline()) {
      return {
        success: false,
        message: '⚠️ Máy tính của anh Tiến hiện đang KHÔNG ONLINE (Chưa bật máy hoặc chưa chạy script `node pcAgent.js` trên máy tính) ạ! 🌸'
      };
    }

    if (action === 'start_air_gesture' || action === 'air_gesture') {
      const existingCmd = this.pendingCommands.find(c => c.action === 'start_air_gesture' || c.action === 'air_gesture');
      if (existingCmd) {
        if (params.sessionData) existingCmd.params.sessionData = params.sessionData;
        return { success: true, message: 'Webcam đã được xếp hàng chờ xử lý.' };
      }
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cmdObject = {
      id: commandId,
      action,
      params,
      timestamp: Date.now()
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.commandPromises.delete(commandId);
        resolve({
          success: false,
          message: '⌛ Hết thời gian chờ phản hồi từ máy tính (Timeout 8s).'
        });
      }, 8000);

      this.commandPromises.set(commandId, {
        resolve,
        timeout
      });

      this.pendingCommands.push(cmdObject);
    });
  }

  /**
   * Thực thi trực tiếp trên máy Windows nội bộ
   */
  async executeLocalCommand(action, params = {}) {
    switch (action) {
      case 'lock':
        return await WindowsController.lockScreen();

      case 'unlock':
        return await WindowsController.unlockScreen(params.password || '\\');

      case 'turnoff_display':
        return await WindowsController.turnOffDisplay();

      case 'wake_display':
        return await WindowsController.wakeDisplay();



      case 'screenshot': {
        const screen = await WindowsController.takeScreenshot();
        if (screen.success && screen.filePath && fs.existsSync(screen.filePath)) {
          const base64Data = fs.readFileSync(screen.filePath, 'base64');
          return {
            ...screen,
            screenshotBase64: base64Data
          };
        }
        return screen;
      }

      case 'battery':
        return await WindowsController.getBatteryInfo();

      case 'volume':
        return await WindowsController.setVolume(params.level || 50);

      case 'mute':
        return await WindowsController.toggleMute();

      case 'open':
        return await WindowsController.openAppOrUrl(params.target);

      case 'clipboard':
        return await WindowsController.setClipboard(params.text || '');

      case 'notify':
        return await WindowsController.showToastNotification(params.title, params.message);

      case 'shutdown':
        return await WindowsController.shutdown(params.minutes || 0);

      case 'cancel_shutdown':
        return await WindowsController.cancelShutdown();

      case 'sleep':
        return await WindowsController.sleep();

      case 'air_gesture':
      case 'start_air_gesture':
        return await WindowsController.startAirGesture();

      case 'stop_air_gesture':
        return await WindowsController.stopAirGesture();

      case 'toggle_air_gesture':
        return await WindowsController.toggleAirGesture();

      case 'get_air_gesture_status':
        return { success: true, active: await WindowsController.isAirGestureRunning() };

      case 'phone_mirror':
      case 'start_phone_mirror': {
        const res = await WindowsController.startPhoneMirror(params?.target);
        if (res && res.success) this.mirrorActive = true;
        return res;
      }

      case 'phone_mirror_toggle':
      case 'toggle_phone_mirror': {
        const res = await WindowsController.togglePhoneMirror(params?.target);
        this.mirrorActive = Boolean(res && res.isMirroring !== false && res.mode === 'scrcpy');
        return res;
      }

      case 'stop_phone_mirror': {
        const res = WindowsController.stopPhoneMirror();
        this.mirrorActive = false;
        return res;
      }

      default:
        return { success: false, error: `Hành động "${action}" không hợp lệ.` };
    }
  }

  /**
   * Client Agent gọi API để lấy lệnh đang chờ xử lý
   */
  pollCommand(query = {}) {
    this.lastHeartbeat = Date.now();
    this.pcInfo.online = true;
    this.pcInfo.lastSeen = Date.now();

    if (typeof query.mirrorActive !== 'undefined') {
      this.mirrorActive = query.mirrorActive === 'true' || query.mirrorActive === true;
    }

    if (this.pendingCommands.length > 0) {
      return this.pendingCommands.shift();
    }
    return null;
  }

  /**
   * Client Agent gửi kết quả xử lý lên Server
   */
  handleResult(resultData) {
    const { id, success, message, error, screenshotBase64, mode } = resultData;
    if (resultData.action === 'start_phone_mirror' || resultData.action === 'phone_mirror' || mode === 'scrcpy') {
      this.mirrorActive = Boolean(success);
    } else if (resultData.action === 'stop_phone_mirror') {
      this.mirrorActive = false;
    }

    if (!id || !this.commandPromises.has(id)) return false;

    const { resolve, timeout } = this.commandPromises.get(id);
    clearTimeout(timeout);
    this.commandPromises.delete(id);

    let filePath = null;
    if (screenshotBase64) {
      try {
        const screenshotDir = path.resolve(config.paths.dataDir, 'screenshots');
        if (!fs.existsSync(screenshotDir)) {
          fs.mkdirSync(screenshotDir, { recursive: true });
        }
        const fileName = `remote_screen_${Date.now()}.png`;
        filePath = path.resolve(screenshotDir, fileName);
        const cleanBase64 = screenshotBase64.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(filePath, cleanBase64, 'base64');
      } catch (e) {
        console.error('Lỗi khi lưu ảnh chụp màn hình từ client:', e.message);
      }
    }

    resolve({
      success: Boolean(success),
      message: message || (success ? 'Thực hiện lệnh thành công!' : (error || 'Thất bại')),
      filePath,
      screenshotBase64
    });

    return true;
  }
}

export const pcBridge = new PCBridgeService();
export default pcBridge;
