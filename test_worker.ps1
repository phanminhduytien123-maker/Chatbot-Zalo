$targetPath = "D:\Zalo Bot\data\screenshots\test_worker_shot.png"
if (Test-Path $targetPath) { Remove-Item $targetPath -Force }
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($targetPath))
& "D:\Zalo Bot\scripts\DianaUnlockWorker.exe" "SCREENSHOT:$b64"
if (Test-Path $targetPath) {
    Get-Item $targetPath | Format-Table Name, Length
} else {
    Write-Host "File was not created!"
}
if (Test-Path "D:\Zalo Bot\data\worker.log") {
    Get-Content "D:\Zalo Bot\data\worker.log" -Tail 15
}
