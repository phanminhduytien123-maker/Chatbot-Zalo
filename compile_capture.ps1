$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
& $csc /target:exe /out:"scripts\DianaScreenCapture.exe" /r:System.Drawing.dll /r:System.Windows.Forms.dll "scripts\DianaScreenCapture.cs"
if (Test-Path "scripts\DianaScreenCapture.exe") {
    $testOut = "data\screenshots\test_native_shot.png"
    if (Test-Path $testOut) { Remove-Item $testOut -Force }
    & "scripts\DianaScreenCapture.exe" $testOut
    if (Test-Path $testOut) {
        Get-Item $testOut | Format-Table Name, Length
    } else {
        Write-Host "Output file not generated!"
    }
}
