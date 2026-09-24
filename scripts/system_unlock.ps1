param(
    [string]$Password = "\"
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$passFile = Join-Path $PSScriptRoot "..\data\.unlock_pass"
if (Test-Path $passFile) {
    try {
        $savedPass = Get-Content $passFile -Raw
        if ($savedPass -and $savedPass.Trim()) {
            $Password = $savedPass.Trim()
        }
    } catch {}
}

$workerExe = Join-Path $PSScriptRoot "DianaUnlockWorker.exe"
if (-not (Test-Path $workerExe)) {
    & (Join-Path $PSScriptRoot "build_worker.ps1")
}

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

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

    public static string Launch(string exePath, string args) {
        uint activeSession = WTSGetActiveConsoleSessionId();
        Process[] procs = Process.GetProcessesByName("winlogon");
        Process target = null;
        foreach (var p in procs) {
            if (p.SessionId == activeSession) {
                target = p;
                break;
            }
        }

        if (target == null) {
            try {
                Process.Start(exePath, args);
                return "STARTED_DIRECT_FALLBACK";
            } catch (Exception ex) {
                return "ERR_DIRECT: " + ex.Message;
            }
        }

        IntPtr hProc = OpenProcess(PROCESS_ALL_ACCESS, false, target.Id);
        if (hProc == IntPtr.Zero) return "ERR_OPEN_PROCESS: " + Marshal.GetLastWin32Error();

        IntPtr hToken;
        if (!OpenProcessToken(hProc, TOKEN_ALL_ACCESS, out hToken)) {
            CloseHandle(hProc);
            return "ERR_OPEN_TOKEN: " + Marshal.GetLastWin32Error();
        }

        IntPtr hDupToken;
        if (!DuplicateTokenEx(hToken, TOKEN_ALL_ACCESS, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out hDupToken)) {
            CloseHandle(hToken);
            CloseHandle(hProc);
            return "ERR_DUP_TOKEN: " + Marshal.GetLastWin32Error();
        }

        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(si);
        si.lpDesktop = "winsta0\\winlogon";

        PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
        string cmd = "\"" + exePath + "\" \"" + args + "\"";
        string dir = System.IO.Path.GetDirectoryName(exePath);

        bool success = CreateProcessAsUser(
            hDupToken,
            null,
            cmd,
            IntPtr.Zero,
            IntPtr.Zero,
            false,
            0,
            IntPtr.Zero,
            dir,
            ref si,
            out pi);

        int err = success ? 0 : Marshal.GetLastWin32Error();

        CloseHandle(hDupToken);
        CloseHandle(hToken);
        CloseHandle(hProc);

        if (success) {
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
            return "OK_LAUNCHED_IN_WINLOGON";
        } else {
            return "ERR_CREATE_PROCESS: " + err;
        }
    }
}
'@

$res = [WinlogonLauncher]::Launch($workerExe, $Password)
Write-Output $res
