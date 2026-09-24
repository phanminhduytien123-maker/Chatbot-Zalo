import { exec, spawn } from 'child_process';
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
   * @param {string} [password='\\'] Mật khẩu mở khóa (mặc định là "\\")
   */
  static unlockScreen(password = '\\') {
    return new Promise((resolve) => {
      const pass = (password && typeof password === 'string' && password.trim()) ? password.trim() : '\\';
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
        Thread.Sleep(40);
        keybd_event(0, (byte)c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void Unlock(string pass) {
        // 1. Đánh thức màn hình khóa và đưa về ô nhập mật khẩu
        PressKey(0x1B); // ESC
        Thread.Sleep(250);
        PressKey(0x20); // SPACE
        Thread.Sleep(600);
        PressKey(0x20); // SPACE lần 2 để đẩy màn hình khóa lên
        Thread.Sleep(500);

        // 2. Xóa các ký tự đang có trong ô nhập để tránh bị dính ký tự cũ
        for (int i = 0; i < 6; i++) {
            PressKey(0x08); // BACKSPACE
            Thread.Sleep(30);
        }
        Thread.Sleep(150);

        // 3. Gõ mật khẩu
        foreach (char c in pass) {
            if (c == '\\\\') {
                PressKey(0xDC); // VK_OEM_5: Phím backslash '\\' chuẩn trên Windows
            } else if (c == '/') {
                PressKey(0xBF); // VK_OEM_2: Phím slash '/' chuẩn trên Windows
            } else {
                SendChar(c);
            }
            Thread.Sleep(60);
        }

        Thread.Sleep(300);
        // 4. Nhấn ENTER để xác nhận mở khóa
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
        resolve({ success: true, message: '🔇/🔊 Đã chuyển đổi trạng thái tắt/bật tiếng (Mute toggle)!' });
      });
    });
  }

  /**
   * Chạy đoạn mã PowerShell an toàn 100% không bị CMD nuốt dấu nháy kép bằng Base64 EncodedCommand
   * @param {string} script 
   * @returns {Promise<{ err: Error|null, stdout: string, stderr: string }>}
   */
  static runPowerShell(script) {
    return new Promise((resolve) => {
      const base64 = Buffer.from(script, 'utf16le').toString('base64');
      exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${base64}`, (err, stdout, stderr) => {
        resolve({ err, stdout: stdout ? stdout.trim() : '', stderr: stderr ? stderr.trim() : '' });
      });
    });
  }

  /**
   * Loại bỏ dấu tiếng Việt để so khớp ứng dụng thông minh
   * @param {string} str 
   * @returns {string}
   */
  static removeVietnameseTones(str) {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
    str = str.replace(/đ/g, 'd');
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
    str = str.replace(/Đ/g, 'D');
    return str;
  }

  /**
   * Quét toàn bộ phím tắt ứng dụng (.lnk, .url) trong Start Menu và Desktop
   * @returns {Array<{ filePath: string, displayName: string, normName: string }>}
   */
  static getAllInstalledShortcuts() {
    const searchDirs = [
      path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs'),
      path.join(process.env.ProgramData || '', 'Microsoft/Windows/Start Menu/Programs'),
      path.join(process.env.USERPROFILE || '', 'Desktop'),
      'C:/Users/Public/Desktop',
      path.join(process.env.LOCALAPPDATA || '', 'Programs'),
      'C:/Riot Games',
      'D:/Riot Games'
    ];

    const shortcuts = [];
    const ignoredKeywords = ['uninstall', 'go cai dat', 'help', 'readme', 'huong dan', 'manual', 'license', 'documentation'];

    const scanDir = (dir, depth = 0) => {
      if (depth > 4 || !fs.existsSync(dir)) return;
      try {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            if (!item.name.startsWith('$') && !item.name.startsWith('.')) {
              scanDir(full, depth + 1);
            }
          } else if (item.name.endsWith('.lnk') || item.name.endsWith('.url') || (dir.includes('Riot') && item.name.endsWith('.exe'))) {
            const rawName = item.name.replace(/\.(lnk|url|exe)$/i, '');
            const normName = WindowsController.removeVietnameseTones(rawName).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
            
            if (!normName || normName.length < 2) continue;
            if (ignoredKeywords.some(k => normName.includes(k))) continue;

            shortcuts.push({
              filePath: full,
              displayName: rawName,
              normName
            });
          }
        }
      } catch (_) {}
    };

    for (const d of searchDirs) {
      scanDir(d);
    }
    return shortcuts;
  }

  /**
   * Tìm kiếm shortcut hoặc file thực thi của ứng dụng trong Start Menu & Desktop
   * @param {string} targetName 
   * @returns {{ filePath: string, displayName: string }|null}
   */
  static findInstalledApp(targetName) {
    if (!targetName) return null;
    const normQuery = WindowsController.removeVietnameseTones(targetName).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normQuery || normQuery.length < 2) return null;

    const allShortcuts = WindowsController.getAllInstalledShortcuts();

    // Map các tên gọi thông thường sang tên chính xác
    const aliasMap = {
      lol: 'lien minh huyen thoai',
      'lien minh': 'lien minh huyen thoai',
      lmht: 'lien minh huyen thoai',
      tft: 'dau truong chan ly',
      dtcl: 'dau truong chan ly',
      word: 'word 2016',
      winword: 'word 2016',
      excel: 'excel 2016',
      powerpoint: 'powerpoint 2016',
      ppt: 'powerpoint 2016',
      chrome: 'google chrome',
      edge: 'microsoft edge',
      vscode: 'code',
      cad: 'autocad'
    };

    const finalQuery = aliasMap[normQuery] || normQuery;

    // 1. Khớp chính xác hoàn toàn
    for (const s of allShortcuts) {
      if (s.normName === finalQuery) return s;
    }

    // 2. Khớp theo từng từ riêng biệt (Ví dụ: "Word 2016" có từ "word")
    for (const s of allShortcuts) {
      const words = s.normName.split(/\s+/);
      if (words.includes(finalQuery)) return s;
    }

    // 3. Khớp bắt đầu bằng
    for (const s of allShortcuts) {
      if (s.normName.startsWith(finalQuery)) return s;
    }

    // 4. Khớp chứa chuỗi con (nếu query dài >= 3 ký tự)
    if (finalQuery.length >= 3) {
      for (const s of allShortcuts) {
        if (s.normName.includes(finalQuery)) return s;
      }
    }

    // 5. Khớp tất cả các từ trong query
    const queryWords = finalQuery.split(/\s+/).filter(w => w.length >= 2);
    if (queryWords.length > 1) {
      for (const s of allShortcuts) {
        if (queryWords.every(w => s.normName.includes(w))) return s;
      }
    }

    return null;
  }

  /**
   * Mở bất kỳ ứng dụng hoặc trang Web nào trên máy tính một cách thông minh và chắc chắn
   * @param {string} rawTarget Tên app (Antigravity, Chrome, Word, Excel, VSCode...) hoặc URL (https://...)
   */
  static async openAppOrUrl(rawTarget) {
    if (!rawTarget || typeof rawTarget !== 'string' || !rawTarget.trim()) {
      return { success: false, error: '⚠️ Vui lòng nhập tên ứng dụng hoặc link cần mở (VD: /pc open chrome hoặc /pc open https://facebook.com).' };
    }

    let clean = rawTarget.trim();
    let prev = '';
    while (prev !== clean) {
      prev = clean;
      clean = clean.replace(/^(?:mở|bật|open|chạy|vào|hãy|nhờ|phiền|vui\s+lòng)\s+/i, '')
                   .replace(/\s+(?:giùm|dùm|hộ|giúp|cho|với)\s+(?:anh|em|tôi|mình|tui)$/i, '')
                   .replace(/\s+(?:giùm|dùm|hộ|giúp|cho|với)$/i, '')
                   .replace(/\s+(?:trên\s+(?:máy\s+tính|máy|pc|laptop))$/i, '')
                   .replace(/\s+(?:đi|lên|nhé|nha|ạ|xíu|chút|nhanh|lẹ)$/i, '')
                   .trim();
    }

    const lower = clean.toLowerCase();

    // 1. Web URLs & Web Aliases
    const webAliasMap = {
      facebook: 'https://www.facebook.com',
      fb: 'https://www.facebook.com',
      youtube: 'https://www.youtube.com',
      yt: 'https://www.youtube.com',
      google: 'https://www.google.com',
      gg: 'https://www.google.com',
      github: 'https://github.com',
      git: 'https://github.com',
      chatgpt: 'https://chatgpt.com',
      gpt: 'https://chatgpt.com',
      openai: 'https://chatgpt.com',
      portal: 'https://stdportal.tdtu.edu.vn',
      stdportal: 'https://stdportal.tdtu.edu.vn',
      tdtu: 'https://tdtu.edu.vn',
      gmail: 'https://mail.google.com',
      mail: 'https://mail.google.com',
      zaloweb: 'https://chat.zalo.me',
      messenger: 'https://www.messenger.com',
      mess: 'https://www.messenger.com',
      tiktok: 'https://www.tiktok.com',
      tt: 'https://www.tiktok.com',
      instagram: 'https://www.instagram.com',
      insta: 'https://www.instagram.com',
      ig: 'https://www.instagram.com',
      twitter: 'https://x.com',
      x: 'https://x.com',
      reddit: 'https://www.reddit.com',
      netflix: 'https://www.netflix.com',
      spotify: 'https://open.spotify.com',
      canva: 'https://www.canva.com',
      notion: 'https://www.notion.so',
      shopee: 'https://shopee.vn',
      lazada: 'https://www.lazada.vn',
      tiki: 'https://tiki.vn',
      vnexpress: 'https://vnexpress.net',
      tuoitre: 'https://tuoitre.vn',
      thanhnien: 'https://thanhnien.vn',
      dantri: 'https://dantri.com.vn',
      zing: 'https://znews.vn',
      znews: 'https://znews.vn'
    };

    let urlToOpen = null;
    if (
      lower.startsWith('http://') || 
      lower.startsWith('https://') || 
      lower.startsWith('www.') || 
      lower.endsWith('.com') || 
      lower.endsWith('.vn') || 
      lower.endsWith('.edu.vn') || 
      lower.endsWith('.org') || 
      lower.endsWith('.net') || 
      lower.endsWith('.io') || 
      lower.endsWith('.ai')
    ) {
      urlToOpen = (lower.startsWith('http://') || lower.startsWith('https://')) ? clean : `https://${clean}`;
    } else if (webAliasMap[lower]) {
      urlToOpen = webAliasMap[lower];
    }

    if (urlToOpen) {
      // Mở URL bằng Explorer & WScript.Shell để chắc chắn hiện cửa sổ trình duyệt trên màn hình
      const ps = `
        Start-Process "explorer.exe" -ArgumentList "${urlToOpen}"
        $wsh = New-Object -ComObject WScript.Shell
        $wsh.Run('${urlToOpen.replace(/'/g, "''")}', 1, $false)
        Write-Output "OK"
      `;
      await WindowsController.runPowerShell(ps);
      return { success: true, message: `🌐 Đã mở trang web "${urlToOpen}" trên trình duyệt máy tính của anh!` };
    }

    // 2. Nếu là đường dẫn file / folder cụ thể có tồn tại
    if (fs.existsSync(clean)) {
      const ps = `
        $wsh = New-Object -ComObject WScript.Shell
        $wsh.Run('"${clean.replace(/"/g, '`"')}"', 1, $false)
        Write-Output "OK"
      `;
      await WindowsController.runPowerShell(ps);
      return { success: true, message: `📁 Đã mở "${path.basename(clean)}" trên máy tính!` };
    }

    // 3. Các alias ứng dụng hệ thống & lệnh dòng lệnh (calc, notepad, paint, cmd, wt, powershell...)
    const systemAliasMap = {
      calc: 'calc.exe',
      calculator: 'calc.exe',
      maytinh: 'calc.exe',
      'may tinh': 'calc.exe',
      notepad: 'notepad.exe',
      ghichu: 'notepad.exe',
      'ghi chu': 'notepad.exe',
      paint: 'mspaint.exe',
      mspaint: 'mspaint.exe',
      cmd: 'cmd.exe',
      terminal: 'wt.exe',
      wt: 'wt.exe',
      powershell: 'powershell.exe',
      ps: 'powershell.exe',
      explorer: 'explorer.exe',
      control: 'control.exe',
      taskmgr: 'taskmgr.exe',
      taskmanager: 'taskmgr.exe',
      settings: 'ms-settings:',
      caidat: 'ms-settings:',
      snippingtool: 'snippingtool.exe',
      snip: 'snippingtool.exe'
    };

    const normLower = WindowsController.removeVietnameseTones(lower).replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const sysCmd = systemAliasMap[lower] || systemAliasMap[normLower];
    if (sysCmd) {
      const ps = `
        $wsh = New-Object -ComObject WScript.Shell
        $wsh.Run('${sysCmd}', 1, $false)
        Write-Output "OK"
      `;
      const res = await WindowsController.runPowerShell(ps);
      if (res.stdout.includes('OK')) {
        return { success: true, message: `🚀 Đã mở ứng dụng "${clean}" trên máy tính của anh!` };
      }
    }

    // 4. Tìm shortcut trong Start Menu / Desktop
    const appFound = WindowsController.findInstalledApp(lower);
    if (appFound && appFound.filePath) {
      const ps = `
        $wsh = New-Object -ComObject WScript.Shell
        $wsh.Run('"${appFound.filePath.replace(/"/g, '`"')}"', 1, $false)
        Write-Output "OK"
      `;
      await WindowsController.runPowerShell(ps);
      return {
        success: true,
        message: `🚀 Đã tìm thấy và mở ứng dụng "${appFound.displayName}" trên máy tính của anh thành công! ✨`
      };
    }

    // 5. Thử khởi chạy trực tiếp bằng WScript.Shell
    const directPs = `
      try {
        $wsh = New-Object -ComObject WScript.Shell
        $wsh.Run('${clean.replace(/'/g, "''")}', 1, $false)
        Write-Output "OK"
      } catch {
        Write-Output "ERR:$($_.Exception.Message)"
      }
    `;
    const directRes = await WindowsController.runPowerShell(directPs);
    if (directRes.stdout.includes('OK')) {
      return { success: true, message: `🚀 Đã khởi chạy "${clean}" trên máy tính của anh!` };
    }

    return {
      success: false,
      error: `⚠️ Không tìm thấy ứng dụng "${clean}" trong danh sách cài đặt trên máy tính của anh.\n💡 Gợi ý: Anh hãy thử gõ tên viết tắt (VD: chrome, vscode, antigravity, word, excel, notepad, zalo, lol) hoặc cung cấp đường dẫn file .exe nhé! 🌸`
    };
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
