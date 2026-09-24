import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import config from '../config/config.js';

export class WindowsController {
  /**
   * Chụp ảnh màn hình Desktop Windows hiện tại
   * @returns {Promise<{ success: boolean, filePath?: string, error?: string }>}
   */
  static async takeScreenshot() {
    return new Promise((resolve) => {
      const screenshotDir = path.resolve(config.paths.dataDir, 'screenshots');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const fileName = `screen_${Date.now()}.png`;
      const filePath = path.resolve(screenshotDir, fileName);

      // Script PowerShell chụp ảnh màn hình bằng .NET Graphics
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bitmap.Save('${filePath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
Write-Output "OK"
      `.trim();

      const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');

      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error, stdout) => {
        if (error || !fs.existsSync(filePath)) {
          return resolve({
            success: false,
            error: error ? error.message : 'Không thể lưu file ảnh màn hình.'
          });
        }
        resolve({
          success: true,
          filePath,
          fileName
        });
      });
    });
  }

  /**
   * Khóa màn hình máy tính (Win + L)
   */
  static lockScreen() {
    return new Promise((resolve) => {
      exec('rundll32.exe user32.dll,LockWorkStation', (error) => {
        if (error) {
          return resolve({ success: false, error: error.message });
        }
        resolve({ success: true, message: '🔒 Đã khóa màn hình máy tính thành công!' });
      });
    });
  }

  /**
   * Kiểm tra thông tin Pin của Laptop (Win32_Battery)
   */
  static getBatteryInfo() {
    return new Promise((resolve) => {
      const psCommand = `Get-CimInstance -ClassName Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus, EstimatedRunTime | ConvertTo-Json`;
      const base64Script = Buffer.from(psCommand, 'utf16le').toString('base64');

      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error, stdout) => {
        if (error || !stdout.trim()) {
          return resolve({
            success: true,
            isDesktop: true,
            message: '🖥️ Thiết bị là Máy tính bàn (PC) hoặc đang cắm nguồn trực tiếp không dùng pin.'
          });
        }

        try {
          const data = JSON.parse(stdout.trim());
          const percent = data.EstimatedChargeRemaining || 100;
          const statusMap = {
            1: 'Đang xả pin (Không cắm sạc)',
            2: 'Đang cắm sạc (AC Connected)',
            3: 'Pin đầy',
            4: 'Pin yếu',
            5: 'Pin cực yếu'
          };
          const statusText = statusMap[data.BatteryStatus] || 'Đang sử dụng';

          resolve({
            success: true,
            percent,
            statusText,
            message: `🔋 THÔNG TIN PIN LAPTOP:\n• Dung lượng: ${percent}%\n• Trạng thái: ${statusText}`
          });
        } catch (_) {
          resolve({ success: true, message: '🔋 Đang sử dụng nguồn điện trực tiếp.' });
        }
      });
    });
  }

  /**
   * Điều chỉnh âm lượng loa máy tính (0 - 100)
   * @param {number} level 
   */
  static setVolume(level) {
    return new Promise((resolve) => {
      const targetPercent = Math.max(0, Math.min(100, Number(level) || 50));
      
      const psScript = `
$wshShell = New-Object -ComObject WScript.Shell
for ($i = 0; $i -lt 50; $i++) { $wshShell.SendKeys([char]174) }
$steps = [math]::Round(${targetPercent} / 2)
for ($i = 0; $i -lt $steps; $i++) { $wshShell.SendKeys([char]175) }
Write-Output "OK"
      `.trim();

      const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');

      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error) => {
        if (error) return resolve({ success: false, error: error.message });
        resolve({ success: true, message: `🔊 Đã chỉnh âm lượng máy tính về: ${targetPercent}%` });
      });
    });
  }

  /**
   * Bật/Tắt âm thanh loa (Mute Toggle)
   */
  static toggleMute() {
    return new Promise((resolve) => {
      const psScript = `
$wshShell = New-Object -ComObject WScript.Shell
$wshShell.SendKeys([char]173)
Write-Output "OK"
      `.trim();

      const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');

      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error) => {
        if (error) return resolve({ success: false, error: error.message });
        resolve({ success: true, message: `🔇 Đã chuyển đổi trạng thái Bật/Tắt Mute âm thanh trên máy tính!` });
      });
    });
  }

  /**
   * Mở ứng dụng hoặc trang Web trên máy tính
   * @param {string} target Tên app (chrome, code, notepad) hoặc URL (https://...)
   */
  static openAppOrUrl(target) {
    return new Promise((resolve) => {
      if (!target) return resolve({ success: false, error: 'Thiếu tên ứng dụng hoặc link cần mở.' });

      let command = `Start-Process "${target}"`;
      if (target.toLowerCase() === 'chrome') command = 'Start-Process "chrome.exe"';
      else if (target.toLowerCase() === 'vscode' || target.toLowerCase() === 'code') command = 'Start-Process "code"';
      else if (target.toLowerCase() === 'notepad') command = 'Start-Process "notepad.exe"';
      else if (target.toLowerCase() === 'calc' || target.toLowerCase() === 'calculator') command = 'Start-Process "calc.exe"';

      const base64Script = Buffer.from(command, 'utf16le').toString('base64');

      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error) => {
        if (error) return resolve({ success: false, error: error.message });
        resolve({ success: true, message: `🚀 Đã gửi lệnh mở "${target}" trên máy tính của anh!` });
      });
    });
  }

  /**
   * Đặt nội dung vào Clipboard (Bộ nhớ tạm máy tính)
   * @param {string} text 
   */
  static setClipboard(text) {
    return new Promise((resolve) => {
      const escaped = text.replace(/"/g, '""');
      const psCommand = `Set-Clipboard -Value "${escaped}"`;
      const base64Script = Buffer.from(psCommand, 'utf16le').toString('base64');

      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error) => {
        if (error) return resolve({ success: false, error: error.message });
        resolve({ success: true, message: `📋 Đã copy nội dung vào Clipboard máy tính! Anh chỉ việc bấm Ctrl + V trên máy tính để dán ạ.` });
      });
    });
  }

  /**
   * Hiện thông báo Toast nảy lên góc phải màn hình Windows
   * @param {string} title 
   * @param {string} message 
   */
  static showToastNotification(title = 'Diana Assistant', message = 'Anh Tiến ơi!') {
    return new Promise((resolve) => {
      const cleanTitle = title.replace(/"/g, '""');
      const cleanMsg = message.replace(/"/g, '""');

      const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>${cleanTitle}</text>
            <text>${cleanMsg}</text>
        </binding>
    </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Diana Assistant").Show($toast)
      `.trim();

      const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');

      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error) => {
        if (error) return resolve({ success: false, error: error.message });
        resolve({ success: true, message: `🔔 Đã phát thông báo lên màn hình máy tính của anh thành công!` });
      });
    });
  }

  /**
   * Hẹn giờ tắt máy tính
   * @param {number} [minutes=0] 
   */
  static shutdown(minutes = 0) {
    return new Promise((resolve) => {
      const seconds = Math.max(0, Math.round(Number(minutes) * 60));
      exec(`shutdown /s /t ${seconds}`, (error) => {
        if (error) return resolve({ success: false, error: error.message });
        if (seconds === 0) {
          resolve({ success: true, message: '⚡ Đang tiến hành tắt máy tính ngay lập tức...' });
        } else {
          resolve({ success: true, message: `⏱️ Đã đặt lịch tắt máy tính sau ${minutes} phút nữa (Gõ /pc cancel để hủy).` });
        }
      });
    });
  }

  /**
   * Hủy lịch tắt máy tính
   */
  static cancelShutdown() {
    return new Promise((resolve) => {
      exec('shutdown /a', (error) => {
        if (error) return resolve({ success: false, message: '⚠️ Hiện tại không có lịch tắt máy nào đang chờ.' });
        resolve({ success: true, message: '✅ Đã hủy lệnh tắt máy tính thành công!' });
      });
    });
  }

  /**
   * Cho máy tính vào chế độ ngủ (Sleep)
   */
  static sleep() {
    return new Promise((resolve) => {
      exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', (error) => {
        if (error) return resolve({ success: false, error: error.message });
        resolve({ success: true, message: '💤 Đã cho máy tính vào chế độ Ngủ (Sleep) thành công!' });
      });
    });
  }
}

export default WindowsController;
