const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn, execFile } = require('child_process');

let mainWindow = null;
let streamWindow = null;
let tray = null;
let isQuitting = false;
let mirrorChildProcess = null;

// Hàm định vị chính xác đường dẫn công cụ thực tế
function resolveToolPath(toolName) {
  const candidates = [
    path.join('d:\\Zalo Bot', 'tools', 'scrcpy', toolName),
    path.resolve(__dirname, '..', 'tools', 'scrcpy', toolName),
    path.resolve(__dirname, '..', '..', 'tools', 'scrcpy', toolName),
    path.join(process.resourcesPath || '', 'tools', 'scrcpy', toolName),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'tools', 'scrcpy', toolName),
    path.join(path.dirname(app.getPath('exe')), 'tools', 'scrcpy', toolName),
    path.join(process.cwd(), 'tools', 'scrcpy', toolName)
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }
  return toolName;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 650,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0c0d0e',
    show: false,
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  mainWindow.maximize();
  mainWindow.show();

  mainWindow.webContents.session.clearCache();

  const devRendererPath = path.join('d:\\Zalo Bot', 'desktop', 'renderer', 'index.html');
  if (fs.existsSync(devRendererPath)) {
    mainWindow.loadFile(devRendererPath);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }

  // Bắt phím tắt Ctrl+R, Ctrl+Shift+R, F5 để Reload ngay lập tức bỏ qua cache
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (((input.control || input.meta) && input.key.toLowerCase() === 'r') || input.key === 'F5') {
      event.preventDefault();
      const devPath = path.join('d:\\Zalo Bot', 'desktop', 'renderer', 'index.html');
      if (fs.existsSync(devPath)) {
        mainWindow.loadFile(devPath);
      } else {
        mainWindow.webContents.reloadIgnoringCache();
      }
      return;
    }

    if (((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
      return;
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon?.({
          title: '🌸 Diana Central Station',
          content: 'Ứng dụng đang chạy ngầm trên khay hệ thống.'
        });
      }
    }
    return false;
  });
}

function openPhoneStreamWindow(targetIp = '192.168.100.225') {
  if (streamWindow && !streamWindow.isDestroyed()) {
    streamWindow.show();
    streamWindow.focus();
    return;
  }

  streamWindow = new BrowserWindow({
    width: 440,
    height: 880,
    minWidth: 360,
    minHeight: 640,
    title: '📱 Diana - Màn hình Điện thoại (Redmi K70 Live Stream)',
    backgroundColor: '#0c0d0e',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const cleanIp = targetIp.includes(':') ? targetIp.split(':')[0] : targetIp;
  const streamHtmlPath = path.join(__dirname, 'renderer', 'stream.html');
  streamWindow.loadFile(streamHtmlPath, { query: { ip: cleanIp, port: '8088' } });

  streamWindow.on('closed', () => {
    streamWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'renderer', 'icon.png');
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('🌸 Diana Central Station (Trạm Trung Tâm Diana)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🌸 Mở Trạm Trung Tâm Diana',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '📱 Chiếu Màn Hình Điện Thoại (60 FPS)',
      click: () => {
        launchPhoneMirror();
      }
    },
    {
      label: '🔒 Khóa Máy Tính (Win + L)',
      click: () => {
        exec('rundll32.exe user32.dll,LockWorkStation');
      }
    },
    {
      label: '🌐 Mở Web Dashboard',
      click: () => {
        shell.openExternal('http://localhost:3000');
      }
    },
    { type: 'separator' },
    {
      label: '❌ Thoát Hoàn Toàn',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// -------------------------------------------------------------
// SMART ADB AUTO-HEALING & DISCOVERY
// -------------------------------------------------------------
async function autoDiscoverAndConnect() {
  const adbExe = resolveToolPath('adb.exe');

  return new Promise((resolve) => {
    execFile(adbExe, ['devices', '-l'], { timeout: 4000, windowsHide: true }, async (err, stdout) => {
      if (err) return resolve({ success: false, error: err.message, devices: [] });

      const lines = (stdout || '').split('\n');
      const activeDevices = [];
      let ipDevice = null;
      let namedDevice = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('List of') && /\sdevice(\s|$)/.test(trimmed)) {
          const serial = trimmed.split(/\s+/)[0].trim();
          if (serial) {
            activeDevices.push(serial);
            if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(serial)) {
              ipDevice = serial;
            } else if (trimmed.includes('23113RKC6C') || trimmed.includes('vermeer')) {
              namedDevice = serial;
            }
          }
        }
      }

      const primary = ipDevice || namedDevice || (activeDevices.length > 0 ? activeDevices[0] : null);

      resolve({
        success: true,
        devices: activeDevices,
        primaryDevice: primary
      });
    });
  });
}

// -------------------------------------------------------------
// IPC HANDLERS - GIAO TIẾP VỚI GIAO DIỆN
// -------------------------------------------------------------

// Điều khiển cửa sổ (Minimize / Maximize / Close)
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.hide());

// Lấy thông tin tài nguyên hệ thống (System Stats)
ipcMain.handle('get-system-stats', async () => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = Math.round((usedMem / totalMem) * 100);

  let totalIdle = 0, totalTick = 0;
  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  const cpuPercent = Math.min(100, Math.max(1, Math.round((1 - (totalIdle / totalTick)) * 100)));

  return {
    cpuModel: cpus[0]?.model || 'Processor',
    cpuCores: cpus.length,
    cpuUsage: cpuPercent,
    totalMemGB: (totalMem / (1024 ** 3)).toFixed(1),
    usedMemGB: (usedMem / (1024 ** 3)).toFixed(1),
    memUsagePercent,
    hostname: os.hostname(),
    platform: os.platform(),
    uptimeHours: (os.uptime() / 3600).toFixed(1)
  };
});

