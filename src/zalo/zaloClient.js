import readline from 'readline';
import chalk from 'chalk';
import MessageHandler from './messageHandler.js';
import monitor from '../services/monitor.js';
import config from '../config/config.js';

export class ZaloClient {
  constructor() {
    this.isConnected = false;
  }

  /**
   * Khởi động Client
   */
  async init() {
    this.isConnected = true;
    
    // Đăng ký callback gửi tin nhắn chủ động từ Monitor
    monitor.setSender(async (alertMessage) => {
      this.sendProactiveAlert(alertMessage);
    });

    console.log(chalk.green.bold('╔══════════════════════════════════════════════════════════╗'));
    console.log(chalk.green.bold('║      🤖 AI ZALO BOT - TRỢ LÝ SINH VIÊN ĐÃ SẴN SÀNG!      ║'));
    console.log(chalk.green.bold('╚══════════════════════════════════════════════════════════╝'));
    console.log(chalk.white(`📍 Chế độ: ${config.portal.mockMode ? chalk.yellow('Mô phỏng (Mock Data)') : chalk.cyan('Live Portal Web')}`));
    console.log(chalk.white(`🧠 AI Engine: ${config.ai.hasApiKey ? chalk.green('Google Gemini Online') : chalk.magenta('Smart Fallback NLP')}`));
    console.log(chalk.gray(`👉 Gõ /menu để xem danh sách lệnh, hoặc nhập câu hỏi bất kỳ để chat với AI.`));
    console.log(chalk.gray(`👉 Nhấn Ctrl+C để thoát.\n`));
  }

  /**
   * Gửi tin nhắn chủ động khi có biến động từ Portal trường
   */
  sendProactiveAlert(message) {
    console.log('\n' + chalk.bgRed.white.bold(' 🚨 [ZALO ALERT MỚI ĐƯỢC GỬI ĐI] '));
    console.log(chalk.red('────────────────────────────────────────────────────────────'));
    console.log(chalk.white(message));
    console.log(chalk.red('────────────────────────────────────────────────────────────\n'));
    process.stdout.write(chalk.blue.bold('👤 Bạn: '));
  }

  /**
   * Khởi động cửa sổ giao tiếp Console trực tiếp
   */
  startInteractiveConsole() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue.bold('👤 Bạn: ')
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      try {
        console.log(chalk.gray('⏳ Đang xử lý...'));
        const reply = await MessageHandler.handleIncomingMessage(input);
        
        console.log(chalk.green.bold('\n🤖 Bot:'));
        console.log(chalk.white(reply));
        console.log('');
      } catch (err) {
        console.log(chalk.red(`❌ Lỗi xử lý: ${err.message}`));
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log(chalk.yellow('\n👋 Tạm biệt! Đã dừng AI Zalo Bot.'));
      process.exit(0);
    });
  }
}

export const zaloClient = new ZaloClient();
export default zaloClient;
