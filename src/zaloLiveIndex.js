process.env.TZ = 'Asia/Ho_Chi_Minh';
import http from 'http';
import { zaloLive } from './zalo/zaloLive.js';
import { monitor } from './services/monitor.js';
import { storage } from './services/storage.js';
import { scheduler } from './services/scheduler.js';
import { MessageHandler } from './zalo/messageHandler.js';
import config from './config/config.js';

// Khởi tạo HTTP Health Check Server cho Render.com
const PORT = process.env.PORT || 3000;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
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

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    status: 'ONLINE',
    bot: 'Diana AI Zalo Agent',
    service: 'Zalo Live Assistant',
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    hasApiKey: config.ai.hasApiKey,
    keyLength: config.ai.apiKey?.length || 0,
    model: config.ai.model,
    zaloConnected: zaloLive.isConnected
  }));
});

server.listen(PORT, () => {
  console.log(`🌐 [Web Service] Health Check Server đang chạy tại cổng ${PORT}`);
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
