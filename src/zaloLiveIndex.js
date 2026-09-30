process.env.TZ = 'Asia/Ho_Chi_Minh';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import config from './config/config.js';
import aiAssistant from './ai/gemini.js';
import { zaloLive } from './zalo/zaloLive.js';
import { monitor } from './services/monitor.js';
import { storage } from './services/storage.js';
import { scheduler } from './services/scheduler.js';
import { MessageHandler } from './zalo/messageHandler.js';
import { pcBridge } from './pc/pcBridge.js';
import WindowsController from './pc/windowsController.js';
import VoiceNormalizer from './services/voiceNormalizer.js';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');
const dataDir = path.resolve(__dirname, '..', 'data');

// Biến lưu trữ phiên trò chuyện vừa được chụm cử chỉ (Air Gesture Grab)
let latestAirGrabSession = null;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive'
};

// Khởi tạo HTTP Web Service & Voice Assistant Server cho Render.com
const PORT = process.env.PORT || 3000;
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost:3000';
  const url = new URL(req.url, `http://${host}`);
  
  // CORS Headers cho Mobile Capacitor & Web Client
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // 0. API: Status & Heartbeat Endpoint (Dành cho Android Capacitor AutoDiscover)
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: true,
      status: 'ONLINE',
      pcOnline: pcBridge.isPCOnline(),
      zaloConnected: zaloLive.isConnected,
      platform: process.platform,
      time: new Date().toISOString()
    }));
  }

  // 1.0 API: Speech-to-Text Endpoint (STT thuần - chuyển âm thanh thành văn bản chính xác 100%)
  if (url.pathname === '/api/stt' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const audioBase64 = data.audio;
        const mimeType = data.mimeType || 'audio/webm';

        if (!audioBase64) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Dữ liệu âm thanh rỗng.' }));
        }

        const transcribedQuery = await aiAssistant.transcribeAudio(audioBase64, mimeType);
        if (!transcribedQuery || !transcribedQuery.trim()) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: false,
            error: 'Không nhận diện được giọng nói.'
          }));
        }

        const normalizedQuery = VoiceNormalizer.normalize(transcribedQuery);
        console.log(`[STT Endpoint] Đã chuyển đổi âm thanh -> Text: "${normalizedQuery}"`);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          text: normalizedQuery
        }));
      } catch (err) {
        console.error('[STT Endpoint Error]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 1. API: Voice Assistant Audio Endpoint (Ghi âm trực tiếp - Bỏ qua Mi AI & Google STT)
  if (url.pathname === '/api/voice-audio' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const audioBase64 = data.audio;
        const mimeType = data.mimeType || 'audio/webm';

        console.log(`[Voice Audio] Nhận audio ${mimeType}, size: ${audioBase64 ? audioBase64.length : 0} chars`);

        if (!audioBase64) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Dữ liệu âm thanh rỗng.' }));
        }

        // Nhận diện giọng nói qua Gemini AI Multimodal Audio
        const transcribedQuery = await aiAssistant.transcribeAudio(audioBase64, mimeType);
        console.log(`[Voice Audio] Kết quả STT: "${transcribedQuery}"`);

        if (!transcribedQuery || !transcribedQuery.trim()) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: false,
            error: 'Không nhận diện được giọng nói. Anh vui lòng nói to và rõ hơn nhé!'
          }));
        }

        const normalizedQuery = VoiceNormalizer.normalize(transcribedQuery);
        // Xử lý câu lệnh
        const reply = await MessageHandler.handleIncomingMessage(normalizedQuery);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          query: normalizedQuery,
          reply
        }));
      } catch (err) {
        console.error('[Voice Audio Error]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: err.message, stack: err.stack }));
      }
    });
    return;
  }

  // 2. API: Voice Assistant Text Endpoint
  if (url.pathname === '/api/voice' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const query = (data.query || data.text || '').trim();
        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Truy vấn không được để trống.' }));
        }

        const normalizedQuery = VoiceNormalizer.normalize(query);
        const reply = await MessageHandler.handleIncomingMessage(normalizedQuery);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          query: normalizedQuery,
          reply
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: err.message, stack: err.stack }));
      }
    });
    return;
  }

  // 3. API: Text-to-Speech (TTS) Giọng nói tiếng Việt tự nhiên cho Diana (Cố định: Pitch 1.2, Speed 1.2, Volume 1.1, Cadence Relaxed)
  if (url.pathname === '/api/tts') {
    let text = url.searchParams.get('text') || '';
    let voice = url.searchParams.get('voice') || 'diana_female';
    let apiKey = url.searchParams.get('apiKey') || '';
    let pitch = parseFloat(url.searchParams.get('pitch') || '1.20');
    let speed = parseFloat(url.searchParams.get('speed') || url.searchParams.get('rate') || '1.20');
    let volume = parseFloat(url.searchParams.get('volume') || url.searchParams.get('vol') || '1.10');
    let cadence = url.searchParams.get('cadence') || 'relaxed';

    if (!text && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const json = JSON.parse(body || '{}');
          text = json.text || '';
          voice = json.voice || voice;
          apiKey = json.apiKey || apiKey;
          pitch = parseFloat(json.pitch || pitch || '1.20');
          speed = parseFloat(json.speed || json.rate || speed || '1.20');
          volume = parseFloat(json.volume || json.vol || volume || '1.10');
          cadence = json.cadence || cadence || 'relaxed';
          await streamTTS(text, res, voice, apiKey, pitch, speed, volume, cadence);
        } catch (_) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Lỗi parse text' }));
        }
      });
      return;
    }
    await streamTTS(text, res, voice, apiKey, pitch, speed, volume, cadence);
    return;
  }

  // 4. API: Trạng thái hệ thống & PC Status (bao gồm trạng thái mirror)
  if (url.pathname === '/api/status' || url.pathname === '/pc/status') {
    // Kiểm tra scrcpy.exe đang chạy để đồng bộ trạng thái giữa Phone và PC
    const mirrorActive = await new Promise(resolve => {
      exec('tasklist /FI "IMAGENAME eq scrcpy.exe" /NH', { windowsHide: true, timeout: 2000 }, (e, out) => {
        resolve(out && out.includes('scrcpy.exe'));
      });
    }).catch(() => false);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      status: 'ONLINE',
      bot: 'Diana AI Voice Assistant',
      uptime: `${Math.floor(process.uptime())}s`,
      timestamp: new Date().toISOString(),
      hasApiKey: config.ai.hasApiKey,
      model: config.ai.model,
      zaloConnected: zaloLive.isConnected,
      pcOnline: pcBridge.isPCOnline(),
      pcInfo: pcBridge.pcInfo,
      mirrorActive,
      phoneStream: global.phoneStreamState || { isStreaming: false }
    }));
  }

  // 4.1 API: Trạng thái mirror cụ thể (cho toggle button)
  if (url.pathname === '/api/mirror/status') {
    let mirrorActive = false;
    if (process.platform === 'win32') {
      try {
        mirrorActive = await WindowsController.isPhoneMirrorRunning().catch(() => false);
      } catch (_) {
        mirrorActive = pcBridge.isMirrorActive();
      }
    } else {
      mirrorActive = pcBridge.isMirrorActive();
    }

    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8'
    });
    return res.end(JSON.stringify({
      success: true,
      mirrorActive,
      target: global.__mirrorTarget || '',
      phoneStream: global.phoneStreamState || { isStreaming: false }
    }));
  }

  // 4.2 API: Xem / Tải ảnh chụp màn hình PC mới nhất
  if (url.pathname === '/api/screenshot/latest' || url.pathname.startsWith('/api/screenshot/') || url.pathname.startsWith('/data/screenshots/')) {
    const screenshotDir = path.resolve(config.paths.dataDir, 'screenshots');
    let targetFile = null;
    if (url.pathname === '/api/screenshot/latest') {
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
      const fileName = path.basename(url.pathname);
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

  // 2.1 API: Lấy danh sách bạn bè Zalo chính thức
  if (url.pathname === '/api/zalo/friends') {
    const friends = await zaloLive.getFriendsList();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: true,
      count: friends.length,
      friends: friends
    }));
  }

  // 2.2 API: Quét / Làm mới danh sách bạn bè Zalo trực tiếp từ máy chủ Zalo
  if (url.pathname === '/api/zalo/friends/scan') {
    const friends = await zaloLive.scanAllFriends(true);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: true,
      count: friends.length,
      friends: friends
    }));
  }

  // 2.3 API: Tìm kiếm bạn bè Zalo theo tên
  if (url.pathname === '/api/zalo/search') {
    const q = url.searchParams.get('q') || '';
    const contacts = await zaloLive.searchZaloFriends(q);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: true,
      count: contacts.length,
      contacts: contacts
    }));
  }

  // 3. API: Phục vụ ảnh chụp màn hình máy tính (Screenshots)
  if (url.pathname.startsWith('/api/screenshot/')) {
    const fileName = path.basename(url.pathname.replace('/api/screenshot/', ''));
    const filePath = path.join(dataDir, 'screenshots', fileName);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Không tìm thấy ảnh chụp màn hình.' }));
    }
  }

  // 3.0 OPTIONS Pre-flight cho API Air Gesture
  if (url.pathname.startsWith('/api/air-gesture/') && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // 3.1 API: Lưu phiên Grab Cử chỉ Air Gesture từ điện thoại & Bật chờ cử chỉ trên PC
  if (url.pathname === '/api/air-gesture/grab' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const sessionPayload = data.session || data.payload || data;
        latestAirGrabSession = {
          id: sessionPayload.id || `air_${Date.now()}`,
          messages: sessionPayload.messages || [],
          timestamp: Date.now(),
          activeTopic: sessionPayload.activeTopic || ''
        };

        console.log(`[AirGesture] ✊ Đã nhận dữ liệu Grab phiên chat từ điện thoại (${latestAirGrabSession.messages.length} tin nhắn)`);

        // Gửi lệnh đánh thức nhận diện cử chỉ Mở Bàn Tay qua Webcam PC
        pcBridge.executeCommand('start_air_gesture', {
          timeout: 86400,
          sessionData: latestAirGrabSession
        }).catch(err => console.warn('[Air Gesture Bridge Error]:', err.message));

        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        return res.end(JSON.stringify({
          success: true,
          message: 'Đã lưu phiên grab và kích hoạt chế độ chờ cử chỉ trên PC!',
          sessionId: latestAirGrabSession.id
        }));
      } catch (err) {
        res.writeHead(400, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3.2 API: Lấy phiên Grab mới nhất để khôi phục trên trình duyệt PC
  if (url.pathname === '/api/air-gesture/latest') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8'
    });
    return res.end(JSON.stringify({
      success: true,
      hasSession: Boolean(latestAirGrabSession),
      session: latestAirGrabSession
    }));
  }

  // 3.3 API: Trạng thái nhận diện cử chỉ hiện tại của PC (Để điện thoại đồng bộ)
  if (url.pathname === '/api/air-gesture/status') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8'
    });
    return res.end(JSON.stringify({
      success: true,
      status: WindowsController.airGestureStatus || 'IDLE',
      hasSession: Boolean(latestAirGrabSession)
    }));
  }

  // 3.4 API: Kích hoạt chế độ Air Gesture từ xa
  if (url.pathname === '/api/air-gesture/arm' && req.method === 'POST') {
    pcBridge.executeCommand('start_air_gesture', { timeout: 86400 }).catch(() => {});
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8'
    });
    return res.end(JSON.stringify({ success: true, message: 'Đã kích hoạt chế độ chờ cử chỉ trên PC.' }));
  }

  // 3.5 API: Hủy / Tắt chế độ Air Gesture và đóng Webcam PC
  if (url.pathname === '/api/air-gesture/stop' && req.method === 'POST') {
    pcBridge.executeCommand('stop_air_gesture').catch(() => {});
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8'
    });
    return res.end(JSON.stringify({ success: true, message: 'Đã tắt Webcam và kết thúc cử chỉ.' }));
  }

  // 3.6 API: Bắt đầu Stream màn hình điện thoại lên PC (Phone Mirror & Control)
  if (url.pathname === '/api/phone/mirror/start') {
    const targetDevice = url.searchParams.get('target') || '';
    global.__mirrorTarget = targetDevice;
    pcBridge.executeCommand('start_phone_mirror', { target: targetDevice })
      .then(result => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify(result));
      })
      .catch(err => {
        res.writeHead(500, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  // 3.7 API: Tắt Stream màn hình điện thoại
  if (url.pathname === '/api/phone/mirror/stop') {
    pcBridge.executeCommand('stop_phone_mirror')
      .then(result => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify(result));
      })
      .catch(err => {
        res.writeHead(500, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  // 3.8 API: Bật/Tắt (Toggle) Stream màn hình điện thoại
  if (url.pathname === '/api/phone/mirror/toggle') {
    const targetDevice = url.searchParams.get('target') || '';
    global.__mirrorTarget = targetDevice;
    pcBridge.executeCommand('toggle_phone_mirror', { target: targetDevice })
      .then(result => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify(result));
      })
      .catch(err => {
        res.writeHead(500, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  // 3.9 API: Air Gesture AI Controller (Điều khiển máy tính bằng cử chỉ tay)
  if (url.pathname === '/api/air-gesture/toggle') {
    pcBridge.executeCommand('toggle_air_gesture')
      .then(result => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify(result));
      })
      .catch(err => {
        res.writeHead(500, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  if (url.pathname === '/api/air-gesture/status') {
    pcBridge.executeCommand('get_air_gesture_status')
      .then(result => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify(result));
      })
      .catch(err => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({ success: false, active: false, error: err.message }));
      });
    return;
  }

  if (url.pathname === '/api/air-gesture/start') {
    pcBridge.executeCommand('start_air_gesture')
      .then(result => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify(result));
      })
      .catch(err => {
        res.writeHead(500, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  if (url.pathname === '/api/air-gesture/stop') {
    pcBridge.executeCommand('stop_air_gesture')
      .then(result => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify(result));
      })
      .catch(err => {
        res.writeHead(500, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  // 3.8 API: Quản lý Native Phone Screen Stream (MediaProjection / MJPEG không cần Dev Mode)
  if (url.pathname === '/api/phone/screen/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        global.phoneStreamState = {
          isStreaming: Boolean(data.isStreaming),
          streamUrl: data.streamUrl || '',
          deviceName: data.deviceName || 'Redmi K70',
          updatedAt: Date.now()
        };
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(JSON.stringify({ success: true, state: global.phoneStreamState }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/phone/screen/status') {
    const state = global.phoneStreamState || { isStreaming: false, streamUrl: '' };
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8'
    });
    return res.end(JSON.stringify({ success: true, ...state }));
  }

  // 4. Endpoint thăm dò lệnh cho PC Agent
  if (url.pathname === '/pc/poll') {
    const mirrorQuery = url.searchParams.get('mirrorActive');
    const cmd = pcBridge.pollCommand({ mirrorActive: mirrorQuery });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      online: true,
      hasCommand: Boolean(cmd),
      command: cmd
    }));
  }

  // 5. Endpoint nhận kết quả xử lý từ PC Agent
  if (url.pathname === '/pc/result' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const handled = pcBridge.handleResult(data);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: handled }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 6. Endpoint kiểm tra thử nghiệm (Test API)
  if (url.pathname === '/test') {
    const q = url.searchParams.get('q') || 'Xin chào';
    try {
      const reply = await MessageHandler.handleIncomingMessage(q);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        query: q,
        reply: reply,
        hasApiKey: config.ai.hasApiKey,
        keyLength: config.ai.apiKey?.length || 0,
        model: config.ai.model,
        zaloConnected: zaloLive.isConnected
      }));
    } catch(err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message, stack: err.stack }));
    }
  }

  // 7. Phục vụ Static Files cho PWA Web Voice App (public/)
  let reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
  let filePath = path.join(publicDir, reqPath);

  // Bảo vệ an toàn chống Directory Traversal
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    return fs.createReadStream(filePath).pipe(res);
  }

  // Fallback về index.html nếu là route SPA
  const indexHtmlPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(indexHtmlPath).pipe(res);
  }

  // Health Check JSON mặc định nếu không có UI
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    status: 'ONLINE',
    bot: 'Diana AI Zalo Agent',
    service: 'Zalo Live Assistant',
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    hasApiKey: config.ai.hasApiKey,
    zaloConnected: zaloLive.isConnected,
    pcOnline: pcBridge.isPCOnline()
  }));
});

