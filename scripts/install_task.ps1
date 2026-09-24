[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "CÀI ĐẶT MỞ KHÓA ĐẶC QUYỀN SYSTEM (DIANA PC AGENT)"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   🚀 ĐANG CÀI ĐẶT TÁC VỤ MỞ KHÓA MÀN HÌNH ĐẶC QUYỀN SYSTEM" -ForegroundColor Cyan
Write-Host "   (Cho phép Bot mở khóa màn hình Windows 11/10 như TeamViewer)" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$workerExe = Join-Path $PSScriptRoot "DianaUnlockWorker.exe"
$buildScript = Join-Path $PSScriptRoot "build_worker.ps1"
$psScript = Join-Path $PSScriptRoot "system_unlock.ps1"

# 1. Biên dịch worker nếu chưa có
Write-Host "[1/3] Đang kiểm tra và biên dịch công cụ nền DianaUnlockWorker.exe..." -ForegroundColor Yellow
if (-not (Test-Path $workerExe)) {
    & $buildScript
}
Write-Host " -> OK: DianaUnlockWorker.exe đã sẵn sàng!" -ForegroundColor Green

# 2. Xóa task cũ nếu tồn tại
Write-Host ""
Write-Host "[2/3] Đang cấu hình Scheduled Task 'DianaUnlockTask' chạy dưới quyền NT AUTHORITY\SYSTEM..." -ForegroundColor Yellow
& schtasks /delete /tn "DianaUnlockTask" /f 2>$null | Out-Null

# 3. Tạo Scheduled Task đặc quyền SYSTEM
$action = "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$psScript`""
& schtasks /create /tn "DianaUnlockTask" /tr $action /sc ONCE /st "00:00" /ru "NT AUTHORITY\SYSTEM" /rl HIGHEST /f | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "   ✅ CÀI ĐẶT THÀNH CÔNG TÁC VỤ MỞ KHÓA ĐẶC QUYỀN SYSTEM!" -ForegroundColor Green
    Write-Host ""
    Write-Host "   👉 Từ bây giờ, khi anh gửi lệnh /unlock hoặc /pc unlock từ Zalo," -ForegroundColor White
    Write-Host "      hệ thống sẽ tự động kích hoạt DianaUnlockTask để mở khóa máy tính" -ForegroundColor White
    Write-Host "      ngay cả khi màn hình đang khóa cứng ở Winlogon/LogonUI." -ForegroundColor White
    Write-Host "======================================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Đã xảy ra lỗi khi tạo Scheduled Task. Vui lòng đảm bảo bạn đã chọn 'Run as administrator'!" -ForegroundColor Red
}

Write-Host ""
Write-Host "Nhấn Enter để hoàn tất..." -ForegroundColor Cyan
try {
    Read-Host
} catch {
    Start-Sleep -Seconds 5
}
