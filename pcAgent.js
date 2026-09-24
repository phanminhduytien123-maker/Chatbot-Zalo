import axios from 'axios';
import fs from 'fs';
import chalk from 'chalk';
import WindowsController from './src/pc/windowsController.js';

// Địa chỉ máy chủ Cloud Render của Diana
const SERVER_URL = process.env.BOT_SERVER_URL || 'https://diana-h73u.onrender.com';
const POLL_INTERVAL_MS = 1500;

console.log(chalk.cyan.bold('\n╔══════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║       🚀 DIANA WINDOWS CLIENT AGENT (TIẾN PC)            ║'));
console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════╝'));
console.log(chalk.green(`📡 Máy chủ kết nối: ${SERVER_URL}`));
console.log(chalk.yellow('🔄 Đang lắng nghe lệnh điều khiển từ Zalo...\n'));

let isProcessing = false;

async function pollServer() {
  if (isProcessing) return;

  try {
    const res = await axios.get(`${SERVER_URL}/pc/poll`, {
      timeout: 5000,
      headers: { 'User-Agent': 'Diana-Windows-Client-Agent/1.0' }
    });

    const command = res.data?.command;
    if (!command || !command.id) return;

    isProcessing = true;
    console.log(chalk.magenta.bold(`⚡ [Nhận Lệnh Zalo]: "${command.action}"`), command.params || '');

    const { id, action, params } = command;
    let result = { id, success: false, message: '' };

    try {
      switch (action) {
        case 'lock': {
          result = await WindowsController.lockScreen();
          result.id = id;
          break;
        }

        case 'screenshot': {
          const screen = await WindowsController.takeScreenshot();
          if (screen.success && screen.filePath && fs.existsSync(screen.filePath)) {
            const base64Data = fs.readFileSync(screen.filePath, 'base64');
            result = {
              id,
              success: true,
              message: '📸 Đã chụp ảnh màn hình máy tính của anh Tiến thành công!',
              screenshotBase64: base64Data
            };
          } else {
            result = { id, success: false, error: screen.error || 'Lỗi chụp màn hình.' };
          }
          break;
        }

        case 'battery': {
          result = await WindowsController.getBatteryInfo();
          result.id = id;
          break;
        }

        case 'volume': {
          result = await WindowsController.setVolume(params?.level || 50);
          result.id = id;
          break;
        }

        case 'mute': {
          result = await WindowsController.toggleMute();
          result.id = id;
          break;
        }

        case 'open': {
          result = await WindowsController.openAppOrUrl(params?.target);
          result.id = id;
          break;
        }

        case 'clipboard': {
          result = await WindowsController.setClipboard(params?.text || '');
          result.id = id;
          break;
        }

        case 'notify': {
          result = await WindowsController.showToastNotification(params?.title, params?.message);
          result.id = id;
          break;
        }

        case 'shutdown': {
          result = await WindowsController.shutdown(params?.minutes || 0);
          result.id = id;
          break;
        }

        case 'cancel_shutdown': {
          result = await WindowsController.cancelShutdown();
          result.id = id;
          break;
        }

        case 'sleep': {
          result = await WindowsController.sleep();
          result.id = id;
          break;
        }

        default:
          result = { id, success: false, error: `Hành động "${action}" không được hỗ trợ.` };
      }
    } catch (execErr) {
      result = { id, success: false, error: execErr.message };
    }

    // Gửi kết quả ngược lại cho Server Render
    await axios.post(`${SERVER_URL}/pc/result`, result, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });

    console.log(chalk.green(`✅ [Đã Phản Hồi]: ${result.message || 'Thành công'}\n`));
  } catch (err) {
    if (!err.message.includes('ECONNREFUSED') && !err.message.includes('timeout')) {
      console.error(chalk.red('⚠️ [Client Error]:'), err.message);
    }
  } finally {
    isProcessing = false;
  }
}

// Bắt đầu vòng lặp thăm dò máy chủ
setInterval(pollServer, POLL_INTERVAL_MS);
pollServer();
