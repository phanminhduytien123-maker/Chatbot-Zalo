import axios from 'axios';
import http from 'http';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';
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

// Đảm bảo ADB daemon nền luôn sẵn sàng cho kết nối điện thoại
try {
  const adbPath = path.resolve(__dirname, 'tools', 'scrcpy', 'adb.exe');
  if (fs.existsSync(adbPath)) {
    execFile(adbPath, ['start-server'], { windowsHide: true }, () => {});
  }
} catch (_) {}


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
    let mirrorActive = false;
    if (WindowsController && typeof WindowsController.isPhoneMirrorRunning === 'function') {
      mirrorActive = await WindowsController.isPhoneMirrorRunning().catch(() => false);
    }

    const res = await axios.get(`${SERVER_URL}/pc/poll?mirrorActive=${mirrorActive}`, {
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
          result = await WindowsController.unlockScreen(params?.password || '\\');
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

        case 'phone_mirror':
        case 'start_phone_mirror': {
          result = await WindowsController.startPhoneMirror(params?.target);
          result.id = id;
          break;
        }

        case 'phone_mirror_toggle':
        case 'toggle_phone_mirror': {
          result = await WindowsController.togglePhoneMirror(params?.target);
          result.id = id;
          break;
        }

        case 'stop_phone_mirror': {
          result = WindowsController.stopPhoneMirror();
          result.id = id;
          break;
        }

        case 'air_gesture':
        case 'start_air_gesture': {
          result = await WindowsController.startAirGestureDetector(params?.timeout || 86400, params?.sessionData);
          result.id = id;
          break;
        }

        case 'stop_air_gesture': {
          result = WindowsController.stopAirGestureDetector();
          result.id = id;
          break;
        }

        case 'open_phone_screen_viewer':
        case 'view_phone_stream': {
          result = await WindowsController.openPhoneScreenViewer(params?.streamUrl);
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

// Tự động phát hiện khi điện thoại bật Share màn hình (Cổng 8088) để tự mở cửa sổ trên máy tính
let isStreamViewerOpen = false;
let lastStreamIp = '';

function checkPhoneLiveStream() {
  const candidateIps = ['192.168.0.105', '192.168.100.148', '192.168.100.225'];
  
  for (const ip of candidateIps) {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.on('connect', () => {
      socket.destroy();
      if (!isStreamViewerOpen || lastStreamIp !== ip) {
        isStreamViewerOpen = true;
        lastStreamIp = ip;
        log(`📱 [Phát hiện Stream từ điện thoại (${ip}:8088)]: Đang tự động mở cửa sổ trên máy tính...`, chalk.cyan.bold);
        if (WindowsController && typeof WindowsController.openPhoneScreenViewer === 'function') {
          WindowsController.openPhoneScreenViewer(`http://${ip}:8088/`);
        }
      }
    });
    socket.on('error', () => { socket.destroy(); if (lastStreamIp === ip) isStreamViewerOpen = false; });
    socket.on('timeout', () => { socket.destroy(); if (lastStreamIp === ip) isStreamViewerOpen = false; });
    try { socket.connect(8088, ip); } catch (_) {}
  }
}

// Bắt đầu vòng lặp thăm dò máy chủ
setInterval(async () => {
  await pollServer();
  checkPhoneLiveStream();
}, POLL_INTERVAL_MS);
pollServer();
checkPhoneLiveStream();

// -------------------------------------------------------------
// LOCAL HTTP LAN SERVER (PORT 3000)
// Cho phép App trên Điện thoại / Mobile Web điều khiển PC trực tiếp 0ms trên mạng LAN
// -------------------------------------------------------------
const HTTP_PORT = process.env.LOCAL_PORT || 3000;

function startLocalHttpServer() {
  const server = http.createServer(async (req, res) => {
    // CORS headers cho mọi request từ Phone App / Browser
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;
      const target = parsedUrl.searchParams.get('target') || '';

      if (!WindowsController) {
        await loadController();
      }

      // 1. Trạng thái hệ thống & Scrcpy Mirror
      if (pathname === '/api/status') {
        const mirrorActive = WindowsController ? await WindowsController.isPhoneMirrorRunning().catch(() => false) : false;
        const airActive = WindowsController && typeof WindowsController.isAirGestureRunning === 'function' 
          ? await WindowsController.isAirGestureRunning().catch(() => false) 
          : false;

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          online: true,
          pcOnline: true,
          status: 'ONLINE',
          bot: 'Diana PC Local Agent',
          uptime: `${Math.floor(process.uptime())}s`,
          mirrorActive,
          airGestureActive: airActive,
          deviceIp: '192.168.100.148:5555'
        }));
      }

      // 2. Toggle Chiếu Màn Hình (Phone Mirror)
      if (pathname === '/api/phone/mirror/toggle') {
        log(`📱 [LAN HTTP Request]: Nhận lệnh TOGGLE Mirror (${target || 'Auto'}) từ Phone App`, chalk.cyan.bold);
        const result = WindowsController ? await WindowsController.togglePhoneMirror(target) : { success: false, error: 'WindowsController chưa sẵn sàng' };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }

      // 3. Start Chiếu Màn Hình
      if (pathname === '/api/phone/mirror/start') {
        log(`📱 [LAN HTTP Request]: Nhận lệnh START Mirror (${target || 'Auto'}) từ Phone App`, chalk.cyan.bold);
        const result = WindowsController ? await WindowsController.startPhoneMirror(target) : { success: false, error: 'WindowsController chưa sẵn sàng' };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }

      // 4. Stop Chiếu Màn Hình
      if (pathname === '/api/phone/mirror/stop') {
        log(`📱 [LAN HTTP Request]: Nhận lệnh STOP Mirror từ Phone App`, chalk.yellow.bold);
        const result = WindowsController ? WindowsController.stopPhoneMirror() : { success: true };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }

      // 5. Kiểm tra trạng thái Mirror
      if (pathname === '/api/phone/mirror/status' || pathname === '/api/mirror/status') {
        const mirrorActive = WindowsController ? await WindowsController.isPhoneMirrorRunning().catch(() => false) : false;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, mirrorActive }));
      }

      // 6. Air Gesture AI
      if (pathname === '/api/air-gesture/toggle') {
        const isAir = WindowsController && typeof WindowsController.isAirGestureRunning === 'function' ? await WindowsController.isAirGestureRunning() : false;
        let result;
        if (isAir) {
          result = WindowsController.stopAirGestureDetector();
        } else {
          result = await WindowsController.startAirGestureDetector();
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }

      if (pathname === '/api/air-gesture/status') {
        const active = WindowsController && typeof WindowsController.isAirGestureRunning === 'function' ? await WindowsController.isAirGestureRunning() : false;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, active }));
      }

      // 6.2 API: Xem / Tải ảnh chụp màn hình PC mới nhất
      if (pathname === '/api/screenshot/latest' || pathname.startsWith('/api/screenshot/') || pathname.startsWith('/data/screenshots/')) {
        const screenshotDir = path.resolve(__dirname, 'data', 'screenshots');
        let targetFile = null;
        if (pathname === '/api/screenshot/latest') {
          if (fs.existsSync(screenshotDir)) {
            const files = fs.readdirSync(screenshotDir)
              .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
              .map(f => ({ name: f, time: fs.statSync(path.join(screenshotDir, f)).mtimeMs }))
              .sort((a, b) => b.time - a.time);
            if (files.length > 0) {
              targetFile = path.join(screenshotDir, files[0].name);
            }
          }
        } else {
          const fileName = path.basename(pathname);
          const possiblePath = path.join(screenshotDir, fileName);
          if (fs.existsSync(possiblePath)) {
            targetFile = possiblePath;
          }
        }

        if (targetFile && fs.existsSync(targetFile)) {
          res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          });
          return fs.createReadStream(targetFile).pipe(res);
        } else {
          res.writeHead(404, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Chưa có ảnh chụp màn hình nào.' }));
        }
      }

      // 7. Lệnh điều khiển PC trực tiếp (lock, sleep, etc.)
      if (pathname === '/pc/action' || pathname === '/api/pc/action') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const act = data.action;
            let actResult = { success: false };
            if (act === 'lock') actResult = await WindowsController.lockScreen();
            else if (act === 'sleep') actResult = await WindowsController.sleep();
            else if (act === 'screenshot') {
              const scr = await WindowsController.takeScreenshot();
              let screenshotBase64 = null;
              if (scr.success && scr.filePath && fs.existsSync(scr.filePath)) {
                screenshotBase64 = fs.readFileSync(scr.filePath, 'base64');
              }
              actResult = { ...scr, screenshotBase64 };
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(actResult));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }

      // 8. Trợ lý AI & Lệnh thoại trực tiếp (Voice Assistant Text)
      if (pathname === '/api/voice' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const query = (data.query || data.text || '').trim();
            const lower = query.toLowerCase();

            // Xử lý tức thì các lệnh phần cứng máy tính trực tiếp
            if (lower.includes('chụp màn') || lower.includes('chụp ảnh màn') || lower.includes('chụp pc') || lower.includes('screenshot') || lower.includes('chụp ảnh máy')) {
              const screen = await WindowsController.takeScreenshot();
              let screenshotBase64 = null;
              if (screen.success && screen.filePath && fs.existsSync(screen.filePath)) {
                screenshotBase64 = fs.readFileSync(screen.filePath, 'base64');
              }
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
                success: true,
                query,
                reply: {
                  text: '📸 Dạ em đã chụp ảnh màn hình máy tính của anh Tiến rồi đây ạ! 🌸',
                  screenshotBase64
                }
              }));
            }

            if (lower.includes('khóa máy') || lower.includes('khóa pc') || lower.includes('lock pc') || lower === 'khóa') {
              const lockRes = await WindowsController.lockScreen();
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
                success: true,
                query,
                reply: lockRes.success ? '🔒 Dạ em đã khóa màn hình máy tính của anh rồi ạ! 🌸' : '❌ Lỗi khóa máy tính.'
              }));
            }

            if (lower.includes('chiếu màn hình') || lower.includes('mirror phone') || lower.includes('scrcpy') || lower.includes('chiếu điện thoại')) {
              const mirrorRes = await WindowsController.startPhoneMirror();
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
                success: true,
                query,
                reply: mirrorRes.success ? '📱 Dạ em đã bật cửa sổ chiếu màn hình điện thoại 60 FPS lên máy tính của anh rồi ạ! 🌸' : `❌ ${mirrorRes.error || 'Lỗi bật chiếu màn hình'}`
              }));
            }

            // Chuyển tiếp các câu hỏi AI tổng quát (thời tiết, điểm số, trò chuyện) lên Render Cloud
            try {
              const cloudRes = await axios.post(`${SERVER_URL}/api/voice`, { query }, {
                timeout: 15000,
                headers: { 'Content-Type': 'application/json' }
              });
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify(cloudRes.data));
            } catch (cloudErr) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
                success: true,
                query,
                reply: `Dạ em đã nhận được lệnh "${query}" từ anh Tiến! 🌸`
              }));
            }
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }

      // 9. API: Voice Audio File STT (Proxy sang Cloud)
      if (pathname === '/api/voice-audio' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const cloudRes = await axios.post(`${SERVER_URL}/api/voice-audio`, body, {
              timeout: 15000,
              headers: { 'Content-Type': 'application/json' }
            });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(cloudRes.data));
          } catch (cloudErr) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: cloudErr.message }));
          }
        });
        return;
      }

      // Fallback: 404
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: 'Endpoint không tồn tại' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    log(`🌐 [LAN Server]: Đang mở cổng HTTP ${HTTP_PORT} (0.0.0.0:${HTTP_PORT}) để Phone App kết nối siêu tốc!`, chalk.cyan.bold);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log(`⚠️ Cổng ${HTTP_PORT} đang bận, tiến trình khác đã lắng nghe trên cổng này.`, chalk.yellow);
    } else {
      log(`⚠️ Lỗi HTTP Server: ${err.message}`, chalk.red);
    }
  });
}

startLocalHttpServer();





