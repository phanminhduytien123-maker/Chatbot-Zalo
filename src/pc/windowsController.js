import { exec, spawn, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
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
   * Gửi lệnh mở khóa tới Windows Service đặc quyền SYSTEM qua Named Pipe (TeamViewer Mode)
   * @param {string} password 
   * @returns {Promise<{ success: boolean, output?: string, error?: string }>}
   */
  static unlockViaService(password) {
    return new Promise((resolve) => {
      const pass = (password && typeof password === 'string' && password.trim()) ? password.trim() : '\\';
      
      // Ghi mật khẩu an toàn vào file dữ liệu trước
      try {
        const passFile = path.resolve(config.paths.dataDir, '.unlock_pass');
        fs.writeFileSync(passFile, pass, 'utf8');
      } catch (_) {}

      const client = net.connect('\\\\.\\pipe\\DianaUnlockPipe', () => {
        // Gửi cờ an toàn USE_PASS_FILE nếu mật khẩu có ký tự đặc biệt / backslash
        const payload = pass.includes('\\') || pass.includes('"') ? 'USE_PASS_FILE' : pass;
        client.write(`UNLOCK:${payload}\n`);
      });

      let response = '';
      client.on('data', (data) => {
        response += data.toString();
      });

      client.on('end', () => {
        client.destroy();
        resolve({
          success: response.includes('OK_LAUNCHED_IN_WINLOGON') || response.includes('OK'),
          output: response.trim()
        });
      });

      client.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      client.setTimeout(3500, () => {
        client.destroy();
        resolve({ success: false, error: 'TIMEOUT' });
      });
    });
  }

  /**
   * Mở khóa màn hình máy tính bằng mật khẩu / PIN (Hỗ trợ cả chế độ Windows Service SYSTEM và Native Fallback)
   * @param {string} [password='\\'] Mật khẩu mở khóa (mặc định là "\\")
   */
  static async unlockScreen(password = '\\') {
    const pass = (password && typeof password === 'string' && password.trim()) ? password.trim() : '\\';
    
    // 1. Thử gửi lệnh mở khóa qua Windows Service đặc quyền SYSTEM (DianaPCService)
    const serviceRes = await WindowsController.unlockViaService(pass);
    if (serviceRes.success) {
      return {
        success: true,
        message: `🔓 Đã mở khóa máy tính thành công!`
      };
    }

    // Lưu mật khẩu tạm thời vào data/.unlock_pass cho Scheduled Task đọc (nếu có)
    try {
      const passFile = path.resolve(config.paths.dataDir, '.unlock_pass');
      fs.writeFileSync(passFile, pass, 'utf8');
    } catch (_) {}

    // 2. Thử kích hoạt qua Scheduled Task đặc quyền SYSTEM (DianaUnlockTask)
    const taskResult = await new Promise((resolve) => {
      exec('schtasks /run /tn "DianaUnlockTask"', (err, stdout) => {
        if (!err && stdout && (stdout.includes('SUCCESS') || stdout.includes('thành công'))) {
          return resolve(true);
        }
        resolve(false);
      });
    });

    if (taskResult) {
      return {
        success: true,
        message: `🔓 Đã mở khóa máy tính thành công!`
      };
    }

    // 3. Fallback qua PowerShell native nếu chưa cài service
    const escapedPass = pass.replace(/'/g, "''");
    const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class ActiveDesktopUnlocker {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern short VkKeyScan(char ch);

    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);

    public const uint DESKTOP_ALL = 0x01FF;
    public const uint KEYEVENTF_KEYUP = 0x0002;

    public static void PressKey(byte vk, int holdMs = 50) {
        byte scan = (byte)MapVirtualKey(vk, 0);
        keybd_event(vk, scan, 0, UIntPtr.Zero);
        Thread.Sleep(holdMs);
        keybd_event(vk, scan, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void TypeChar(char c) {
        short res = VkKeyScan(c);
        if (res == -1) return;
        byte vk = (byte)(res & 0xFF);
        byte shiftState = (byte)((res >> 8) & 0xFF);

        bool needShift = (shiftState & 1) != 0;
        bool needCtrl = (shiftState & 2) != 0;
        bool needAlt = (shiftState & 4) != 0;

        if (needShift) keybd_event(0x10, (byte)MapVirtualKey(0x10, 0), 0, UIntPtr.Zero);
        if (needCtrl) keybd_event(0x11, (byte)MapVirtualKey(0x11, 0), 0, UIntPtr.Zero);
        if (needAlt) keybd_event(0x12, (byte)MapVirtualKey(0x12, 0), 0, UIntPtr.Zero);
        Thread.Sleep(30);

        PressKey(vk, 50);
        Thread.Sleep(30);

        if (needAlt) keybd_event(0x12, (byte)MapVirtualKey(0x12, 0), KEYEVENTF_KEYUP, UIntPtr.Zero);
        if (needCtrl) keybd_event(0x11, (byte)MapVirtualKey(0x11, 0), KEYEVENTF_KEYUP, UIntPtr.Zero);
        if (needShift) keybd_event(0x10, (byte)MapVirtualKey(0x10, 0), KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static string Unlock(string pass) {
        string status = "UNKNOWN";
        Thread t = new Thread(() => {
            IntPtr hDesktop = OpenInputDesktop(0, false, DESKTOP_ALL);
            if (hDesktop != IntPtr.Zero) {
                SetThreadDesktop(hDesktop);
            }

            PressKey(0x1B, 50); // ESC
            Thread.Sleep(250);
            PressKey(0x20, 60); // SPACE
            Thread.Sleep(1500);

            IntPtr hDesktop2 = OpenInputDesktop(0, false, DESKTOP_ALL);
            if (hDesktop2 != IntPtr.Zero) {
                SetThreadDesktop(hDesktop2);
            }

            for (int i = 0; i < 12; i++) {
                PressKey(0x08, 30);
                Thread.Sleep(30);
            }
            Thread.Sleep(150);

            foreach (char c in pass) {
                TypeChar(c);
                Thread.Sleep(80);
            }
            Thread.Sleep(400);

            PressKey(0x0D, 60); // ENTER

            if (hDesktop2 != IntPtr.Zero) CloseDesktop(hDesktop2);
            if (hDesktop != IntPtr.Zero) CloseDesktop(hDesktop);

            status = "OK";
        });

        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();

        return status;
    }
}
'@

$res = [ActiveDesktopUnlocker]::Unlock('${escapedPass}')
Write-Output $res
    `.trim();

    const res = await WindowsController.runPowerShell(psScript);
    if (res.err || (res.stderr && !res.stdout.includes('OK'))) {
      return {
        success: false,
        error: `❌ Lỗi khi mở khóa máy: ${res.stderr || res.err?.message}\n💡 Mẹo: Anh hãy chạy file "Cai_Dat_Mo_Khoa_SYSTEM.bat" (Run as administrator) trên máy tính để kích hoạt quyền mở khóa Winlogon như TeamViewer nhé! 🌸`
      };
    }

    return {
      success: true,
      message: `🔓 Đã gửi lệnh đánh thức và mở khóa máy tính thành công với mật khẩu "${pass}"! ✨\n💡 Nếu máy vẫn chưa mở, anh chỉ cần chạy file "Cai_Dat_Mo_Khoa_SYSTEM.bat" (Run as admin) 1 lần duy nhất trên máy tính là được nhé! 🌸`
    };
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
        resolve({ success: true, message: '🖥️ Đã tắt màn hình máy tính!' });
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
        resolve({ success: true, message: '💡 Đã bật sáng màn hình máy tính!' });
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
        resolve({ success: true, message: '🔇/🔊 Đã chuyển đổi trạng thái tắt/bật âm thanh loa!' });
      });
    });
  }

  /**
   * Chạy đoạn mã PowerShell an toàn 100% bằng cách lưu file tạm thực thi (Không giới hạn độ dài dòng lệnh)
   * @param {string} script 
   * @returns {Promise<{ err: Error|null, stdout: string, stderr: string }>}
   */
  static runPowerShell(script) {
    return new Promise((resolve) => {
      const tmpFile = path.join(os.tmpdir(), `diana_ps_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.ps1`);
      try {
        fs.writeFileSync(tmpFile, script, 'utf8');
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile], (err, stdout, stderr) => {
          try { fs.unlinkSync(tmpFile); } catch (_) {}
          resolve({ err, stdout: stdout ? stdout.trim() : '', stderr: stderr ? stderr.trim() : '' });
        });
      } catch (e) {
        resolve({ err: e, stdout: '', stderr: e.message });
      }
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
   * Khởi chạy ứng dụng hoặc link đảm bảo luôn hiển thị cửa sổ trên màn hình tương tác người dùng
   * @param {string} target Đường dẫn file, shortcut, URL hoặc lệnh thực thi
   * @param {string} [args=""]
   * @returns {Promise<{ success: boolean, output: string }>}
   */
  static async launchInteractive(target, args = '') {
    const ps = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32Gui {
            [DllImport("user32.dll")]
            public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
            
            [DllImport("user32.dll")]
            public static extern bool SetForegroundWindow(IntPtr hWnd);
            
            [DllImport("user32.dll")]
            public static extern bool BringWindowToTop(IntPtr hWnd);
            
            [DllImport("user32.dll")]
            public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
            
            [DllImport("user32.dll")]
            public static extern IntPtr GetForegroundWindow();
            
            [DllImport("user32.dll")]
            public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
            
            [DllImport("user32.dll")]
            public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
            
            [DllImport("kernel32.dll")]
            public static extern uint GetCurrentThreadId();

            public const int SW_RESTORE = 9;
            public const int SW_SHOWNORMAL = 1;
            public const byte VK_MENU = 0x12;
            public const uint KEYEVENTF_KEYUP = 0x0002;

            public static void ForceForeground(IntPtr hWnd) {
                if (hWnd == IntPtr.Zero) return;
                ShowWindowAsync(hWnd, SW_RESTORE);
                ShowWindowAsync(hWnd, SW_SHOWNORMAL);

                keybd_event(VK_MENU, 0, 0, 0);
                SetForegroundWindow(hWnd);
                BringWindowToTop(hWnd);
                keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);

                IntPtr fgWnd = GetForegroundWindow();
                if (fgWnd != hWnd) {
                    uint fgThread = GetWindowThreadProcessId(fgWnd, IntPtr.Zero);
                    uint curThread = GetCurrentThreadId();
                    if (fgThread != curThread && fgThread != 0) {
                        AttachThreadInput(curThread, fgThread, true);
                        SetForegroundWindow(hWnd);
                        BringWindowToTop(hWnd);
                        AttachThreadInput(curThread, fgThread, false);
                    }
                }
            }
        }
"@

      $targetPath = '${target.replace(/'/g, "''")}'
      $argStr = '${args.replace(/'/g, "''")}'
      $isUrl = $targetPath -match '^(https?://|www\.)'

      # 1. Dọn dẹp các tiến trình zombie bị treo ẩn không có cửa sổ (MainWindowHandle = 0)
      $baseName = [System.IO.Path]::GetFileNameWithoutExtension($targetPath)
      if ($baseName -match '^(WINWORD|EXCEL|POWERPNT|notepad|mspaint)$') {
          Get-Process $baseName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -eq 0 } | ForEach-Object {
              Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
          }
      }

      # 2. Khởi chạy thông qua Windows Shell (Shell.Application) để luôn bật ở giao diện người dùng
      try {
          $shell = New-Object -ComObject Shell.Application
          $shell.ShellExecute($targetPath, $argStr, "", "open", 1)
          Write-Output "LAUNCHED_SHELL"
      } catch {
          try {
              $psi = New-Object System.Diagnostics.ProcessStartInfo
              $psi.FileName = $targetPath
              if ($argStr) { $psi.Arguments = $argStr }
              $psi.UseShellExecute = $true
              $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
              [System.Diagnostics.Process]::Start($psi) | Out-Null
              Write-Output "LAUNCHED_PSI"
          } catch {
              Write-Output "ERR:$($_.Exception.Message)"
          }
      }

      # 3. Kích hoạt và kéo cửa sổ ứng dụng hoặc trình duyệt lên vị trí nổi bật (Foreground)
      Start-Sleep -Milliseconds 600
      if ($isUrl) {
          $browserProcs = Get-Process chrome, msedge, brave, coccoc, firefox, iexplore -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
          foreach ($bp in $browserProcs) {
              [Win32Gui]::ForceForeground($bp.MainWindowHandle)
          }
      } else {
          $appProcs = Get-Process $baseName, WINWORD, EXCEL, POWERPNT, notepad, mspaint -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
          foreach ($ap in $appProcs) {
              [Win32Gui]::ForceForeground($ap.MainWindowHandle)
          }
      }
    `;

    const res = await WindowsController.runPowerShell(ps);
    return {
      success: !res.stdout.startsWith('ERR:'),
      output: res.stdout
    };
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
      await WindowsController.launchInteractive(urlToOpen);
      return { success: true, message: `🌐 Đã mở trang web "${urlToOpen}" trên trình duyệt máy tính của anh!` };
    }

    // 2. Nếu là đường dẫn file / folder cụ thể có tồn tại
    if (fs.existsSync(clean)) {
      await WindowsController.launchInteractive(clean);
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
      'file explorer': 'explorer.exe',
      'file explorere': 'explorer.exe',
      'this pc': 'explorer.exe',
      'my computer': 'explorer.exe',
      'thu muc': 'explorer.exe',
      'tap tin': 'explorer.exe',
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
      const res = await WindowsController.launchInteractive(sysCmd);
      if (res.success) {
        return { success: true, message: `🚀 Đã mở ứng dụng "${clean}" trên máy tính của anh!` };
      }
    }

    // 4. Tìm shortcut trong Start Menu / Desktop
    const appFound = WindowsController.findInstalledApp(lower);
    if (appFound && appFound.filePath) {
      const res = await WindowsController.launchInteractive(appFound.filePath);
      if (res.success) {
        return {
          success: true,
          message: `🚀 Đã tìm thấy và mở ứng dụng "${appFound.displayName}" trên máy tính của anh thành công! ✨`
        };
      }
    }

    // 5. Thử khởi chạy trực tiếp bằng launchInteractive
    const directRes = await WindowsController.launchInteractive(clean);
    if (directRes.success) {
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
          resolve({ success: true, message: '⚡ Đang tiến hành tắt máy tính...' });
        } else {
          resolve({ success: true, message: `⏱️ Đã đặt lịch tắt máy tính sau ${minutes} phút nữa!` });
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
        resolve({ success: true, message: '✅ Đã hủy lệnh tắt máy tính!' });
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
        resolve({ success: true, message: '💤 Đã cho máy tính vào chế độ Ngủ!' });
      });
    });
  }
}

export default WindowsController;
