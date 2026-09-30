const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dianaDesktop', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  reload: () => ipcRenderer.send('window-reload'),
  toggleDevTools: () => ipcRenderer.send('window-devtools'),

  // System Stats
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),

  // ADB & Phone Mirroring
  scanAdbDevices: () => ipcRenderer.invoke('scan-adb-devices'),
  getAdbDevices: () => ipcRenderer.invoke('get-adb-devices'),
  startPhoneMirror: (targetIp) => ipcRenderer.invoke('start-phone-mirror', targetIp),
  togglePhoneMirror: (targetIp) => ipcRenderer.invoke('toggle-phone-mirror', targetIp),
  stopPhoneMirror: () => ipcRenderer.invoke('stop-phone-mirror'),
  getMirrorStatus: () => ipcRenderer.invoke('get-mirror-status'),

  // Air Gesture AI Controller
  toggleAirGesture: () => ipcRenderer.invoke('toggle-air-gesture'),
  startAirGesture: () => ipcRenderer.invoke('start-air-gesture'),
  stopAirGesture: () => ipcRenderer.invoke('stop-air-gesture'),
  getAirGestureStatus: () => ipcRenderer.invoke('get-air-gesture-status'),

  // PC Controls
  lockPC: () => ipcRenderer.invoke('lock-pc'),
  sleepPC: () => ipcRenderer.invoke('sleep-pc'),

  // Logs & Events
  readLogs: () => ipcRenderer.invoke('read-logs'),
  onTriggerAction: (callback) => ipcRenderer.on('trigger-action', (_event, action) => callback(action))
});
