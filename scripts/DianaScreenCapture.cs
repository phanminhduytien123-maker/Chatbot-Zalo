using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;
using System.Runtime.InteropServices;

namespace DianaScreenCapture {
    class Program {
        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();

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

        public const uint DESKTOP_ALL = 0x01FF;
        public const uint MOUSEEVENTF_MOVE = 0x0001;
        public const uint WM_SYSCOMMAND = 0x0112;
        public const int SC_MONITORPOWER = 0xF170;

        static void WakeDisplay() {
            try {
                PostMessage((IntPtr)0xFFFF, WM_SYSCOMMAND, (IntPtr)SC_MONITORPOWER, (IntPtr)(-1));
                mouse_event(MOUSEEVENTF_MOVE, 1, 1, 0, UIntPtr.Zero);
                mouse_event(MOUSEEVENTF_MOVE, -1, -1, 0, UIntPtr.Zero);
            } catch {}
        }

        static void Main(string[] args) {
            try {
                try { SetProcessDPIAware(); } catch {}

                string outputPath = null;
                if (args.Length > 0 && !string.IsNullOrEmpty(args[0])) {
                    outputPath = args[0];
                }

                if (string.IsNullOrEmpty(outputPath)) {
                    string defaultDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\data\screenshots");
                    if (!Directory.Exists(defaultDir)) {
                        Directory.CreateDirectory(defaultDir);
                    }
                    outputPath = Path.Combine(defaultDir, string.Format("screen_{0}.png", DateTime.Now.Ticks));
                }

                // Đảm bảo thư mục đích tồn tại
                string dir = Path.GetDirectoryName(Path.GetFullPath(outputPath));
                if (!Directory.Exists(dir)) {
                    Directory.CreateDirectory(dir);
                }

                // Gắn vào Input Desktop hiện tại
                IntPtr hDesktop = OpenInputDesktop(0, false, DESKTOP_ALL);
                if (hDesktop != IntPtr.Zero) {
                    SetThreadDesktop(hDesktop);
                }

                WakeDisplay();

                Rectangle bounds = Screen.PrimaryScreen.Bounds;
                if (bounds.Width <= 0 || bounds.Height <= 0) {
                    bounds = new Rectangle(0, 0, 1920, 1080);
                }

                using (Bitmap bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb)) {
                    using (Graphics g = Graphics.FromImage(bmp)) {
                        g.CopyFromScreen(bounds.X, bounds.Y, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
                    }
                    bmp.Save(outputPath, ImageFormat.Png);
                }

                if (hDesktop != IntPtr.Zero) {
                    CloseDesktop(hDesktop);
                }

                Console.WriteLine("OK:" + outputPath);
            } catch (Exception ex) {
                Console.Error.WriteLine("ERROR:" + ex.Message);
                Environment.Exit(1);
            }
        }
    }
}
