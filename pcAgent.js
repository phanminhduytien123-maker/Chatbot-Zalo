import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Địa chỉ máy chủ Cloud Render của Diana
const SERVER_URL = process.env.BOT_SERVER_URL || 'https://diana-h73u.onrender.com';
const POLL_INTERVAL_MS = 1500;
const LOG_FILE = path.join(__dirname, 'pc_agent.log');
const PID_FILE = path.join(__dirname, '.pc_agent.pid');

// Ghi PID của tiến trình hiện tại
try {
  fs.writeFileSync(PID_FILE, process.pid.toString(), 'utf8');
} catch (_) {}

process.on('exit', () => {
  try {
    if (fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, 'utf8').trim() === process.pid.toString()) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (_) {}
});

// Chống crash toàn cục khi gặp ngoại lệ bất ngờ
process.on('uncaughtException', (err) => {
  logToFile(`🔥 Uncaught Exception: ${err.stack || err.message}`, 'FATAL');
});

process.on('unhandledRejection', (reason) => {
  logToFile(`🔥 Unhandled Rejection: ${reason}`, 'FATAL');
});

/**
 * Ghi log ra file để theo dõi khi chạy ngầm không có cửa sổ terminal
 */
function logToFile(msg, type = 'INFO') {
  const time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const line = `[${time}] [${type}] ${msg}\n`;
  try {
    // Giữ file log tối đa 2MB
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) {
      const content = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-500).join('\n');
      fs.writeFileSync(LOG_FILE, content);
    }
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) {}
}

function log(msg, chalkFn = chalk.white, type = 'INFO') {
  try {
    if (process.stdout && typeof process.stdout.write === 'function') {
      console.log(chalkFn(msg));
    }
  } catch (_) {}
  logToFile(msg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''), type);
}

log('╔══════════════════════════════════════════════════════════╗', chalk.cyan.bold);
log('║       🚀 DIANA WINDOWS CLIENT AGENT (TIẾN PC)            ║', chalk.cyan.bold);
log('╚══════════════════════════════════════════════════════════╝', chalk.cyan.bold);
log(`📡 Máy chủ kết nối: ${SERVER_URL}`, chalk.green);
log('🔄 Đang lắng nghe lệnh điều khiển từ Zalo (Chế độ chạy ngầm & Tự động nạp lệnh mới)...\n', chalk.yellow);

// -------------------------------------------------------------
// HỆ THỐNG TỰ ĐỘNG NẠP LẠI (HOT-RELOAD / AUTO-RESET KHI CÓ CODE MỚI)
// -------------------------------------------------------------
let WindowsController = null;
const PROCESS_START_TIME = Date.now();

async function loadController() {
  try {
    // Sử dụng query param timestamp để bỏ qua cache ESM của Node.js khi cập nhật code
    const controllerModule = await import(`./src/pc/windowsController.js?update=${Date.now()}`);
    WindowsController = controllerModule.default || controllerModule.WindowsController;
    log('⚡ [Hot-Reload]: Đã nạp thành công module điều khiển Windows mới nhất!', chalk.green);
  } catch (err) {
    log(`❌ Lỗi nạp WindowsController: ${err.message}`, chalk.red, 'ERROR');
  }
}

// Nạp lần đầu
await loadController();

// Thiết lập giám sát file (File Watcher) để tự động reset/nạp lại khi có code mới
let reloadDebounce = null;
const pcDir = path.join(__dirname, 'src', 'pc');

function handleFileChange(filename) {
  if (Date.now() - PROCESS_START_TIME < 2000) return; // Bỏ qua các sự kiện kích hoạt lúc khởi động

  if (reloadDebounce) clearTimeout(reloadDebounce);
  reloadDebounce = setTimeout(async () => {
    log(`\n🔔 [Phát hiện cập nhật]: File "${filename}" đã thay đổi!`, chalk.magenta.bold);
    log('🔄 Đang tự động nạp lại các lệnh và module điều khiển mới...', chalk.yellow);
    await loadController();
  }, 1000);
}

if (fs.existsSync(pcDir)) {
  try {
    fs.watch(pcDir, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith('.js')) {
        handleFileChange(filename);
      }
    });
  } catch (_) {}
}

// Giám sát file pcAgent.js chính nếu có cập nhật cốt lõi
try {
  let agentDebounce = null;
  fs.watchFile(__filename, { interval: 2000 }, (curr, prev) => {
    // Chỉ kích hoạt khi file thực sự bị sửa đổi sau khi tiến trình đã chạy
    if (prev.mtimeMs > 0 && curr.mtimeMs > prev.mtimeMs) {
      if (agentDebounce) clearTimeout(agentDebounce);
      agentDebounce = setTimeout(() => {
        log('🔄 Phát hiện cập nhật pcAgent.js! Đang tự động khởi động lại tiến trình...', chalk.yellow.bold);
        const child = spawn(process.argv[0], [process.argv[1]], {
          cwd: __dirname,
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        process.exit(0);
      }, 1000);
    }
  });
} catch (_) {}

// -------------------------------------------------------------
// VÒNG LẶP THĂM DÒ VÀ THỰC THI LỆNH TỪ CLOUD
// -------------------------------------------------------------
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
    log(`⚡ [Nhận Lệnh Zalo]: "${command.action}" ${JSON.stringify(command.params || '')}`, chalk.magenta.bold);

    const { id, action, params } = command;
    let result = { id, success: false, message: '' };

    if (!WindowsController) {
      await loadController();
    }

    try {
      switch (action) {
        case 'lock': {
          result = await WindowsController.lockScreen();
          result.id = id;
          break;
        }

        case 'unlock': {
          result = await WindowsController.unlockScreen(params?.password || '/');
          result.id = id;
          break;
        }

        case 'turnoff_display': {
          result = await WindowsController.turnOffDisplay();
          result.id = id;
          break;
        }

        case 'wake_display': {
          result = await WindowsController.wakeDisplay();
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

    if (!result.message && result.error) {
      result.message = result.error;
    }

    // Gửi kết quả ngược lại cho Server Render
    await axios.post(`${SERVER_URL}/pc/result`, result, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });

    log(`✅ [Đã Phản Hồi]: ${result.message || 'Thành công'}\n`, chalk.green);
  } catch (err) {
    if (!err.message.includes('ECONNREFUSED') && !err.message.includes('timeout')) {
      log(`⚠️ [Client Network/Poll Notice]: ${err.message}`, chalk.gray, 'WARN');
    }
  } finally {
    isProcessing = false;
  }
}

// Bắt đầu vòng lặp thăm dò máy chủ
setInterval(pollServer, POLL_INTERVAL_MS);
pollServer();


