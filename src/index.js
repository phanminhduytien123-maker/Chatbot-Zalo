import { zaloClient } from './zalo/zaloClient.js';
import { monitor } from './services/monitor.js';
import { storage } from './services/storage.js';

async function bootstrap() {
  // 1. Đảm bảo dữ liệu ban đầu
  storage.getState();

  // 2. Khởi động Zalo Client
  await zaloClient.init();

  // 3. Khởi động tiến trình quét ngầm định kỳ
  monitor.start();

  // 4. Mở kênh nhận tin nhắn tương tác
  zaloClient.startInteractiveConsole();
}

bootstrap().catch((err) => {
  console.error('Lỗi khi khởi động Bot:', err);
});
