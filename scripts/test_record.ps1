Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinMMRecordTest {
    [DllImport("winmm.dll", EntryPoint = "mciSendStringA", CharSet = CharSet.Ansi)]
    public static extern int mciSendString(string command, string returnString, int returnLength, int callback);
}
"@

[WinMMRecordTest]::mciSendString("close all", "", 0, 0)
[WinMMRecordTest]::mciSendString("open new type waveaudio alias recsound", "", 0, 0)
[WinMMRecordTest]::mciSendString("record recsound", "", 0, 0)
Write-Host "Recording 3 seconds..."
Start-Sleep -Seconds 3
$temp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "test_mic.wav")
[WinMMRecordTest]::mciSendString("save recsound `"$temp`"", "", 0, 0)
[WinMMRecordTest]::mciSendString("close recsound", "", 0, 0)

if (Test-Path $temp) {
    $len = (Get-Item $temp).Length
    Write-Host "Audio file saved: $len bytes"
    $bytes = [System.IO.File]::ReadAllBytes($temp)
    $b64 = [Convert]::ToBase64String($bytes)
    $body = @{ audio = $b64; mimeType = "audio/wav" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "https://diana-h73u.onrender.com/api/voice-audio" -Method POST -Body $body -ContentType "application/json; charset=utf-8"
    Write-Host "Response from server:"
    $res | ConvertTo-Json
    Remove-Item $temp -Force
} else {
    Write-Host "No file produced"
}
