import axios from 'axios';
import http from 'http';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';
import chalk from 'chalk';
import { bambuService } from './src/services/bambuService.js';
import secretMemory from './src/services/secretMemory.js';
import secretRoleplay from './src/ai/secretRoleplay.js';
import phoneStorage from './src/services/phoneStorageService.js';
import dianaImageService, { DIANA_CHARACTER_STATES } from './src/services/dianaImageService.js';

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
let lastNfcTapTime = 0;

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
          result = await WindowsController.startPhoneMirror(params?.target, params?.mode || 'mirror');
          result.id = id;
          break;
        }

        case 'phone_mirror_toggle':
        case 'toggle_phone_mirror': {
          result = await WindowsController.togglePhoneMirror(params?.target, params?.mode || 'mirror');
          result.id = id;
          break;
        }

        case 'start_phone_dual': {
          result = await WindowsController.startPhoneMirror(params?.target, 'dual');
          result.id = id;
          break;
        }

        case 'phone_dual_toggle':
        case 'toggle_phone_dual': {
          result = await WindowsController.togglePhoneDualScreen(params?.target);
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

        case 'bambu_status': {
          if (!bambuService.connected && !bambuService.isConnecting && bambuService.config.accessCode) {
            if (bambuService.config.ip) {
              await bambuService.connect().catch(() => {});
            }
            if (!bambuService.connected) {
              await bambuService.autoDiscoverAndConnect().catch(() => {});
            }
            await new Promise(r => setTimeout(r, 500));
          }
          result = { id, success: true, status: bambuService.status, config: bambuService.config };
          break;
        }

        case 'bambu_config': {
          result = { id, success: true, config: bambuService.config };
          break;
        }

        case 'bambu_scan': {
          const scanRes = await bambuService.scanLanPrinters();
          result = { id, ...scanRes };
          break;
        }

        case 'bambu_connect': {
          const connRes = await bambuService.connect(params || {});
          result = { id, ...connRes };
          break;
        }

        case 'bambu_disconnect': {
          const discRes = bambuService.disconnect();
          result = { id, ...discRes };
          break;
        }

        case 'bambu_action': {
          const act = params?.action;
          let actRes = { success: false, error: 'Hành động không hợp lệ' };
          if (act === 'gcode') actRes = await bambuService.sendGcode(params.gcode || '');
          else if (act === 'set_temp') {
            if (params.target === 'nozzle') actRes = await bambuService.setNozzleTemp(params.value);
            else actRes = await bambuService.setBedTemp(params.value);
          }
          else if (act === 'set_speed') actRes = await bambuService.setPrintSpeed(params.level);
          else if (act === 'set_light') actRes = await bambuService.setLight(params.state);
          else if (act === 'set_fan') actRes = await bambuService.setFanSpeed(params.fanType || 'part', params.speed);
          else if (act === 'pause') actRes = await bambuService.pausePrint();
          else if (act === 'resume') actRes = await bambuService.resumePrint();
          else if (act === 'stop') actRes = await bambuService.stopPrint();
          else if (act === 'jog') actRes = await bambuService.jog(params.axis, params.distance);
          else if (act === 'home') actRes = await bambuService.home(params.axes || 'all');
          else if (act === 'feed') actRes = await bambuService.feedFilament(params.amount || 10);
          else if (act === 'skip_objects' || act === 'skip_part') actRes = await bambuService.skipObjects(params.obj_list || params.objId || params.ids);
          else if (act === 'get_plate_info' || act === 'plate_info') actRes = { success: true, plate_info: bambuService.getPlateInfo() };
          else if (act === 'fetch_plate' || act === 'refresh_plate') actRes = await bambuService.fetchPlateInfoFromPrinter(params.force === true);
          else if (act === 'parse_3mf' && params.base64) {
            const buf = Buffer.from(params.base64, 'base64');
            actRes = { success: true, plate_info: await bambuService.parse3mfBuffer(buf, params.fileName || 'custom.3mf') };
          }
          else if (act === 'discover' || act === 'scan') actRes = await bambuService.autoDiscoverAndConnect();
          result = { id, ...actRes };
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
const NFC_CONFIG_FILE = path.join(__dirname, 'data', 'nfc_config.json');

function getNfcConfig() {
  try {
    if (fs.existsSync(NFC_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(NFC_CONFIG_FILE, 'utf8'));
    }
  } catch (_) {}
  return {
    tags: [
      { id: '6C7CAE67', name: 'Cuộn Bambu #1 (Trắng/PLA)', action: 'toggle_mirror', description: 'Bật/tắt chức năng chiếu màn hình (mặc định)' },
      { id: '4C50A167', name: 'Cuộn Bambu #2 (Đen/PETG)', action: 'toggle_station', description: 'Bật/tắt Diana Station trên máy tính (mặc định)' }
    ],
    availableActions: [
      { id: 'toggle_mirror', icon: '📱', label: 'Bật / Tắt Chiếu Màn Hình (Scrcpy 60FPS)', desc: 'Chiếu màn hình điện thoại mượt mà lên PC, điều khiển chuột & phím' },
      { id: 'toggle_station', icon: '🖥️', label: 'Bật / Tắt Trạm Diana Central Station', desc: 'Bật hoặc thu gọn Trạm điều khiển trung tâm Diana trên máy tính' },
      { id: 'toggle_both', icon: '⚡', label: 'Đồng Bộ Song Song Cả Hai (Trạm + Chiếu Màn Hình)', desc: 'Bật / tắt cùng lúc cả Trạm Diana Central Station và Chiếu màn hình' },
      { id: 'toggle_dual', icon: '🌐', label: 'Màn Hình Ảo Song Song Độc Lập (Dual Display)', desc: 'Mở màn hình Android ảo thứ 2 trên PC, điện thoại thật vẫn tự do lướt web' },
      { id: 'lock_pc', icon: '🔒', label: 'Khóa Máy Tính Tức Thì (Quick Lock PC)', desc: 'Khóa màn hình máy tính ngay lập tức (Win + L) khi rời bàn làm việc' },
      { id: 'sleep_pc', icon: '🌙', label: 'Đưa Máy Tính Vào Chế Độ Ngủ (Sleep)', desc: 'Tắt màn hình và đưa PC về trạng thái Sleep tiết kiệm điện' },
      { id: 'focus_mode', icon: '🎧', label: 'Chế Độ Tập Trung & Chill Làm Việc (Studio Focus)', desc: 'Mở trạm Diana, đặt âm lượng 40% và mở không gian làm việc tập trung' },
      { id: 'bambu_status', icon: '🖨️', label: 'Kiểm Tra Trạng Thái Máy In Bambu Lab A1 mini', desc: 'Diana đọc to tiến độ in, nhiệt độ đầu đùn và mở camera máy in' },
      { id: 'pc_screenshot', icon: '📸', label: 'Chụp Màn Hình PC Gửi Sang Điện Thoại', desc: 'Tự động chụp nhanh màn hình PC và lưu vào bộ nhớ ảnh' }
    ],
    lastScanned: null
  };
}

function saveNfcConfig(cfg) {
  try {
    const dir = path.dirname(NFC_CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(NFC_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

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
        const mode = parsedUrl.searchParams.get('mode') || 'mirror';
        log(`📱 [LAN HTTP Request]: Nhận lệnh TOGGLE Mirror (${target || 'Auto'}, mode: ${mode}) từ Phone App`, chalk.cyan.bold);
        const result = WindowsController ? await WindowsController.togglePhoneMirror(target, mode) : { success: false, error: 'WindowsController chưa sẵn sàng' };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }

      // 2.05 NFC / RFID Tap Quick Trigger (Xử lý chạm thẻ theo cấu hình)
      if (pathname === '/api/nfc/mirror' || pathname === '/api/nfc/trigger') {
        const mode = parsedUrl.searchParams.get('mode') || 'mirror';
        const rawAction = parsedUrl.searchParams.get('action') || '';
        const now = Date.now();
        if (lastNfcTapTime && (now - lastNfcTapTime < 2500)) {
          log(`⏳ [NFC Debounce]: Bỏ qua chạm lặp trong vòng 2.5s (Cooldown)`, chalk.yellow);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, debounced: true }));
        }
        lastNfcTapTime = now;
        let clientIp = target;
        if (!clientIp) {
          const rawIp = req.socket?.remoteAddress || '';
          const cleanIp = rawIp.replace(/^.*:/, '').trim();
          if (cleanIp && cleanIp !== '127.0.0.1' && cleanIp !== 'localhost') {
            clientIp = `${cleanIp}:5555`;
          }
        }
        const tagId = (parsedUrl.searchParams.get('tagId') || '').trim().toUpperCase();

        const nfcConfig = getNfcConfig();
        // Cập nhật thẻ vừa quét gần nhất để giao diện Settings hiển thị tức thì
        if (tagId) {
          nfcConfig.lastScanned = {
            id: tagId,
            time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            timestamp: now
          };
          saveNfcConfig(nfcConfig);
        }

        // Tìm thẻ trong cấu hình
        const matchedTag = nfcConfig.tags?.find(t => (t.id || '').toUpperCase() === tagId);
        // Xác định hành động: ưu tiên theo cấu hình của thẻ
        let chosenAction = matchedTag ? matchedTag.action : (rawAction || 'toggle_mirror');

        // Mặc định cho 2 thẻ nếu cấu hình chưa có:
        if (!matchedTag) {
          if (tagId === '6C7CAE67') chosenAction = 'toggle_mirror';
          else if (tagId === '4C50A167') chosenAction = 'toggle_station';
        }

        const tagName = matchedTag ? matchedTag.name : (tagId ? `Thẻ RFID ${tagId}` : 'Chưa rõ thẻ');
        log(`🏷️ [NFC Tap Trigger]: Chạm [${tagName}] (UID: ${tagId || 'N/A'}) ➔ Hành động: "${chosenAction}"`, chalk.magenta.bold);

        let result = { success: true };

        switch (chosenAction) {
          case 'toggle_mirror': {
            log(`📱 [NFC Action]: Bật/Tắt Chiếu màn hình Scrcpy...`, chalk.cyan.bold);
            if (WindowsController) {
              result = await WindowsController.togglePhoneMirror(clientIp, 'mirror');
            }
            break;
          }

          case 'toggle_station': {
            log(`🖥️ [NFC Action]: Bật/Tắt Trạm Diana Central Station...`, chalk.cyan.bold);
            if (WindowsController) {
              result = await WindowsController.toggleDianaStation();
            }
            break;
          }

          case 'toggle_both': {
            log(`⚡ [NFC Action]: Bật/Tắt Đồng thời cả Trạm và Chiếu màn hình...`, chalk.yellow.bold);
            const isMirror = WindowsController ? await WindowsController.isPhoneMirrorRunning() : false;
            const isStation = WindowsController ? await WindowsController.isDianaStationRunning() : false;
            if (isMirror || isStation) {
              if (WindowsController) {
                WindowsController.stopDianaStation();
                result = WindowsController.stopPhoneMirror();
              }
            } else {
              if (WindowsController) {
                WindowsController.startDianaStation();
                result = await WindowsController.startPhoneMirror(clientIp, 'mirror');
              }
            }
            break;
          }

          case 'toggle_dual': {
            log(`🌐 [NFC Action]: Bật/Tắt Màn hình phụ ảo độc lập (Dual Display)...`, chalk.blue.bold);
            if (WindowsController) {
              result = await WindowsController.togglePhoneDualScreen(clientIp);
            }
            break;
          }

          case 'lock_pc': {
            log(`🔒 [NFC Action]: Khóa màn hình PC tức thì...`, chalk.red.bold);
            if (WindowsController) {
              result = await WindowsController.lockScreen();
              WindowsController.showToastNotification('🔒 Khóa Máy Tính', `Đã khóa màn hình theo thẻ [${tagName}]!`);
            }
            break;
          }

          case 'sleep_pc': {
            log(`🌙 [NFC Action]: Đưa máy tính vào chế độ Sleep...`, chalk.magenta.bold);
            if (WindowsController) {
              WindowsController.showToastNotification('🌙 Chế Độ Ngủ', `Đang chuyển máy tính sang Sleep theo thẻ [${tagName}]...`);
              result = await WindowsController.sleep();
            }
            break;
          }

          case 'focus_mode': {
            log(`🎧 [NFC Action]: Kích hoạt Chế độ Studio Focus...`, chalk.green.bold);
            if (WindowsController) {
              WindowsController.setVolume(40);
              WindowsController.startDianaStation();
              WindowsController.showToastNotification('🎧 Studio Focus Mode', 'Đã đặt âm lượng 40% và mở Trạm Diana để làm việc!');
            }
            break;
          }

          case 'bambu_status': {
            log(`🖨️ [NFC Action]: Kiểm tra trạng thái máy in Bambu Lab A1 mini...`, chalk.magenta.bold);
            const bStatus = bambuService ? bambuService.status : null;
            const printState = bStatus?.gcode_state || 'IDLE';
            const progress = bStatus?.mc_percent || 0;
            const nozzleTemp = bStatus?.nozzle_temper || 0;
            const bedTemp = bStatus?.bed_temper || 0;
            const msg = `Máy in Bambu Lab: Trạng thái ${printState}, tiến độ ${progress}%, nhiệt độ đầu ${nozzleTemp}°C, bàn in ${bedTemp}°C.`;
            if (WindowsController) {
              WindowsController.showToastNotification('🖨️ Bambu Lab A1 mini', msg);
            }
            result = { success: true, message: msg, bambuStatus: bStatus };
            break;
          }

          case 'pc_screenshot': {
            log(`📸 [NFC Action]: Chụp ảnh màn hình PC...`, chalk.cyan.bold);
            if (WindowsController) {
              result = await WindowsController.takeScreenshot();
              WindowsController.showToastNotification('📸 Đã Chụp Màn Hình PC', 'Ảnh chụp màn hình đã được lưu thành công!');
            }
            break;
          }

          default: {
            if (WindowsController) {
              result = await WindowsController.togglePhoneMirror(clientIp, 'mirror');
            }
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ...result,
          nfcTriggered: true,
          tagId,
          tagName,
          action: chosenAction
        }));
      }

      // 2.06 API Quản lý Cấu hình Thẻ NFC/RFID
      if (pathname === '/api/nfc/config') {
        if (req.method === 'GET') {
          const cfg = getNfcConfig();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, ...cfg }));
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const currentCfg = getNfcConfig();
              if (Array.isArray(data.tags)) {
                currentCfg.tags = data.tags;
              }
              saveNfcConfig(currentCfg);
              log(`💾 [NFC Config]: Đã cập nhật cấu hình thẻ RFID thành công!`, chalk.green.bold);
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({ success: true, ...currentCfg }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }
      }

      // 2.1 Toggle Điện Thoại Song Song Độc Lập
      if (pathname === '/api/phone/dual/toggle' || pathname === '/api/phone/dual/start') {
        log(`⚡ [LAN HTTP Request]: Nhận lệnh DUAL SCREEN Phone (${target || 'Auto'}) từ Phone App`, chalk.cyan.bold);
        const result = WindowsController ? await WindowsController.togglePhoneDualScreen(target) : { success: false, error: 'WindowsController chưa sẵn sàng' };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }

      // 3. Start Chiếu Màn Hình
      if (pathname === '/api/phone/mirror/start') {
        const mode = parsedUrl.searchParams.get('mode') || 'mirror';
        log(`📱 [LAN HTTP Request]: Nhận lệnh START Mirror (${target || 'Auto'}, mode: ${mode}) từ Phone App`, chalk.cyan.bold);
        const result = WindowsController ? await WindowsController.startPhoneMirror(target, mode) : { success: false, error: 'WindowsController chưa sẵn sàng' };
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

      // 6.1 Wake Listener ("Diana ơi" - Siri Mode)
      if (pathname === '/api/wake-listener/toggle') {
        const isRunning = WindowsController && typeof WindowsController.isWakeListenerRunning === 'function' ? await WindowsController.isWakeListenerRunning() : false;
        let result;
        if (isRunning) {
          result = await WindowsController.stopWakeListener();
        } else {
          result = await WindowsController.startWakeListener();
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }

      if (pathname === '/api/wake-listener/status') {
        const active = WindowsController && typeof WindowsController.isWakeListenerRunning === 'function' ? await WindowsController.isWakeListenerRunning() : false;
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

      // 6.5 BAMBU LAB A1 3D PRINTER LAN API
      if (pathname === '/api/bambu/camera.mjpg' || pathname === '/api/bambu/camera/stream') {
        return bambuService.handleMjpegStream(req, res);
      }

      if (pathname === '/api/bambu/camera/snapshot' || pathname === '/api/bambu/camera/frame') {
        const frame = bambuService.getCameraSnapshot();
        if (frame) {
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(frame);
        } else {
          res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, error: 'Khung hình camera đang kết nối...' }));
        }
      }

      if (pathname === '/api/bambu/status') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          status: bambuService.status,
          config: bambuService.config
        }));
      }

      if (pathname === '/api/bambu/config') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          config: bambuService.config
        }));
      }

      if (pathname === '/api/bambu/scan') {
        const scanRes = await bambuService.scanLanPrinters();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(scanRes));
      }

      if (pathname === '/api/bambu/connect' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const creds = JSON.parse(body || '{}');
            const result = await bambuService.connect(creds);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }

      if (pathname === '/api/bambu/disconnect' && req.method === 'POST') {
        const result = bambuService.disconnect();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }

      if (pathname === '/api/bambu/action' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const act = data.action;
            let result = { success: false, error: 'Hành động không hợp lệ' };

            if (act === 'gcode') result = await bambuService.sendGcode(data.gcode || '');
            else if (act === 'set_temp') {
              if (data.target === 'nozzle') result = await bambuService.setNozzleTemp(data.value);
              else result = await bambuService.setBedTemp(data.value);
            }
            else if (act === 'set_speed') result = await bambuService.setPrintSpeed(data.level);
            else if (act === 'set_light') result = await bambuService.setLight(data.state);
            else if (act === 'set_fan') result = await bambuService.setFanSpeed(data.fanType || 'part', data.speed);
            else if (act === 'pause') result = await bambuService.pausePrint();
            else if (act === 'resume') result = await bambuService.resumePrint();
            else if (act === 'stop') result = await bambuService.stopPrint();
            else if (act === 'jog') result = await bambuService.jog(data.axis, data.distance);
            else if (act === 'home') result = await bambuService.home(data.axes || 'all');
            else if (act === 'feed') result = await bambuService.feedFilament(data.amount || 10);
            else if (act === 'skip_objects' || act === 'skip_part') result = await bambuService.skipObjects(data.obj_list || data.objId || data.ids);
            else if (act === 'get_plate_info' || act === 'plate_info') result = { success: true, plate_info: bambuService.getPlateInfo() };
            else if (act === 'fetch_plate' || act === 'refresh_plate') result = await bambuService.fetchPlateInfoFromPrinter(data.force === true);
            else if (act === 'parse_3mf' && data.base64) {
              const buf = Buffer.from(data.base64, 'base64');
              result = { success: true, plate_info: await bambuService.parse3mfBuffer(buf, data.fileName || 'custom.3mf') };
            }
            else if (act === 'discover' || act === 'scan') result = await bambuService.autoDiscoverAndConnect();

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
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
            else if (act === 'open') {
              const target = data.target || data.params?.target || data.app;
              actResult = await WindowsController.openAppOrUrl(target);
            }
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

            if (lower.includes('màn hình song song') || lower.includes('điện thoại song song') || lower.includes('dual screen') || lower.includes('màn hình phụ')) {
              const dualRes = await WindowsController.startPhoneMirror('', 'dual');
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
                success: true,
                query,
                reply: dualRes.success ? '⚡ Dạ em đã mở màn hình điện thoại song song độc lập trên máy tính cho anh rồi ạ! Màn hình điện thoại thật của anh hoàn toàn tự do ạ! 🌸' : `❌ ${dualRes.error || 'Lỗi mở màn hình song song'}`
              }));
            }

            if (lower.includes('chiếu màn hình') || lower.includes('mirror phone') || lower.includes('scrcpy') || lower.includes('chiếu điện thoại')) {
              const mirrorRes = await WindowsController.startPhoneMirror('', 'mirror');
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
                success: true,
                query,
                reply: mirrorRes.success ? '📱 Dạ em đã bật cửa sổ chiếu màn hình điện thoại 60 FPS lên máy tính của anh rồi ạ! 🌸' : `❌ ${mirrorRes.error || 'Lỗi bật chiếu màn hình'}`
              }));
            }

            // Lệnh xem giờ
            if (lower.includes('mấy giờ') || lower.includes('bây giờ là') || lower.includes('thời gian hiện tại')) {
              const now = new Date();
              const timeStr = `Bây giờ là ${now.getHours()} giờ ${String(now.getMinutes()).padStart(2, '0')} phút ạ! 🌸`;
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({ success: true, query, reply: timeStr }));
            }
            // Lệnh mở ứng dụng / web bất kỳ (mở zalo, mở chrome, mở bambu studio, mở word, v.v.)
            if (lower.startsWith('mở ') || lower.startsWith('bật ') || lower.startsWith('chạy ') || lower.startsWith('open ')) {
              const targetApp = query.replace(/^(?:mở|bật|chạy|open)\s+/i, '').replace(/\s+(?:cho\s+anh|hộ\s+anh|giúp\s+anh|đi|nha|ạ)$/i, '').trim();
              if (targetApp && !lower.includes('bật đèn') && !lower.includes('máy in') && WindowsController) {
                const openRes = await WindowsController.openAppOrUrl(targetApp);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                  success: true,
                  query,
                  reply: openRes.success ? `Dạ em đã mở ứng dụng ${targetApp} cho anh rồi ạ! 🌸` : (openRes.error || `Dạ em đang khởi chạy ${targetApp} ạ!`)
                }));
              }
            }

            // Lệnh mở YouTube
            if (lower.includes('youtube')) {
              if (WindowsController) WindowsController.openAppOrUrl('https://www.youtube.com');
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({ success: true, query, reply: 'Dạ em đã mở YouTube trên máy tính cho anh rồi ạ! 🌸' }));
            }

            // Lệnh mở Facebook
            if (lower.includes('facebook')) {
              if (WindowsController) WindowsController.openAppOrUrl('https://www.facebook.com');
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({ success: true, query, reply: 'Dạ em đã mở Facebook cho anh rồi ạ! 🌸' }));
            }

            // Lệnh truy vấn máy in 3D Bambu Lab A1 mini
            if (lower.includes('máy in') || lower.includes('3d') || lower.includes('bambu') || lower.includes('đầu in') || lower.includes('bàn in') || lower.includes('bản in')) {
              const b = bambuService.status;
              let printerReply = '';
              if (lower.includes('nhiệt độ')) {
                printerReply = `🌡️ [Nhiệt độ Bambu A1 mini]: Đầu phun (Nozzle) hiện tại là ${b.nozzle_temper}°C (Mục tiêu: ${b.nozzle_target_temper}°C), Bàn in (Bed) là ${b.bed_temper}°C (Mục tiêu: ${b.bed_target_temper}°C).`;
              } else if (lower.includes('dừng') || lower.includes('tạm dừng')) {
                await bambuService.pausePrint();
                printerReply = `⏸️ Dạ em đã gửi lệnh tạm dừng in tới máy in Bambu Lab A1 mini rồi ạ! 🌸`;
              } else if (lower.includes('tiếp tục') || lower.includes('in tiếp')) {
                await bambuService.resumePrint();
                printerReply = `▶️ Dạ em đã gửi lệnh tiếp tục in tới máy in Bambu Lab A1 mini rồi ạ! 🌸`;
              } else if (lower.includes('bật đèn')) {
                await bambuService.setLight(true);
                printerReply = `💡 Dạ em đã bật đèn buồng in Bambu Lab A1 mini cho anh rồi ạ! 🌸`;
              } else if (lower.includes('tắt đèn')) {
                await bambuService.setLight(false);
                printerReply = `💡 Dạ em đã tắt đèn buồng in Bambu Lab A1 mini rồi ạ! 🌸`;
              } else {
                const stateStr = b.gcode_state === 'RUNNING' ? 'Đang in' : (b.gcode_state === 'PAUSE' ? 'Tạm dừng' : (b.gcode_state === 'PREPARE' ? 'Đang chuẩn bị / Gia nhiệt' : 'Đang chờ (Idle)'));
                printerReply = `🖨️ [Bambu Lab A1 mini]: Trạng thái: ${stateStr} | Tệp: ${b.subtask_name || 'Không có'} | Tiến độ: ${b.mc_percent}% (Lớp ${b.layer_num}/${b.total_layer_num}) | Còn lại: ~${b.mc_remaining_time} phút | Đầu phun: ${b.nozzle_temper}°C | Bàn in: ${b.bed_temper}°C 🌸`;
              }

              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
                success: true,
                query,
                reply: printerReply
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

      // =========================================================
      // DIANA SECRET SANCTUARY & ISOLATED MEMORY API
      // =========================================================
      if (pathname === '/api/secret/history' && req.method === 'GET') {
        await secretMemory.syncWithPhone().catch(() => {});
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          history: secretMemory.getHistory(),
          config: secretMemory.config
        }));
      }

      if (pathname === '/api/secret/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const message = (data.message || data.text || data.query || '').trim();
            if (!message) {
              res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({ success: false, error: 'Tin nhắn không được để trống.' }));
            }

            const result = await secretRoleplay.processSecretMessage(message, data.config || null);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              success: true,
              reply: result.reply,
              isImageResponse: result.isImageResponse || false,
              imageUrl: result.imageUrl || null,
              imageBase64: result.imageBase64 || null,
              stateInfo: result.stateInfo || null,
              meta: {
                provider: result.provider,
                model: result.model,
                turnsCount: secretMemory.getHistory().length
              }
            }));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }

      if (pathname === '/api/secret/image') {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const stateName = urlObj.searchParams.get('state') || '';
        const stateObj = DIANA_CHARACTER_STATES[stateName] || null;
        const payload = dianaImageService.getImagePayload(stateObj);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(payload));
      }

      if (pathname === '/api/secret/clear' && req.method === 'POST') {
        secretMemory.clearMemory();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          message: 'Đã xóa sạch toàn bộ ký ức thầm kín trên cả PC và Điện thoại.'
        }));
      }

      if (pathname === '/api/secret/config') {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const newCfg = JSON.parse(body || '{}');
              const updated = secretMemory.saveConfig(newCfg);
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ success: true, config: updated }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ success: false, error: e.message }));
            }
          });
          return;
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, config: secretMemory.config }));
        }
      }

      if (pathname === '/api/secret/phone/status') {
        const status = await phoneStorage.getPhoneFolderStatus();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, ...status }));
      }

      if (pathname === '/api/secret/phone/sync' && req.method === 'POST') {
        const syncRes = await secretMemory.syncWithPhone();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          ...syncRes,
          turnsCount: secretMemory.getHistory().length
        }));
      }

      if (pathname === '/api/secret/phone/wipe' && req.method === 'POST') {
        const wipeRes = await phoneStorage.wipePhoneFolder();
        secretMemory.clearMemory();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          ...wipeRes,
          message: 'Đã xóa sạch thư mục /sdcard/DianaSecret/ trên điện thoại và bộ nhớ PC.'
        }));
      }

      // 10. Static Web App Files (public/ folder)
      const publicDir = path.resolve(__dirname, 'public');
      let reqPath = pathname === '/' ? '/index.html' : pathname;
      const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(publicDir, safePath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.mp3': 'audio/mpeg',
          '.webm': 'video/webm'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });
        return fs.createReadStream(filePath).pipe(res);
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

// Tự động khởi động và duy trì tính năng luôn lắng nghe "Diana ơi" (Siri Mode)
setTimeout(async () => {
  try {
    if (WindowsController && typeof WindowsController.isWakeListenerRunning === 'function') {
      const isRunning = await WindowsController.isWakeListenerRunning();
      if (!isRunning) {
        log('🎤 [Wake Listener]: Đang tự động kích hoạt tính năng lắng nghe "Diana ơi"...', chalk.magenta.bold);
        await WindowsController.startWakeListener();
      } else {
        log('🎤 [Wake Listener]: Đang hoạt động và luôn lắng nghe "Diana ơi"!', chalk.green.bold);
      }
    }
  } catch (err) {
    log(`⚠️ Lỗi khởi động Wake Listener: ${err.message}`, chalk.yellow);
  }
}, 3000);





