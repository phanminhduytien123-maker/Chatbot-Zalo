$src = @"
using System;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ServiceProcess;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace DianaService {
    public class WinlogonLauncher {
        [StructLayout(LayoutKind.Sequential)]
        public struct STARTUPINFO {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public uint dwX;
            public uint dwY;
            public uint dwXSize;
            public uint dwYSize;
            public uint dwXCountChars;
            public uint dwYCountChars;
            public uint dwFillAttribute;
            public uint dwFlags;
            public ushort wShowWindow;
            public ushort cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct PROCESS_INFORMATION {
            public IntPtr hProcess;
            public IntPtr hThread;
            public uint dwProcessId;
            public uint dwThreadId;
        }

        [DllImport("kernel32.dll")]
        public static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

        [DllImport("advapi32.dll", SetLastError = true)]
        public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

        [DllImport("advapi32.dll", SetLastError = true)]
        public static extern bool DuplicateTokenEx(IntPtr hExistingToken, uint dwDesiredAccess, IntPtr lpTokenAttributes, int ImpersonationLevel, int TokenType, out IntPtr phNewToken);

        [DllImport("userenv.dll", SetLastError = true)]
        public static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

        [DllImport("userenv.dll", SetLastError = true)]
        public static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern bool CreateProcessAsUser(
            IntPtr hToken,
            string lpApplicationName,
            string lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr hObject);

        public const uint PROCESS_ALL_ACCESS = 0x1FFFFF;
        public const uint TOKEN_ALL_ACCESS = 0xF01FF;
        public const int SecurityImpersonation = 2;
        public const int TokenPrimary = 1;
        public const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;

        public static void Log(string msg) {
            try {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string logFile = Path.Combine(baseDir, "..", "data", "service.log");
                string line = string.Format("[{0:yyyy-MM-dd HH:mm:ss.fff}] {1}", DateTime.Now, msg);
                File.AppendAllText(logFile, line + Environment.NewLine);
            } catch { }
        }

        public static string LaunchWorker(string exePath, string arg) {
            try {
                uint activeSession = WTSGetActiveConsoleSessionId();
                Log(string.Format("LaunchWorker: activeSession={0}, exePath={1}", activeSession, exePath));

                Process[] procs = Process.GetProcessesByName("winlogon");
                Process target = null;
                foreach (var p in procs) {
                    if (p.SessionId == activeSession) {
                        target = p;
                        break;
                    }
                }

                if (target == null) {
                    Log("LaunchWorker: winlogon process not found in session " + activeSession);
                    return "WINLOGON_NOT_FOUND";
                }

                Log(string.Format("Found winlogon PID={0} in session={1}", target.Id, activeSession));

                IntPtr hProc = OpenProcess(PROCESS_ALL_ACCESS, false, target.Id);
                if (hProc == IntPtr.Zero) {
                    int err = Marshal.GetLastWin32Error();
                    Log("ERR_OPEN_PROCESS: " + err);
                    return "ERR_OPEN_PROCESS: " + err;
                }

                IntPtr hToken;
                if (!OpenProcessToken(hProc, TOKEN_ALL_ACCESS, out hToken)) {
                    int err = Marshal.GetLastWin32Error();
                    CloseHandle(hProc);
                    Log("ERR_OPEN_TOKEN: " + err);
                    return "ERR_OPEN_TOKEN: " + err;
                }

                IntPtr hDupToken;
                if (!DuplicateTokenEx(hToken, TOKEN_ALL_ACCESS, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out hDupToken)) {
                    int err = Marshal.GetLastWin32Error();
                    CloseHandle(hToken);
                    CloseHandle(hProc);
                    Log("ERR_DUP_TOKEN: " + err);
                    return "ERR_DUP_TOKEN: " + err;
                }

                IntPtr lpEnv = IntPtr.Zero;
                CreateEnvironmentBlock(out lpEnv, hDupToken, false);

                STARTUPINFO si = new STARTUPINFO();
                si.cb = Marshal.SizeOf(si);
                si.lpDesktop = @"winsta0\winlogon";

                PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
                string cmd = string.Format("\"{0}\" {1}", exePath, arg);
                string dir = Path.GetDirectoryName(exePath);

                Log(string.Format("Launching CreateProcessAsUser: cmd={0}", cmd));

                bool success = CreateProcessAsUser(
                    hDupToken,
                    null,
                    cmd,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    CREATE_UNICODE_ENVIRONMENT,
                    lpEnv,
                    dir,
                    ref si,
                    out pi);

                int lastErr = success ? 0 : Marshal.GetLastWin32Error();

                if (lpEnv != IntPtr.Zero) {
                    DestroyEnvironmentBlock(lpEnv);
                }

                CloseHandle(hDupToken);
                CloseHandle(hToken);
                CloseHandle(hProc);

                if (success) {
                    Log(string.Format("CreateProcessAsUser SUCCEEDED! Worker PID={0}", pi.dwProcessId));
                    CloseHandle(pi.hProcess);
                    CloseHandle(pi.hThread);
                    return "OK_LAUNCHED_IN_WINLOGON";
                } else {
                    Log("CreateProcessAsUser FAILED, err=" + lastErr);
                    return "ERR_CREATE_PROCESS: " + lastErr;
                }
            } catch (Exception ex) {
                Log("LaunchWorker Exception: " + ex.ToString());
                return "ERR_EXCEPTION: " + ex.Message;
            }
        }
    }

    public class DianaUnlockService : ServiceBase {
        private Thread listenerThread;
        private bool running = true;
        private string workerPath;

        public DianaUnlockService(string workerExe) {
            this.ServiceName = "DianaPCService";
            this.workerPath = workerExe;
        }

        protected override void OnStart(string[] args) {
            running = true;
            WinlogonLauncher.Log("DianaPCService Starting...");
            listenerThread = new Thread(PipeServerLoop);
            listenerThread.IsBackground = true;
            listenerThread.Start();
        }

        protected override void OnStop() {
            running = false;
            WinlogonLauncher.Log("DianaPCService Stopped.");
        }

        private void PipeServerLoop() {
            PipeSecurity ps = new PipeSecurity();
            SecurityIdentifier everyone = new SecurityIdentifier(WellKnownSidType.WorldSid, null);
            ps.AddAccessRule(new PipeAccessRule(everyone, PipeAccessRights.ReadWrite, AccessControlType.Allow));

            while (running) {
                try {
                    using (NamedPipeServerStream server = new NamedPipeServerStream(
                        "DianaUnlockPipe",
                        PipeDirection.InOut,
                        1,
                        PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous,
                        1024,
                        1024,
                        ps)) {
                        
                        server.WaitForConnection();

                        using (StreamReader reader = new StreamReader(server))
                        using (StreamWriter writer = new StreamWriter(server) { AutoFlush = true }) {
                            string line = reader.ReadLine();
                            WinlogonLauncher.Log("Pipe received: " + line);
                            if (!string.IsNullOrEmpty(line) && line.StartsWith("UNLOCK:")) {
                                string pass = line.Substring(7);
                                string base64Pass = Convert.ToBase64String(Encoding.UTF8.GetBytes(pass));
                                string res = WinlogonLauncher.LaunchWorker(workerPath, base64Pass);
                                writer.WriteLine(res);
                            } else {
                                writer.WriteLine("ERR_INVALID_COMMAND");
                            }
                        }
                    }
                } catch (Exception ex) {
                    WinlogonLauncher.Log("PipeServerLoop exception: " + ex.Message);
                    Thread.Sleep(300);
                }
            }
        }
    }

    class Program {
        static void Main(string[] args) {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string workerExe = Path.Combine(baseDir, "DianaUnlockWorker.exe");
            ServiceBase.Run(new DianaUnlockService(workerExe));
        }
    }
}
"@

$targetExe = Join-Path $PSScriptRoot "DianaPCService.exe"
$refs = @("System.ServiceProcess", "System.Core")
Add-Type -TypeDefinition $src -ReferencedAssemblies $refs -OutputAssembly $targetExe -OutputType WindowsApplication
if (Test-Path $targetExe) {
    Write-Output "SERVICE_COMPILED_SUCCESSFULLY"
} else {
    Write-Output "SERVICE_COMPILATION_FAILED"
}
