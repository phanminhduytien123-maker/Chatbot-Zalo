import { WindowsController } from './src/pc/windowsController.js';
import fs from 'fs';
import path from 'path';

async function test() {
  console.log('Waking display...');
  await WindowsController.wakeDisplay();
  await new Promise(r => setTimeout(r, 1000));
  console.log('Taking screenshot...');
  const res = await WindowsController.takeScreenshot();
  console.log('Result:', res);
  if (res.filePath && fs.existsSync(res.filePath)) {
    const stat = fs.statSync(res.filePath);
    console.log('File size:', stat.size, 'bytes');
  }
}

test();
