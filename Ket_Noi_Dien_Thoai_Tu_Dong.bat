@echo off
chcp 65001 >nul
title Diana - Tự động kết nối điện thoại Redmi K70
echo ========================================================
echo    🔍 ĐANG TỰ ĐỘNG DÒ TÌM VÀ KẾT NỐI REDMI K70 TRÊN MẠNG LAN...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    $adb = Join-Path $PSScriptRoot 'tools\scrcpy\adb.exe'
    if (-not (Test-Path $adb)) {
        Write-Host '❌ Không tìm thấy adb.exe tại tools\scrcpy\adb.exe' -ForegroundColor Red
        return
    }

    & $adb start-server | Out-Null

    # Lấy danh sách IP nội bộ hiện tại
    $ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Tailscale' -and $_.IPAddress -notmatch '^169\.254\.' }
    
    $found = $false
    foreach ($ipObj in $ips) {
        $ip = $ipObj.IPAddress
        $prefix = $ip.Substring(0, $ip.LastIndexOf('.'))
        Write-Host ('📡 Đang quét dải mạng: ' + $prefix + '.1 - 254 (Port 5555)...') -ForegroundColor Yellow

        $tasks = 1..254 | ForEach-Object {
            $targetIp = $prefix + '.' + $_
            [powershell]::Create().AddScript({
                param($tIp)
                $tcp = New-Object System.Net.Sockets.TcpClient
                $connect = $tcp.BeginConnect($tIp, 5555, $null, $null)
                $success = $connect.AsyncWaitHandle.WaitOne(300, $false)
                if ($success -and $tcp.Connected) {
                    $tcp.EndConnect($connect)
                    $tcp.Close()
                    return $tIp
                }
                $tcp.Close()
                return $null
            }).AddArgument($targetIp)
        }

        $running = $tasks | ForEach-Object { [PSCustomObject]@{ Pipe = $_; Handle = $_.BeginInvoke() } }
        foreach ($r in $running) {
            $res = $r.Pipe.EndInvoke($r.Handle)
            $r.Pipe.Dispose()
            if ($res) {
                Write-Host ('✅ ĐÃ TÌM THẤY ĐIỆN THOẠI TẠI: ' + $res + ':5555') -ForegroundColor Green
                & $adb connect ($res + ':5555')
                $found = $true
            }
        }
    }

    if (-not $found) {
        Write-Host '⚠️ Đang thử kiểm tra các IP quen thuộc (Cty: 192.168.100.225 / Nhà: 192.168.0.105)...' -ForegroundColor Cyan
        & $adb connect 192.168.100.225:5555
        & $adb connect 192.168.0.105:5555
    }

    Write-Host ''
    Write-Host '📱 DANH SÁCH THIẾT BỊ ADB ĐANG KẾT NỐI:' -ForegroundColor Cyan
    & $adb devices
}"

echo.
echo ========================================================
echo Hoàn tất! Bấm phím bất kỳ để đóng cửa sổ.
pause >nul
