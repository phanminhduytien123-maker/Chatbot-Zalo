$src = @"
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace DianaUnlock {
    class Program {
        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetThreadDesktop(IntPtr hDesktop);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool CloseDesktop(IntPtr hDesktop);

        [DllImport("user32.dll")]
        public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern short VkKeyScan(char ch);

        [DllImport("user32.dll")]
        public static extern uint MapVirtualKey(uint uCode, uint uMapType);

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

        public const uint DESKTOP_ALL = 0x01FF;
        public const uint KEYEVENTF_KEYUP = 0x0002;
        public const uint MOUSEEVENTF_MOVE = 0x0001;
        public const uint WM_SYSCOMMAND = 0x0112;
        public const int SC_MONITORPOWER = 0xF170;

        public const int SM_CXSCREEN = 0;
        public const int SM_CYSCREEN = 1;
        public const int SM_XVIRTUALSCREEN = 76;
        public const int SM_YVIRTUALSCREEN = 77;
        public const int SM_CXVIRTUALSCREEN = 78;
        public const int SM_CYVIRTUALSCREEN = 79;
        public const int SRCCOPY = 0x00CC0020;
        public const int CAPTUREBLT = 0x40000000;

        private static string logFile = @"D:\Zalo Bot\data\worker.log";

        public static void Log(string msg) {
            try {
                string line = string.Format("[{0:yyyy-MM-dd HH:mm:ss.fff}] {1}", DateTime.Now, msg);
                File.AppendAllText(logFile, line + Environment.NewLine);
            } catch { }
        }

        public static void AttachToInput(string stage) {
            try {
                IntPtr hDesktop = OpenInputDesktop(0, false, DESKTOP_ALL);
                if (hDesktop != IntPtr.Zero) {
                    bool ok = SetThreadDesktop(hDesktop);
                    Log(string.Format("AttachToInput ({0}): hDesktop={1}, SetThreadDesktop={2}", stage, hDesktop, ok));
                } else {
                    int err = Marshal.GetLastWin32Error();
                    Log(string.Format("AttachToInput ({0}): OpenInputDesktop failed, err={1}", stage, err));
                }
            } catch (Exception ex) {
                Log(string.Format("AttachToInput ({0}) exception: {1}", stage, ex.Message));
            }
        }

        public static void WakeDisplay() {
            try {
                Log("Waking display (SC_MONITORPOWER & mouse_event)...");
                PostMessage((IntPtr)0xFFFF, WM_SYSCOMMAND, (IntPtr)SC_MONITORPOWER, (IntPtr)(-1));
                Thread.Sleep(50);
                
                mouse_event(MOUSEEVENTF_MOVE, 2, 2, 0, UIntPtr.Zero);
                Thread.Sleep(30);
                mouse_event(MOUSEEVENTF_MOVE, -2, -2, 0, UIntPtr.Zero);
            } catch (Exception ex) {
                Log(string.Format("WakeDisplay exception: {0}", ex.Message));
            }
        }

        public static void PressKey(byte vk, int holdMs = 50) {
            byte scan = (byte)MapVirtualKey(vk, 0);
            keybd_event(vk, scan, 0, UIntPtr.Zero);
            Thread.Sleep(holdMs);
            keybd_event(vk, scan, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }

        public static void TypeChar(char c) {
            short res = VkKeyScan(c);
            if (res == -1) {
                Log(string.Format("VkKeyScan failed for char '{0}' (0x{1:X4})", c, (int)c));
                return;
            }
            byte vk = (byte)(res & 0xFF);
            byte shiftState = (byte)((res >> 8) & 0xFF);

            bool needShift = (shiftState & 1) != 0;
            bool needCtrl = (shiftState & 2) != 0;
            bool needAlt = (shiftState & 4) != 0;

            byte scan = (byte)MapVirtualKey(vk, 0);
            Log(string.Format("TypeChar: char='{0}', vk=0x{1:X2}, scan=0x{2:X2}, shift={3}", c, vk, scan, needShift));

            if (needShift) keybd_event(0x10, (byte)MapVirtualKey(0x10, 0), 0, UIntPtr.Zero);
            if (needCtrl) keybd_event(0x11, (byte)MapVirtualKey(0x11, 0), 0, UIntPtr.Zero);
            if (needAlt) keybd_event(0x12, (byte)MapVirtualKey(0x12, 0), 0, UIntPtr.Zero);
            Thread.Sleep(30);

            keybd_event(vk, scan, 0, UIntPtr.Zero);
            Thread.Sleep(50);
            keybd_event(vk, scan, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(30);

            if (needAlt) keybd_event(0x12, (byte)MapVirtualKey(0x12, 0), KEYEVENTF_KEYUP, UIntPtr.Zero);
            if (needCtrl) keybd_event(0x11, (byte)MapVirtualKey(0x11, 0), KEYEVENTF_KEYUP, UIntPtr.Zero);
            if (needShift) keybd_event(0x10, (byte)MapVirtualKey(0x10, 0), KEYEVENTF_KEYUP, UIntPtr.Zero);
        }

        static void Main(string[] args) {
            try {
                Log("=== DianaUnlockWorker Started ===");
                try { SetProcessDPIAware(); } catch {}

                if (args.Length > 0 && !string.IsNullOrEmpty(args[0]) && args[0].StartsWith("SCREENSHOT:")) {
                    string b64Path = args[0].Substring(11);
                    string targetPath = Encoding.UTF8.GetString(Convert.FromBase64String(b64Path));
                    Log(string.Format("Screenshot mode requested for: '{0}'", targetPath));

                    AttachToInput("Screenshot Mode");
                    WakeDisplay();
                    Thread.Sleep(100);

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

                        using (Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
                            using (Graphics g = Graphics.FromImage(bmp)) {
                                IntPtr hdcDest = g.GetHdc();
                                IntPtr hdcSrc = GetDC(IntPtr.Zero);
                                BitBlt(hdcDest, 0, 0, width, height, hdcSrc, left, top, SRCCOPY | CAPTUREBLT);
                                ReleaseDC(IntPtr.Zero, hdcSrc);
                                g.ReleaseHdc(hdcDest);
                            }
                            bmp.Save(targetPath, ImageFormat.Png);
                        }
                        Log(string.Format("Screenshot successfully saved to '{0}'", targetPath));
                    } catch (Exception ex) {
                        Log(string.Format("Screenshot error: {0}", ex.Message));
                    }
                    return;
                }

                string pass = "";
                if (args.Length > 0 && !string.IsNullOrEmpty(args[0])) {
                    string rawArg = args[0];
                    try {
                        byte[] bytes = Convert.FromBase64String(rawArg);
                        pass = Encoding.UTF8.GetString(bytes);
                        Log(string.Format("Decoded argument via Base64: '{0}'", pass));
                    } catch {
                        pass = rawArg;
                        Log(string.Format("Raw argument: '{0}'", pass));
                    }
                }

                if (string.IsNullOrEmpty(pass) || pass == "USE_PASS_FILE") {
                    string passFile = @"D:\Zalo Bot\data\.unlock_pass";
                    if (File.Exists(passFile)) {
                        try {
                            pass = File.ReadAllText(passFile).Trim();
                            Log(string.Format("Read password from .unlock_pass file: length={0}", pass.Length));
                        } catch (Exception ex) {
                            Log(string.Format("Read pass file err: {0}", ex.Message));
                        }
                    }
                }

                if (string.IsNullOrEmpty(pass)) {
                    pass = "\\";
                    Log("Defaulting password to '\\'");
                }

                Thread workerThread = new Thread(() => {
                    try {
                        // 1. Gắn vào input desktop hiện tại
                        AttachToInput("Stage 1 - Initial");

                        // 2. Đánh thức màn hình và di chuyển chuột nhẹ
                        WakeDisplay();
                        Thread.Sleep(100);

                        // 3. Gửi ESC và SPACE để đánh thức và gạt bỏ màn hình khóa wallpaper
                        Log("Sending ESC + SPACE to dismiss Lock Screen overlay...");
                        PressKey(0x1B, 50); // ESC
                        Thread.Sleep(200);
                        PressKey(0x20, 60); // SPACE
                        Thread.Sleep(200);
                        PressKey(0x20, 60); // SPACE lại lần nữa cho chắc chắn

                        // 4. Chờ hoạt ảnh chuyển cảnh của Windows 11 sang LogonUI (1.5s)
                        Log("Waiting 1500ms for Windows 11 LogonUI transition...");
                        Thread.Sleep(1500);

                        // 5. Gắn lại vào input desktop (lúc này đã là winlogon / LogonUI)
                        AttachToInput("Stage 2 - After Dismiss");

                        // 6. Xóa các ký tự cũ trong ô nhập mật khẩu
                        Log("Clearing password box with Backspaces...");
                        for (int i = 0; i < 15; i++) {
                            PressKey(0x08, 30); // BACKSPACE
                            Thread.Sleep(25);
                        }
                        Thread.Sleep(150);

                        // 7. Gõ từng ký tự mật khẩu
                        Log(string.Format("Typing password ({0} chars)...", pass.Length));
                        foreach (char c in pass) {
                            TypeChar(c);
                            Thread.Sleep(60);
                        }

                        Thread.Sleep(350);

                        // 8. Nhấn ENTER xác nhận
                        Log("Pressing ENTER to submit login...");
                        PressKey(0x0D, 60); // ENTER
                        Log("=== Unlock sequence finished successfully ===");
                    } catch (Exception ex) {
                        Log(string.Format("Worker thread exception: {0}", ex));
                    }
                });

                workerThread.SetApartmentState(ApartmentState.STA);
                workerThread.Start();
                workerThread.Join(12000);
            } catch (Exception ex) {
                Log(string.Format("Main exception: {0}", ex));
            }
        }
    }
}
"@

$targetExe = Join-Path $PSScriptRoot "DianaUnlockWorker.exe"
Add-Type -TypeDefinition $src -ReferencedAssemblies System.Drawing -OutputAssembly $targetExe -OutputType WindowsApplication
if (Test-Path $targetExe) {
    Write-Output "COMPILED_SUCCESSFULLY"
} else {
    Write-Output "COMPILATION_FAILED"
}
