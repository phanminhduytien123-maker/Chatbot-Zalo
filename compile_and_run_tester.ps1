$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
& $csc /target:exe /out:"scripts\ScreenTester.exe" /r:System.Drawing.dll /r:System.Windows.Forms.dll "scripts\ScreenTester.cs"
if (Test-Path "scripts\ScreenTester.exe") {
    & "scripts\ScreenTester.exe"
}
