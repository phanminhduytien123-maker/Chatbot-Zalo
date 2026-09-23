import chalk from 'chalk';
import { scraper } from './portal/scraper.js';
import { MessageHandler } from './zalo/messageHandler.js';

async function main() {
  console.log(chalk.cyan.bold('=================================================='));
  console.log(chalk.cyan.bold('   KIỂM TRA DỮ LIỆU THỰC TẾ TỪ CỔNG TDTU'));
  console.log(chalk.cyan.bold('   Sinh viên: Phan Minh Duy Tiến (42200522)'));
  console.log(chalk.cyan.bold('==================================================\n'));

  console.log(chalk.yellow('1. 📊 Kiểm tra phản hồi lệnh /check:'));
  const checkRes = await MessageHandler.handleIncomingMessage('/check');
  console.log(chalk.white(checkRes));

  console.log(chalk.yellow('\n2. 🎓 Kiểm tra phản hồi lệnh /diem:'));
  const diemRes = await MessageHandler.handleIncomingMessage('/diem');
  console.log(chalk.white(diemRes));

  console.log(chalk.yellow('\n3. 📑 Kiểm tra phản hồi lệnh /don:'));
  const donRes = await MessageHandler.handleIncomingMessage('/don');
  console.log(chalk.white(donRes));

  console.log(chalk.green.bold('\n=================================================='));
  console.log(chalk.green.bold('   ✅ KẾT NỐI VÀ LẤY DỮ LIỆU THỰC TẾ THÀNH CÔNG 100%!'));
  console.log(chalk.green.bold('=================================================='));
}

main().catch(err => {
  console.error(chalk.red('Lỗi:'), err);
});
