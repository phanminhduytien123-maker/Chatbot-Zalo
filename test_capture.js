import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.resolve(__dirname, 'data', 'screenshots', 'test_lock_cap.png');

const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;

public class UniversalScreenCapture {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetThreadDesktop(uint dwThreadId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

    public const uint DESKTOP_READOBJECTS = 0x0001;
    public const uint DESKTOP_CREATEWINDOW = 0x0002;
    public const uint DESKTOP_CREATEMENU = 0x0004;
    public const uint DESKTOP_HOOKCONTROL = 0x0008;
    public const uint DESKTOP_JOURNALRECORD = 0x0010;
    public const uint DESKTOP_JOURNALPLAYBACK = 0x0020;
    public const uint DESKTOP_ENUMERATE = 0x0040;
    public const uint DESKTOP_WRITEOBJECTS = 0x0080;
    public const uint DESKTOP_SWITCHDESKTOP = 0x0100;
    public const uint GENERIC_ALL = 0x10000000;
    public const uint DESKTOP_ALL = 0x01FF;

    public const int SM_CXSCREEN = 0;
    public const int SM_CYSCREEN = 1;
    public const int SM_XVIRTUALSCREEN = 76;
    public const int SM_YVIRTUALSCREEN = 77;
    public const int SM_CXVIRTUALSCREEN = 78;
    public const int SM_CYVIRTUALSCREEN = 79;
    public const int SRCCOPY = 0x00CC0020;
    public const int CAPTUREBLT = 0x40000000;

    public static string CaptureAndSave(string filePath) {
        string log = "START;";
        try { SetProcessDPIAware(); } catch {}

        // Wake screen
        try {
            mouse_event(1, 1, 1, 0, 0);
            mouse_event(1, -1, -1, 0, 0);
        } catch {}

        IntPtr origDesktop = GetThreadDesktop(GetCurrentThreadId());
        IntPtr inputDesktop = OpenInputDesktop(0, false, GENERIC_ALL);

        if (inputDesktop == IntPtr.Zero) {
            inputDesktop = OpenInputDesktop(0, false, DESKTOP_SWITCHDESKTOP | DESKTOP_READOBJECTS | DESKTOP_WRITEOBJECTS);
        }

        bool desktopSwitched = false;
        if (inputDesktop != IntPtr.Zero && inputDesktop != origDesktop) {
            desktopSwitched = SetThreadDesktop(inputDesktop);
            log += "SWITCHED:" + desktopSwitched + ";";
        } else {
            log += "NO_INPUT_DESK_OR_SAME;";
        }

        try {
            int left = GetSystemMetrics(SM_XVIRTUALSCREEN);
            int top = GetSystemMetrics(SM_YVIRTUALSCREEN);
            int width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            int height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

            if (width <= 0 || height <= 0) {
                width = GetSystemMetrics(SM_CXSCREEN);
                height = GetSystemMetrics(SM_CYSCREEN);
            }
            if (width <= 0) width = 1920;
            if (height <= 0) height = 1080;

            log += "RES:" + width + "x" + height + ";";

            using (Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(bmp)) {
                    IntPtr hdcDest = g.GetHdc();
                    IntPtr hdcSrc = GetDC(IntPtr.Zero);
                    bool blt = BitBlt(hdcDest, 0, 0, width, height, hdcSrc, left, top, SRCCOPY | CAPTUREBLT);
                    log += "BLT:" + blt + ";";
                    ReleaseDC(IntPtr.Zero, hdcSrc);
                    g.ReleaseHdc(hdcDest);
                }
                bmp.Save(filePath, ImageFormat.Png);
            }
            log += "SAVED_OK";
        } catch (Exception ex) {
            log += "ERR:" + ex.Message;
        } finally {
            if (desktopSwitched && origDesktop != IntPtr.Zero) {
                SetThreadDesktop(origDesktop);
            }
            if (inputDesktop != IntPtr.Zero && inputDesktop != origDesktop) {
                CloseDesktop(inputDesktop);
            }
        }
        return log;
    }
}
'@ -ReferencedAssemblies System.Drawing

$res = [UniversalScreenCapture]::CaptureAndSave('${outputPath.replace(/\\/g, '\\\\')}')
Write-Output $res
`;

const tmpPs = path.join(os.tmpdir(), `diana_cap_${Date.now()}.ps1`);
fs.writeFileSync(tmpPs, psScript, 'utf8');

execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPs], (err, stdout, stderr) => {
  try { fs.unlinkSync(tmpPs); } catch (_) {}
  console.log('RESULT:', stdout.trim());
  if (stderr.trim()) console.log('STDERR:', stderr.trim());
  if (fs.existsSync(outputPath)) {
    console.log('File size bytes:', fs.statSync(outputPath).size);
  }
});