// Quét dải mạng LAN để tìm thiết bị ADB (Port 5555 & Port 8088)
ipcMain.handle('scan-adb-devices', async () => {
  const net = require('net');
  const interfaces = os.networkInterfaces();
  const subnets = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        parts.pop();
        subnets.push(parts.join('.'));
      }
    }
  }

  const results = [];
  const checkPort = (ip, port) => new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(250);
    socket.on('connect', () => { socket.destroy(); resolve(ip); });
    socket.on('error', () => { socket.destroy(); resolve(null); });
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
    try { socket.connect(port, ip); } catch (_) { resolve(null); }
  });

  for (const subnet of subnets) {
    const tasks = Array.from({ length: 254 }, (_, i) => checkPort(`${subnet}.${i + 1}`, 5555));
    const found = (await Promise.all(tasks)).filter(Boolean);
    results.push(...found);
  }
  return results;
});

// Lấy danh sách thiết bị ADB đang kết nối
ipcMain.handle('get-adb-devices', async () => {
  return await autoDiscoverAndConnect();
});

// Bắt đầu hoặc tắt chiếu màn hình Scrcpy 60 FPS (Toggle Switch thông minh)
function launchPhoneMirror(targetInput = '') {
  return new Promise(async (resolve) => {
    const scrcpyExe = resolveToolPath('scrcpy.exe');
    const adbExe = resolveToolPath('adb.exe');

    // 1. KIỂM TRA SCRCPY ĐANG CHẠY -> NẾU ĐANG CHẠY THÌ TẮT NGAY (TOGGLE SWITCH 1 CHẠM)
    const isRunning = await new Promise((res) => {
      exec('tasklist /FI "IMAGENAME eq scrcpy.exe" /NH', { windowsHide: true }, (e, out) => {
        res(Boolean(out && out.includes('scrcpy.exe')));
      });
    });

    if (isRunning) {
      exec('taskkill /F /IM scrcpy.exe', { windowsHide: true }, () => {
        resolve({
          success: true,
          action: 'stopped',
          isMirroring: false,
          message: 'Đã tắt chiếu màn hình thành công!'
        });
      });
      return;
    }

    // 2. TÌM & KẾT NỐI THIẾT BỊ ADB ĐANG HOẠT ĐỘNG
    let target = (targetInput && typeof targetInput === 'string') ? targetInput.trim() : '';

    // Nếu người dùng nhập hoặc truyền IP cụ thể, chủ động kết nối ADB trước
    if (target && target.includes(':')) {
      await new Promise(res => execFile(adbExe, ['connect', target], { timeout: 2500, windowsHide: true }, () => res()));
    }

    // Tự động phát hiện thiết bị online
    const discovery = await autoDiscoverAndConnect();
    let foundActive = discovery.primaryDevice;

    // Nếu chưa có thiết bị nào đang kết nối, thử tự động kết nối các IP mạng LAN đã lưu
    if (!foundActive) {
      const candidates = [
        target,
        '192.168.100.225:5555',
        '192.168.100.148:5555'
      ].filter(Boolean);

      for (const cand of candidates) {
        await new Promise(res => execFile(adbExe, ['connect', cand], { timeout: 2000, windowsHide: true }, () => res()));
        const isOnline = await new Promise(res => {
          execFile(adbExe, ['-s', cand, 'get-state'], { timeout: 1500, windowsHide: true }, (err, stdout) => {
            res(stdout && stdout.trim() === 'device');
          });
        });
        if (isOnline) {
          foundActive = cand;
          break;
        }
      }
    }

    target = foundActive || target || '192.168.100.225:5555';

    // 3. Kiểm tra lại trạng thái kết nối
    let isOnline = await new Promise(res => {
      execFile(adbExe, ['-s', target, 'get-state'], { timeout: 2500, windowsHide: true }, (err, stdout) => {
        res(stdout && stdout.trim() === 'device');
      });
    });

    if (!isOnline) {
      // Thử kết nối lại lần cuối
      await new Promise(res => execFile(adbExe, ['connect', target], { timeout: 2500, windowsHide: true }, () => res()));
      isOnline = await new Promise(res => {
        execFile(adbExe, ['-s', target, 'get-state'], { timeout: 2000, windowsHide: true }, (err, stdout) => {
          res(stdout && stdout.trim() === 'device');
        });
      });
    }

    // 4. KHỞI CHẠY SCRCPY 60 FPS (ẨN HOÀN TOÀN CỬA SỔ TERMINAL ĐEN, TRIỆT TIÊU LỖI 0x800700e8)
    if (isOnline) {
      exec('taskkill /F /IM scrcpy.exe', { windowsHide: true }, () => {});

      const scrcpyDir = path.dirname(scrcpyExe);
      const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${scrcpyDir.replace(/\\/g, '\\\\')}"
WshShell.Run "cmd /c start """" scrcpy.exe -s ${target} --no-audio --video-codec=h264 --window-title ""📱 Diana - Màn hình Điện thoại (Redmi K70)"" --max-size 1440 --video-bit-rate 8M --max-fps 60 --stay-awake --always-on-top --push-target /sdcard/Pictures/", 0, False
`;
      const tempVbs = path.join(os.tmpdir(), `diana_desk_scrcpy_${Date.now()}.vbs`);

      try {
        fs.writeFileSync(tempVbs, vbsContent, 'utf8');
        execFile('wscript.exe', [tempVbs], { windowsHide: true }, () => {
          setTimeout(() => {
            try { fs.unlinkSync(tempVbs); } catch (_) {}
          }, 3000);
        });

        setTimeout(() => {
          exec('tasklist /FI "IMAGENAME eq scrcpy.exe" /NH', { windowsHide: true }, (e, out) => {
            if (out && out.includes('scrcpy.exe')) {
              resolve({
                success: true,
                action: 'started',
                isMirroring: true,
                mode: 'scrcpy',
                activeDevice: target,
                message: `Đã kết nối Scrcpy 60 FPS siêu mượt với ${target}!`
              });
            } else {
              resolve({
                success: false,
                error: `Scrcpy không thể khởi chạy trên ${target}. Vui lòng kiểm tra lại Gỡ lỗi không dây trên điện thoại.`
              });
            }
          });
        }, 1500);
        return;
      } catch (err) {
        return resolve({ success: false, error: err.message });
      }
    }

    resolve({
      success: false,
      error: `Chưa tìm thấy điện thoại đang kết nối ADB (${target}). Vui lòng kiểm tra mục Gỡ lỗi không dây trên điện thoại.`
    });
  });
}

ipcMain.handle('start-phone-mirror', async (event, targetIp) => {
  return await launchPhoneMirror(targetIp);
});

ipcMain.handle('toggle-phone-mirror', async (event, targetIp) => {
  return await launchPhoneMirror(targetIp);
});

ipcMain.handle('stop-phone-mirror', async () => {
  return new Promise((resolve) => {
    exec('taskkill /F /IM scrcpy.exe', { windowsHide: true }, () => {
      resolve({
        success: true,
        action: 'stopped',
        isMirroring: false,
        message: 'Đã tắt chiếu màn hình thành công!'
      });
    });
  });
});

// Kiểm tra trạng thái mirror scrcpy (cho đồng bộ UI real-time)
ipcMain.handle('get-mirror-status', async () => {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq scrcpy.exe" /NH', { windowsHide: true, timeout: 2000 }, (e, out) => {
      resolve({
        mirrorActive: out && out.includes('scrcpy.exe'),
      });
    });
  });
});

// -------------------------------------------------------------
// AIR GESTURE AI CONTROLLER
// -------------------------------------------------------------
function resolvePythonExe() {
  const candidates = [
    'C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Launcher', 'py.exe'),
    'python.exe',
    'python'
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return 'python';
}

function getAirGesturePid() {
  const pidFile = path.join('d:\\Zalo Bot', '.air_gesture.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (pid && !isNaN(pid)) return pid;
    } catch (_) {}
  }
  return null;
}

function isAirGestureRunning() {
  return new Promise((resolve) => {
    const pid = getAirGesturePid();
    if (pid) {
      exec(`tasklist /FI "PID eq ${pid}" /NH`, { windowsHide: true, timeout: 2000 }, (err, stdout) => {
        if (stdout && stdout.includes(String(pid)) && stdout.toLowerCase().includes('python')) {
          return resolve(true);
        }
        checkByCmd();
      });
    } else {
      checkByCmd();
    }

    function checkByCmd() {
      const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name LIKE 'python%' AND CommandLine LIKE '%air_gesture_controller.py%'\\" | Select-Object -ExpandProperty ProcessId"`;
      exec(psCmd, { windowsHide: true, timeout: 3000 }, (err, stdout) => {
        const hasPid = Boolean(stdout && stdout.trim().length > 0 && !isNaN(parseInt(stdout.trim(), 10)));
        resolve(hasPid);
      });
    }
  });
}

function startAirGesture() {
  return new Promise(async (resolve) => {
    const running = await isAirGestureRunning();
    if (running) return resolve({ success: true, active: true, message: 'Air Gesture AI đang chạy.' });

    const candidates = [
      path.join('d:\\Zalo Bot', 'scripts', 'air_gesture_controller.py'),
      path.resolve(__dirname, '..', 'scripts', 'air_gesture_controller.py')
    ];
    const scriptPath = candidates.find(p => fs.existsSync(p));
    if (!scriptPath) return resolve({ success: false, error: 'Không tìm thấy scripts/air_gesture_controller.py' });

    const pythonExe = resolvePythonExe();

    try {
      const child = spawn(pythonExe, [scriptPath], {
        cwd: path.dirname(scriptPath),
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();

      const pidFile = path.join('d:\\Zalo Bot', '.air_gesture.pid');
      try {
        fs.writeFileSync(pidFile, String(child.pid), 'utf8');
      } catch (_) {}

      resolve({
        success: true,
        active: true,
        pid: child.pid,
        message: 'Đã kích hoạt Air Gesture AI thành công!'
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

function stopAirGesture() {
  return new Promise((resolve) => {
    const pid = getAirGesturePid();
    if (pid) {
      exec(`taskkill /F /PID ${pid}`, { windowsHide: true }, () => {});
    }
    const psKill = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"CommandLine LIKE '%air_gesture_controller.py%'\\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`;
    exec(psKill, { windowsHide: true }, () => {
      const pidFile = path.join('d:\\Zalo Bot', '.air_gesture.pid');
      if (fs.existsSync(pidFile)) {
        try { fs.unlinkSync(pidFile); } catch (_) {}
      }
      resolve({ success: true, active: false, message: 'Đã dừng Air Gesture AI.' });
    });
  });
}

ipcMain.handle('start-air-gesture', async () => await startAirGesture());
ipcMain.handle('stop-air-gesture', async () => await stopAirGesture());
ipcMain.handle('toggle-air-gesture', async () => {
  const running = await isAirGestureRunning();
  if (running) {
    return await stopAirGesture();
  } else {
    return await startAirGesture();
  }
});
ipcMain.handle('get-air-gesture-status', async () => {
  const running = await isAirGestureRunning();
  return { success: true, active: running };
});

// Điều khiển PC (Lock / Sleep / Shutdown)
ipcMain.handle('lock-pc', async () => {
  return new Promise(resolve => {
    exec('rundll32.exe user32.dll,LockWorkStation', (err) => {
      resolve({ success: !err, message: err ? err.message : 'Đã khóa máy tính' });
    });
  });
});

ipcMain.handle('sleep-pc', async () => {
  return new Promise(resolve => {
    exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', (err) => {
      resolve({ success: !err, message: err ? err.message : 'Đã chuyển sang chế độ Sleep' });
    });
  });
});

// Đọc log của PC Agent / Server
ipcMain.handle('read-logs', async () => {
  const candidates = [
    path.join('d:\\Zalo Bot', 'pc_agent.log'),
    path.join(process.cwd(), 'pc_agent.log'),
    path.resolve(__dirname, '..', '..', 'pc_agent.log'),
    path.resolve(__dirname, '..', 'pc_agent.log')
  ];

  for (const logPath of candidates) {
    try {
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n').slice(-150);
        return { success: true, logs: lines.join('\n') };
      }
    } catch (_) {}
  }
  return { 
    success: true, 
    logs: `[${new Date().toLocaleTimeString()}] Diana Central Station Khởi Chạy Thành Công.\n[${new Date().toLocaleTimeString()}] Sẵn sàng nhận lệnh điều khiển PC & Chiếu màn hình điện thoại 60 FPS.` 
  };
});

ipcMain.on('window-reload', () => {
  const devPath = path.join('d:\\Zalo Bot', 'desktop', 'renderer', 'index.html');
  if (fs.existsSync(devPath) && mainWindow) {
    mainWindow.loadFile(devPath);
  } else {
    mainWindow?.webContents.reloadIgnoringCache();
  }
});

ipcMain.on('window-devtools', () => {
  mainWindow?.webContents.toggleDevTools();
});

// -------------------------------------------------------------
// APP LIFECYCLE
// -------------------------------------------------------------
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // Giữ app chạy ngầm trong khay hệ thống
    }
  });
