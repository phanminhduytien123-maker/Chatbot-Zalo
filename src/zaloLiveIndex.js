process.env.TZ = 'Asia/Ho_Chi_Minh';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/config.js';
import aiAssistant from './ai/gemini.js';
import { zaloLive } from './zalo/zaloLive.js';
import { monitor } from './services/monitor.js';
import { storage } from './services/storage.js';
import { scheduler } from './services/scheduler.js';
import { MessageHandler } from './zalo/messageHandler.js';
import { pcBridge } from './pc/pcBridge.js';
import VoiceNormalizer from './services/voiceNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');
const dataDir = path.resolve(__dirname, '..', 'data');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

// Khởi tạo HTTP Web Service & Voice Assistant Server cho Render.com
const PORT = process.env.PORT || 3000;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
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

  // 3. API: Text-to-Speech (TTS) Giọng nói tiếng Việt tự nhiên cho Diana
  if (url.pathname === '/api/tts') {
    let text = url.searchParams.get('text') || '';
    if (!text && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const json = JSON.parse(body || '{}');
          text = json.text || '';
          await streamTTS(text, res);
        } catch (_) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Lỗi parse text' }));
        }
      });
      return;
    }
    await streamTTS(text, res);
    return;
  }

  // 4. API: Trạng thái hệ thống & PC Status
  if (url.pathname === '/api/status' || url.pathname === '/pc/status') {
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
      pcInfo: pcBridge.pcInfo
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

  // 4. Endpoint thăm dò lệnh cho PC Agent
  if (url.pathname === '/pc/poll') {
    const cmd = pcBridge.pollCommand();
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

async function streamTTS(text, res) {
  if (!text || !text.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Text rỗng.' }));
  }

  const cleanText = text
    .replace(/[*_#`~]/g, '')
    .replace(/[\u{1F600}-\u{1F6FF}|[\u{1F300}-\u{1F5FF}|[\u{1F900}-\u{1F9FF}|[\u{2600}-\u{26FF}]/gu, '')
    .replace(/\n+/g, '. ')
    .trim();

  // Chia nhỏ thành các đoạn câu <= 180 ký tự
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
