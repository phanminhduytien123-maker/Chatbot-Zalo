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
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

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

  // 3. API: Text-to-Speech (TTS) Giọng nói tiếng Việt tự nhiên cho Diana (Hỗ trợ Pitch, Speed, Volume & Cadence)
  if (url.pathname === '/api/tts') {
    let text = url.searchParams.get('text') || '';
    let voice = url.searchParams.get('voice') || 'diana_female';
    let apiKey = url.searchParams.get('apiKey') || '';
    let pitch = parseFloat(url.searchParams.get('pitch') || '1.0');
    let speed = parseFloat(url.searchParams.get('speed') || url.searchParams.get('rate') || '1.0');
    let volume = parseFloat(url.searchParams.get('volume') || url.searchParams.get('vol') || '1.0');
    let cadence = url.searchParams.get('cadence') || 'normal';

    if (!text && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const json = JSON.parse(body || '{}');
          text = json.text || '';
          voice = json.voice || voice;
          apiKey = json.apiKey || apiKey;
          pitch = parseFloat(json.pitch || pitch || '1.0');
          speed = parseFloat(json.speed || json.rate || speed || '1.0');
          volume = parseFloat(json.volume || json.vol || volume || '1.0');
          cadence = json.cadence || cadence || 'normal';
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

async function callMiniMaxTTS(text, voiceId, apiKey, pitch = 1.0, speed = 1.0, volume = 1.0) {
  const endpoint = 'https://api.minimax.chat/v1/t2a_v2';
  const key = apiKey || process.env.MINIMAX_API_KEY;
  if (!key) throw new Error('NO_MINIMAX_KEY');

  const pitchVal = Math.max(-12, Math.min(12, Math.round((parseFloat(pitch) - 1.0) * 20)));
  const speedVal = Math.max(0.5, Math.min(2.0, parseFloat(speed) || 1.0));
  const volVal = Math.max(0.5, Math.min(1.5, parseFloat(volume) || 1.0));

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
  throw new Error(data?.base_resp?.status_msg || 'Lỗi từ MiniMax API');
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
    .replace(/[\u{1F600}-\u{1F6FF}|[\u{1F300}-\u{1F5FF}|[\u{1F900}-\u{1F9FF}|[\u{2600}-\u{26FF}]/gu, '')
    .replace(/\n+/g, '. ')
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
