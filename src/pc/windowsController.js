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
   * Mở khóa màn hình máy tính bằng mật khẩu / PIN
   * @param {string} [password='/'] Mật khẩu mở khóa (mặc định là "/")
   */
  static unlockScreen(password = '/') {
    return new Promise((resolve) => {
      const pass = (password && typeof password === 'string' && password.trim()) ? password.trim() : '/';
      const escapedPass = pass.replace(/'/g, "''");

      const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class Unlocker {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);

    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;

    public static void PressKey(byte vk) {
        keybd_event(vk, (byte)MapVirtualKey(vk, 0), 0, UIntPtr.Zero);
        Thread.Sleep(50);
        keybd_event(vk, (byte)MapVirtualKey(vk, 0), KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void SendChar(char c) {
        keybd_event(0, (byte)c, KEYEVENTF_UNICODE, UIntPtr.Zero);
        Thread.Sleep(30);
        keybd_event(0, (byte)c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void Unlock(string pass) {
        // 1. Nhấn ESC rồi SPACE để đánh thức màn hình khóa và đưa về ô nhập mật khẩu
        PressKey(0x1B); // ESC
        Thread.Sleep(200);
        PressKey(0x20); // SPACE
        Thread.Sleep(600);
        PressKey(0x20); // SPACE lần 2 để đảm bảo đã vào ô nhập mật khẩu
        Thread.Sleep(500);

        // 2. Gõ từng ký tự của password bằng Unicode (hỗ trợ mọi ký tự gồm / # @ ...)
        foreach (char c in pass) {
            SendChar(c);
            Thread.Sleep(50);
        }

        Thread.Sleep(250);
        // 3. Nhấn ENTER để xác nhận mở khóa
        PressKey(0x0D); // ENTER
    }
}
'@
[Unlocker]::Unlock('${escapedPass}')
Write-Output "OK"
      `.trim();

      const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');

      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error) => {
        if (error) {
          return resolve({ success: false, error: `❌ Lỗi khi mở khóa máy: ${error.message}` });
        }
        resolve({
          success: true,
          message: `🔓 Đã gửi lệnh đánh thức và mở khóa máy tính thành công với mật khẩu "${pass}"! ✨`
        });
      });
    });
  }

  /**
   * Tắt màn hình máy tính (Màn hình đen tiết kiệm điện mà không khóa máy)
   */
  static turnOffDisplay() {
    return new Promise((resolve) => {
      const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DisplayHelper {
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    public static void TurnOff() {
        PostMessage((IntPtr)0xFFFF, 0x0112, (IntPtr)0xF170, (IntPtr)2);
    }
}
'@
[DisplayHelper]::TurnOff()
Write-Output "OK"
      `.trim();

      const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');
      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error) => {
        if (error) return resolve({ success: false, error: error.message });
        resolve({ success: true, message: '🖥️ Đã tắt màn hình máy tính (tiết kiệm điện & riêng tư)!' });
      });
    });
  }

  /**
   * Bật sáng lại màn hình máy tính
   */
  static wakeDisplay() {
    return new Promise((resolve) => {
      const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DisplayHelper {
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void Wake() {
        PostMessage((IntPtr)0xFFFF, 0x0112, (IntPtr)0xF170, (IntPtr)(-1));
        mouse_event(1, 0, 1, 0, 0);
        mouse_event(1, 0, -1, 0, 0);
        keybd_event(0x1B, 0, 0, UIntPtr.Zero);
        keybd_event(0x1B, 0, 2, UIntPtr.Zero);
    }
}
'@
[DisplayHelper]::Wake()
Write-Output "OK"
      `.trim();

      const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');
      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64Script}`, (error) => {
        if (error) return resolve({ success: false, error: error.message });
        resolve({ success: true, message: '💡 Đã đánh thức và bật sáng màn hình máy tính thành công!' });
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
   * Tìm kiếm shortcut hoặc file thực thi của ứng dụng trong Start Menu & Desktop & AppData
   * @param {string} targetName 
   * @returns {string|null}
   */
  static findInstalledApp(targetName) {
    const cleanTarget = targetName.toLowerCase().trim();
    const searchDirs = [
      path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs'),
      path.join(process.env.ProgramData || '', 'Microsoft/Windows/Start Menu/Programs'),
      path.join(process.env.USERPROFILE || '', 'Desktop'),
      'C:/Users/Public/Desktop',
      path.join(process.env.LOCALAPPDATA || '', 'Programs'),
      'C:/Program Files',
      'C:/Program Files (x86)'
    ];

    const searchInDir = (dir, depth = 0) => {
      if (depth > 3 || !fs.existsSync(dir)) return null;
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        // Ưu tiên khớp file .lnk hoặc .exe trước
        for (const item of items) {
          if (!item.isDirectory()) {
            const name = item.name.toLowerCase();
            if ((name.endsWith('.lnk') || name.endsWith('.exe')) && name.includes(cleanTarget)) {
              return path.join(dir, item.name);
            }
          }
        }
        // Duyệt các thư mục con
        for (const item of items) {
          if (item.isDirectory() && !item.name.startsWith('$') && !item.name.startsWith('.')) {
            const found = searchInDir(path.join(dir, item.name), depth + 1);
            if (found) return found;
          }
        }
      } catch (_) {}
      return null;
    };

    for (const d of searchDirs) {
      const match = searchInDir(d, 0);
      if (match) return match;
    }
    return null;
  }

  /**
   * Mở bất kỳ ứng dụng hoặc trang Web nào trên máy tính một cách thông minh
   * @param {string} target Tên app (Antigravity, Chrome, Word, Excel, VSCode...) hoặc URL (https://...)
   */
  static openAppOrUrl(target) {
    return new Promise((resolve) => {
      if (!target || typeof target !== 'string' || !target.trim()) {
        return resolve({ success: false, error: '⚠️ Vui lòng nhập tên ứng dụng hoặc link cần mở (VD: /pc open Antigravity hoặc /pc open chrome).' });
      }

      const clean = target.trim();
      const lower = clean.toLowerCase();

      // 1. Nếu là đường dẫn Web URL
      if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('www.') || lower.includes('.com') || lower.includes('.vn') || lower.includes('.edu.vn')) {
        const url = (lower.startsWith('http://') || lower.startsWith('https://')) ? clean : `https://${clean}`;
        exec(`explorer.exe "${url}"`, (err) => {
          if (err) {
            exec(`powershell.exe -NoProfile -Command "Start-Process '${url}'"`);
          }
          return resolve({ success: true, message: `🌐 Đã mở trang web "${url}" trên trình duyệt máy tính của anh!` });
        });
        return;
      }

      // 1.1. Tra cứu tên trang web phổ biến (VD: youtube, facebook, chatgpt, github)
      const webAliasMap = {
        youtube: 'https://www.youtube.com',
        yt: 'https://www.youtube.com',
        facebook: 'https://www.facebook.com',
        fb: 'https://www.facebook.com',
        google: 'https://www.google.com',
        gg: 'https://www.google.com',
        github: 'https://github.com',
        chatgpt: 'https://chatgpt.com',
        portal: 'https://stdportal.tdtu.edu.vn',
        stdportal: 'https://stdportal.tdtu.edu.vn',
        tdtu: 'https://tdtu.edu.vn'
      };

      if (webAliasMap[lower]) {
        const url = webAliasMap[lower];
        exec(`explorer.exe "${url}"`, (err) => {
          if (err) {
            exec(`powershell.exe -NoProfile -Command "Start-Process '${url}'"`);
          }
          return resolve({ success: true, message: `🌐 Đã mở trang web "${url}" trên trình duyệt máy tính của anh!` });
        });
        return;
      }

      // 2. Nếu là đường dẫn file / folder cụ thể có tồn tại
      if (fs.existsSync(clean)) {
        exec(`explorer.exe "${clean}"`, (err) => {
          if (err) return resolve({ success: false, error: `❌ Không thể mở file/thư mục: ${err.message}` });
          return resolve({ success: true, message: `📁 Đã mở file/thư mục "${path.basename(clean)}" trên máy tính!` });
        });
        return;
      }

      // 3. Tra cứu nhanh các alias phổ biến của Windows
      const aliasMap = {
        word: 'winword',
        excel: 'excel',
        powerpoint: 'powerpnt',
        ppt: 'powerpnt',
        calc: 'calc',
        calculator: 'calc',
        notepad: 'notepad',
        paint: 'mspaint',
        cmd: 'cmd',
        terminal: 'wt',
        powershell: 'powershell',
        ps: 'powershell',
        explorer: 'explorer',
        control: 'control',
        taskmgr: 'taskmgr',
        taskmanager: 'taskmgr',
        settings: 'ms-settings:',
        caidat: 'ms-settings:',
        chrome: 'chrome',
        edge: 'msedge',
        brave: 'brave',
        firefox: 'firefox',
        vscode: 'code',
        code: 'code'
      };

      if (aliasMap[lower]) {
        const cmd = aliasMap[lower];
        exec(`powershell.exe -NoProfile -Command "Start-Process '${cmd}'"`, (err) => {
          if (!err) {
            return resolve({ success: true, message: `🚀 Đã mở ứng dụng "${clean}" trên máy tính của anh!` });
          }
          exec(`explorer.exe "${cmd}"`);
          return resolve({ success: true, message: `🚀 Đã mở ứng dụng "${clean}" trên máy tính của anh!` });
        });
        return;
      }

      // 4. Tìm kiếm thông minh trong Start Menu & Desktop & Program Files (.lnk / .exe)
      const shortcut = WindowsController.findInstalledApp(lower);
      if (shortcut) {
        exec(`explorer.exe "${shortcut}"`, (err) => {
          if (err) {
            return resolve({ success: false, error: `❌ Không thể mở ứng dụng: ${err.message}` });
          }
          const appDisplayName = path.basename(shortcut, path.extname(shortcut));
          return resolve({
            success: true,
            message: `🚀 Đã tìm thấy và mở ứng dụng "${appDisplayName}" trên máy tính của anh thành công! ✨`
          });
        });
        return;
      }

      // 5. Thử kiểm tra xem lệnh có trong PATH không bằng where.exe
      exec(`where.exe "${clean}"`, (whereErr, whereOut) => {
        if (!whereErr && whereOut.trim()) {
          exec(`powershell.exe -NoProfile -Command "Start-Process '${clean}'"`);
          return resolve({ success: true, message: `🚀 Đã khởi chạy "${clean}" trên máy tính của anh!` });
        }


        // Báo lỗi thân thiện, lịch sự thay vì ném raw XML stack trace
        return resolve({
          success: false,
          error: `⚠️ Không tìm thấy ứng dụng "${clean}" trong danh sách cài đặt trên máy tính của anh.\n💡 Gợi ý: Anh hãy thử gõ tên viết tắt (VD: chrome, vscode, antigravity, word, excel, notepad, zalo) hoặc cung cấp đường dẫn file .exe nhé! 🌸`
        });
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
