param (
    [string]$Action = "status"
)

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir
$pidFile = Join-Path $rootDir ".pc_agent.pid"
$logFile = Join-Path $rootDir "pc_agent.log"
$vbsPath = Join-Path $rootDir "Chay_Ngam.vbs"

function Get-AgentProcess {
    if (Test-Path $pidFile) {
        $savedPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Out-String
        if ($savedPid) {
            $pidNum = [int]($savedPid.Trim())
            $proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
            if ($proc -and ($proc.ProcessName -eq "node")) {
                return $proc
            }
        }
    }
    return $null
}

if ($Action -eq "start") {
    $existing = Get-AgentProcess
    if ($existing) {
        Write-Host "Diana PC Agent dang chay ngam (PID: $($existing.Id))." -ForegroundColor Yellow
    } else {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "node.exe"
        $psi.Arguments = "pcAgent.js"
        $psi.CreateNoWindow = $true
        $psi.UseShellExecute = $false
        $psi.WorkingDirectory = $rootDir
        $p = [System.Diagnostics.Process]::Start($psi)
        
        Start-Sleep -Milliseconds 1500
        $newProc = Get-AgentProcess
        if ($newProc) {
            Write-Host "Da khoi dong Diana PC Agent chay ngam thanh cong! (PID: $($newProc.Id))" -ForegroundColor Green
        } else {
            Write-Host "Da gui lenh khoi dong chay ngam." -ForegroundColor Cyan
        }
    }
}
elseif ($Action -eq "stop") {
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host " DANG TAT DIANA PC AGENT CHAY NGAM..." -ForegroundColor Yellow
    Write-Host "=====================================================" -ForegroundColor Cyan
    
    $proc = Get-AgentProcess
    if ($proc) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "Da dung tien trinh PC Agent (PID: $($proc.Id))" -ForegroundColor Green
        if (Test-Path $pidFile) { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }
        Write-Host "`nHoan tat! Diana PC Agent da dung." -ForegroundColor Green
    } else {
        Write-Host "Hien tai khong co tien trinh Diana PC Agent nao dang chay." -ForegroundColor Yellow
    }
}
elseif ($Action -eq "status") {
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host " KIEM TRA TRANG THAI DIANA PC AGENT" -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Cyan
    
    $proc = Get-AgentProcess
    if ($proc) {
        Write-Host "TRANG THAI: DANG CHAY NGAM (ONLINE)" -ForegroundColor Green
        Write-Host "   * Process ID (PID) : $($proc.Id)" -ForegroundColor White
        Write-Host "   * Bat dau luc      : $($proc.StartTime.ToString('HH:mm:ss dd/MM/yyyy'))" -ForegroundColor Gray
        Write-Host "   * Bo nho RAM       : $([math]::Round($proc.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Gray
    } else {
        Write-Host "TRANG THAI: DANG TAT (OFFLINE)" -ForegroundColor Red
        Write-Host "Goi y: Chay file 'Chay_PC_Agent_Ngam.bat' de bat len nhe." -ForegroundColor Yellow
    }

    Write-Host "`n-----------------------------------------------------" -ForegroundColor DarkGray
    Write-Host " NHAT KY HOAT DONG GAN NHAT (pc_agent.log):" -ForegroundColor Cyan
    Write-Host "-----------------------------------------------------" -ForegroundColor DarkGray
    if (Test-Path $logFile) {
        Get-Content $logFile -Tail 15 | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
    } else {
        Write-Host "Chua co file log hoac chua co hoat dong." -ForegroundColor DarkGray
    }
    Write-Host "=====================================================" -ForegroundColor Cyan
}
elseif ($Action -eq "install") {
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host " CAI DAT TU DONG KHOI DONG CUNG WINDOWS" -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Cyan
    
    $startupFolder = [Environment]::GetFolderPath('Startup')
    $shortcutPath = Join-Path $startupFolder "Diana_PC_Agent.lnk"

    $ws = New-Object -ComObject WScript.Shell
    $shortcut = $ws.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "wscript.exe"
    $shortcut.Arguments = "`"$vbsPath`""
    $shortcut.WorkingDirectory = $rootDir
    $shortcut.Description = "Diana Windows PC Agent Auto-Startup"
    $shortcut.Save()

    Write-Host "DA CAI DAT TU KHOI DONG THANH CONG!" -ForegroundColor Green
    Write-Host "File Startup: $shortcutPath" -ForegroundColor White
    Write-Host "`nDang kich hoat chay ngam..." -ForegroundColor Cyan
    
    $existing = Get-AgentProcess
    if (-not $existing) {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "node.exe"
        $psi.Arguments = "pcAgent.js"
        $psi.CreateNoWindow = $true
        $psi.UseShellExecute = $false
        $psi.WorkingDirectory = $rootDir
        $p = [System.Diagnostics.Process]::Start($psi)
    }
    
    Write-Host "Xong! Tu nay moi khi bat may tinh, Diana PC Agent se luon tu dong chay ngam." -ForegroundColor Green
}
elseif ($Action -eq "uninstall") {
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host " GO BO TU DONG KHOI DONG CUNG WINDOWS" -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Cyan
    
    $startupFolder = [Environment]::GetFolderPath('Startup')
    $shortcutPath = Join-Path $startupFolder "Diana_PC_Agent.lnk"

    if (Test-Path $shortcutPath) {
        Remove-Item $shortcutPath -Force
        Write-Host "Da go bo cai dat tu dong khoi dong thanh cong!" -ForegroundColor Green
    } else {
        Write-Host "Khong tim thay shortcut trong thu muc Startup." -ForegroundColor Yellow
    }
}
