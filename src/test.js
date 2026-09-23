import chalk from 'chalk';
import { MessageHandler } from './zalo/messageHandler.js';
import { storage } from './services/storage.js';
import { scraper } from './portal/scraper.js';
import { monitor } from './services/monitor.js';

async function runTests() {
  console.log(chalk.cyan.bold('=================================================='));
  console.log(chalk.cyan.bold('  BẮT ĐẦU KIỂM THỬ TOÀN DIỆN HỆ THỐNG AI ZALO BOT '));
  console.log(chalk.cyan.bold('==================================================\n'));

  // Test 1: Kiểm thử lệnh /check
  console.log(chalk.yellow('[Test 1] 📊 Kiểm thử lệnh /check...'));
  const checkReply = await MessageHandler.handleIncomingMessage('/check');
  console.log(chalk.gray(checkReply));
  if (checkReply.includes('BÁO CÁO TÌNH TRẠNG') && checkReply.includes('Trạng thái Cookie')) {
    console.log(chalk.green('✅ Test 1 Thành công!\n'));
  } else {
    throw new Error('Test 1 thất bại!');
  }

  // Test 2: Kiểm thử lệnh /diem
  console.log(chalk.yellow('[Test 2] 🎓 Kiểm thử lệnh /diem...'));
  const diemReply = await MessageHandler.handleIncomingMessage('/diem');
  console.log(chalk.gray(diemReply));
  if (diemReply.includes('BẢNG ĐIỂM CHI TIẾT')) {
    console.log(chalk.green('✅ Test 2 Thành công!\n'));
  } else {
    throw new Error('Test 2 thất bại!');
  }

  // Test 3: Kiểm thử lệnh /don
  console.log(chalk.yellow('[Test 3] 📑 Kiểm thử lệnh /don...'));
  const donReply = await MessageHandler.handleIncomingMessage('/don');
  console.log(chalk.gray(donReply));
  if (donReply.includes('THEO DÕI ĐƠN TỪ TRỰC TUYẾN')) {
    console.log(chalk.green('✅ Test 3 Thành công!\n'));
  } else {
    throw new Error('Test 3 thất bại!');
  }

  // Test 4: Kiểm thử lệnh /tintuc
  console.log(chalk.yellow('[Test 4] 📢 Kiểm thử lệnh /tintuc...'));
  const newsReply = await MessageHandler.handleIncomingMessage('/tintuc');
  console.log(chalk.gray(newsReply));
  if (newsReply.includes('THÔNG BÁO TỪ TRƯỜNG')) {
    console.log(chalk.green('✅ Test 4 Thành công!\n'));
  } else {
    throw new Error('Test 4 thất bại!');
  }

  // Test 5: Kiểm thử Chat tự nhiên (NLP)
  console.log(chalk.yellow('[Test 5] 🧠 Kiểm thử Chat tự nhiên: "Xem giùm tao điểm môn thực hành chuyên môn"...'));
  const chatReply = await MessageHandler.handleIncomingMessage('Xem giùm tao điểm môn thực hành chuyên môn');
  console.log(chalk.gray(chatReply));
  if (chatReply.length > 20) {
    console.log(chalk.green('✅ Test 5 Thành công!\n'));
  } else {
    throw new Error('Test 5 thất bại!');
  }

  // Test 6: Kiểm thử Giả lập có điểm mới & Cơ chế so sánh Diff
  console.log(chalk.yellow('[Test 6] 🚨 Kiểm thử Giả lập môn 404CM7 có điểm mới & Trình phát hiện biến động...'));
  const oldState = JSON.parse(JSON.stringify(storage.getState()));
  
  // Cập nhật điểm
  monitor.simulateNewGrade();
  const newState = storage.getState();
  const diffResult = storage.detectDiff(oldState, newState);

  console.log(chalk.gray(`Số lượng môn cập nhật điểm: ${diffResult.changes.gradeUpdates.length}`));
  if (diffResult.hasChanges && diffResult.changes.gradeUpdates.length > 0) {
    console.log(chalk.green('✅ Test 6 Thành công: Diff Engine đã bắt được điểm mới!\n'));
  } else {
    throw new Error('Test 6 thất bại!');
  }

  console.log(chalk.green.bold('=================================================='));
  console.log(chalk.green.bold('  🎉 TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ VƯỢT QUA 100%!  '));
  console.log(chalk.green.bold('==================================================\n'));
}

runTests().catch(err => {
  console.error(chalk.red.bold('❌ Lỗi kiểm thử:'), err);
  process.exit(1);
});
