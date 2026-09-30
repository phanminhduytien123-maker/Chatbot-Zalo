using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;
using System.Runtime.InteropServices;

namespace ScreenTester {
    class Program {
        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();

        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetThreadDesktop(IntPtr hDesktop);

        static void Main(string[] args) {
            try {
                try { SetProcessDPIAware(); } catch {}
                
                IntPtr hDesktop = OpenInputDesktop(0, false, 0x01FF);
                Console.WriteLine("OpenInputDesktop: " + hDesktop);
                if (hDesktop != IntPtr.Zero) {
                    bool setRes = SetThreadDesktop(hDesktop);
                    Console.WriteLine("SetThreadDesktop: " + setRes);
                }

                Rectangle bounds = Screen.PrimaryScreen.Bounds;
                Console.WriteLine("Screen Bounds: " + bounds.Width + "x" + bounds.Height);

                string outPath = @"D:\Zalo Bot\data\screenshots\test_cs.png";
                using (Bitmap bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb)) {
                    using (Graphics g = Graphics.FromImage(bmp)) {
                        g.CopyFromScreen(bounds.X, bounds.Y, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
                    }
                    bmp.Save(outPath, ImageFormat.Png);
                }

                FileInfo fi = new FileInfo(outPath);
                Console.WriteLine("File saved: " + fi.Length + " bytes");
            } catch (Exception ex) {
                Console.WriteLine("Error: " + ex.ToString());
            }
        }
    }
}