async function callMiniMaxTTS(text, voiceId, apiKey, pitch = 1.0, speed = 1.0, volume = 1.0) {
  const key = apiKey || process.env.MINIMAX_API_KEY;
  if (!key) throw new Error('NO_MINIMAX_KEY');

  const pitchVal = Math.max(-12, Math.min(12, Math.round((parseFloat(pitch) - 1.0) * 20)));
  const speedVal = Math.max(0.5, Math.min(2.0, parseFloat(speed) || 1.0));
  const volVal = Math.max(0.5, Math.min(1.5, parseFloat(volume) || 1.0));

  const endpoints = key.startsWith('sk-api-') 
    ? ['https://api.minimax.io/v1/t2a_v2', 'https://api.minimaxi.chat/v1/t2a_v2', 'https://api.minimax.chat/v1/t2a_v2']
    : ['https://api.minimax.chat/v1/t2a_v2', 'https://api.minimax.io/v1/t2a_v2', 'https://api.minimaxi.chat/v1/t2a_v2'];

  let lastErrMsg = '';
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'speech-02-hd',
          text: text,
          stream: false,
          voice_setting: {
            voice_id: voiceId || 'moss_audio_881639b8-b831-11f1-80cc-aac30e71d302',
            speed: speedVal,
            vol: volVal,
            pitch: pitchVal
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: 'mp3',
            channel: 1
          }
        })
      });

      const data = await response.json();
      if (data && data.data && data.data.audio) {
        return Buffer.from(data.data.audio, 'hex');
      }
      if (data?.base_resp?.status_msg) {
        lastErrMsg = data.base_resp.status_msg;
        if (data.base_resp.status_code === 1008) {
          throw new Error('MiniMax insufficient balance (tài khoản hết số dư / chưa nạp credit)');
        }
      }
    } catch (err) {
      lastErrMsg = err.message;
      if (err.message.includes('insufficient balance')) throw err;
    }
  }

  throw new Error(lastErrMsg || 'Lỗi từ MiniMax API');
}

async function callEdgeNeuralTTS(text, voiceName = 'vi-VN-HoaiMyNeural', pitch = 1.0, speed = 1.0, volume = 1.0) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const pitchPercent = Math.round((parseFloat(pitch) - 1.0) * 100);
  const pitchStr = pitchPercent >= 0 ? `+${pitchPercent}%` : `${pitchPercent}%`;

  const speedPercent = Math.round((parseFloat(speed) - 1.0) * 100);
  const speedStr = speedPercent >= 0 ? `+${speedPercent}%` : `${speedPercent}%`;

  const volumePercent = Math.round((parseFloat(volume) - 1.0) * 100);
  const volumeStr = volumePercent >= 0 ? `+${volumePercent}%` : `${volumePercent}%`;

  const { audioStream } = tts.toStream(text, { pitch: pitchStr, rate: speedStr, volume: volumeStr });
  const chunks = [];
  return new Promise((resolve, reject) => {
    audioStream.on('data', (chunk) => chunks.push(chunk));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
}

async function streamTTS(text, res, voice = 'diana_female', apiKey = '', pitch = 1.0, speed = 1.0, volume = 1.0, cadence = 'normal') {
  if (!text || !text.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Text rỗng.' }));
  }

  let cleanText = text
    .replace(/[*_#`~]/g, '')
    // Lọc bỏ các emoji và ký tự biểu tượng
    .replace(/[\u{1F600}-\u{1F6FF}|[\u{1F300}-\u{1F5FF}|[\u{1F900}-\u{1F9FF}|[\u{2600}-\u{26FF}]/gu, '')
    // Lọc bỏ các biểu cảm typo phổ biến: >.<, >﹏<, :3, :D, ^.^, ^_^, (⁠≧⁠▽⁠≦⁠), (⁠◕⁠ᴗ⁠◕⁠✿⁠), (⁠｡⁠♥⁠‿⁠♥⁠｡⁠), etc.
    .replace(/[>><]+[._~﹏\-]+[<><]+/g, '')
    .replace(/\b:[3DPOpo]\b/g, '')
    .replace(/\^[._\-~]\^/g, '')
    .replace(/\([^\p{L}\p{N}]{2,}\)/gu, '')
    .replace(/[\u{3000}-\u{303F}\u{FF00}-\u{FFEF}]/gu, '')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();

  // Tùy biến nhịp điệu ngắt nghỉ câu (Cadence)
  if (cadence === 'short') {
    cleanText = cleanText.replace(/[,;:]\s*/g, ' ').replace(/\.{2,}/g, '.');
  } else if (cadence === 'relaxed') {
    cleanText = cleanText.replace(/([.?!])\s+/g, '$1... ');
  }

  // 1. Thử gọi MiniMax Neural TTS nếu chọn giọng moss_audio hoặc typhoeus VÀ có API Key
  if ((voice.startsWith('moss_audio_') || voice === 'typhoeus') && (apiKey || process.env.MINIMAX_API_KEY)) {
    try {
      const voiceId = voice.startsWith('moss_audio_') ? voice : 'moss_audio_881639b8-b831-11f1-80cc-aac30e71d302';
      const miniMaxBuffer = await callMiniMaxTTS(cleanText, voiceId, apiKey, pitch, speed, volume);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': miniMaxBuffer.length,
        'Cache-Control': 'public, max-age=86400'
      });
      return res.end(miniMaxBuffer);
    } catch (err) {
      console.warn('[MiniMax TTS Fallback to Edge Neural]:', err.message);
    }
  }

  // 2. Microsoft Edge Neural Voice (Diana Nữ Hoài My / Nam Minh Quân / Typhoeus Hunter Neural)
  if (voice === 'diana_female' || voice === 'viet_male' || voice.startsWith('moss_audio_') || voice === 'typhoeus' || !voice) {
    try {
      let edgeVoice = 'vi-VN-HoaiMyNeural';
      let effPitch = pitch;
      let effSpeed = speed;
      let effVol = volume;

      if (voice === 'viet_male') {
        edgeVoice = 'vi-VN-NamMinhNeural';
      } else if (voice.startsWith('moss_audio_') || voice === 'typhoeus') {
        // Hồ sơ âm thanh Typhoeus Hunter: Giọng nam trầm, dứt khoát, âm hưởng chiến binh
        edgeVoice = 'vi-VN-NamMinhNeural';
        effPitch = (parseFloat(pitch) || 1.0) * 0.88; // Trầm sâu hơn ~12%
        effSpeed = (parseFloat(speed) || 1.0) * 1.05;
        effVol = (parseFloat(volume) || 1.0) * 1.15;
      }

      const edgeBuffer = await callEdgeNeuralTTS(cleanText, edgeVoice, effPitch, effSpeed, effVol);
      if (edgeBuffer && edgeBuffer.length > 500) {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': edgeBuffer.length,
          'Cache-Control': 'public, max-age=86400'
        });
        return res.end(edgeBuffer);
      }
    } catch (err) {
      console.warn('[Edge Neural TTS Fallback to Google]:', err.message);
    }
  }

  // 3. Fallback sang Google TTS tiêu chuẩn
  const chunks = [];
  let remaining = cleanText;
  while (remaining.length > 0) {
    if (remaining.length <= 180) {
      chunks.push(remaining);
      break;
    }
    let idx = remaining.lastIndexOf('. ', 180);
    if (idx === -1) idx = remaining.lastIndexOf(', ', 180);
    if (idx === -1) idx = remaining.lastIndexOf(' ', 180);
    if (idx === -1) idx = 180;
    chunks.push(remaining.slice(0, idx).trim());
    remaining = remaining.slice(idx).trim();
  }

  try {
    const buffers = await Promise.all(chunks.map(async (chunk) => {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=vi&client=tw-ob`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!response.ok) {
        throw new Error(`TTS upstream error: ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    }));

    const fullAudio = Buffer.concat(buffers);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': fullAudio.length,
      'Cache-Control': 'public, max-age=86400'
    });
    return res.end(fullAudio);
  } catch (err) {
    console.error('[TTS Error]:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Không thể tạo âm thanh giọng nói.' }));
  }
}

server.listen(PORT, () => {
  console.log(`🌐 [Web Service] Health Check & Voice Assistant PWA đang chạy tại cổng ${PORT}`);
});

async function bootstrapZaloLive() {
  console.log('🤖 Đang khởi động AI Zalo Bot (Chế độ Zalo Live Thực Tế)...');
  
  // 1. Đảm bảo nạp dữ liệu snapshot
  storage.getState();

  // 2. Nạp hệ thống nhắc nhở & hẹn giờ
  scheduler.init(zaloLive);

  // 3. Khởi động kết nối Zalo (Quét mã QR hoặc đăng nhập phiên cũ)
  await zaloLive.start();

  // 4. Bật trình quét ngầm định kỳ Cổng trường TDTU
  monitor.start();
}

process.on('uncaughtException', (err) => {
  console.error('⚠️ [Uncaught Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Unhandled Rejection]:', reason?.message || reason);
});

bootstrapZaloLive().catch(err => {
  console.error('Lỗi khi khởi chạy Bot Zalo Live:', err);
});
