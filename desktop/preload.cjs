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

  // ADB & Phone Mirroring & Dual Screen
  scanAdbDevices: () => ipcRenderer.invoke('scan-adb-devices'),
  getAdbDevices: () => ipcRenderer.invoke('get-adb-devices'),
  startPhoneMirror: (targetIp, mode) => ipcRenderer.invoke('start-phone-mirror', targetIp, mode),
  togglePhoneMirror: (targetIp, mode) => ipcRenderer.invoke('toggle-phone-mirror', targetIp, mode),
  startPhoneDual: (targetIp) => ipcRenderer.invoke('start-phone-dual', targetIp),
  togglePhoneDual: (targetIp) => ipcRenderer.invoke('toggle-phone-dual', targetIp),
  stopPhoneMirror: () => ipcRenderer.invoke('stop-phone-mirror'),
  getMirrorStatus: () => ipcRenderer.invoke('get-mirror-status'),

  // Air Gesture AI Controller
  toggleAirGesture: () => ipcRenderer.invoke('toggle-air-gesture'),
  startAirGesture: () => ipcRenderer.invoke('start-air-gesture'),
  stopAirGesture: () => ipcRenderer.invoke('stop-air-gesture'),
  getAirGestureStatus: () => ipcRenderer.invoke('get-air-gesture-status'),

  // Always-Listening Wake Listener ("Diana ơi" - Siri Mode)
  toggleWakeListener: () => ipcRenderer.invoke('toggle-wake-listener'),
  startWakeListener: () => ipcRenderer.invoke('start-wake-listener'),
  stopWakeListener: () => ipcRenderer.invoke('stop-wake-listener'),
  getWakeListenerStatus: () => ipcRenderer.invoke('get-wake-listener-status'),
  onWakeEvent: (callback) => {
    const sub = (_event, data) => callback(data);
    ipcRenderer.on('diana-wake-event', sub);
    return () => ipcRenderer.removeListener('diana-wake-event', sub);
  },

  // PC Controls
  lockPC: () => ipcRenderer.invoke('lock-pc'),
  sleepPC: () => ipcRenderer.invoke('sleep-pc'),

  // Bambu Lab A1 3D Printer Controls
  bambuGetStatus: () => ipcRenderer.invoke('bambu-get-status'),
  bambuGetConfig: () => ipcRenderer.invoke('bambu-get-config'),
  bambuSaveConfig: (config) => ipcRenderer.invoke('bambu-save-config', config),
  bambuConnect: (credentials) => ipcRenderer.invoke('bambu-connect', credentials),
  bambuDisconnect: () => ipcRenderer.invoke('bambu-disconnect'),
  bambuSendGcode: (gcode) => ipcRenderer.invoke('bambu-send-gcode', gcode),
  bambuSetTemp: (target, value) => ipcRenderer.invoke('bambu-set-temp', target, value),
  bambuSetSpeed: (level) => ipcRenderer.invoke('bambu-set-speed', level),
  bambuSetLight: (state) => ipcRenderer.invoke('bambu-set-light', state),
  bambuSetFan: (fanType, speed) => ipcRenderer.invoke('bambu-set-fan', fanType, speed),
  bambuControlPrint: (action) => ipcRenderer.invoke('bambu-control-print', action),
  bambuJog: (axis, distance) => ipcRenderer.invoke('bambu-jog', axis, distance),
  bambuHome: (axes) => ipcRenderer.invoke('bambu-home', axes),
  bambuFeedFilament: (amount) => ipcRenderer.invoke('bambu-feed-filament', amount),
  bambuSkipObjects: (objList) => ipcRenderer.invoke('bambu-skip-objects', objList),
  bambuGetPlateInfo: () => ipcRenderer.invoke('bambu-get-plate-info'),
  bambuFetchPlate: (force) => ipcRenderer.invoke('bambu-fetch-plate', force),
  bambuScanLan: () => ipcRenderer.invoke('bambu-scan-lan'),
  onBambuStatusUpdate: (callback) => {
    const sub = (_event, status) => callback(status);
    ipcRenderer.on('bambu-status-update', sub);
    return () => ipcRenderer.removeListener('bambu-status-update', sub);
  },
  onBambuConnected: (callback) => {
    const sub = (_event, status) => callback(status);
    ipcRenderer.on('bambu-connected', sub);
    return () => ipcRenderer.removeListener('bambu-connected', sub);
  },
  onBambuDisconnected: (callback) => {
    const sub = (_event) => callback();
    ipcRenderer.on('bambu-disconnected', sub);
    return () => ipcRenderer.removeListener('bambu-disconnected', sub);
  },

  // Logs & Events
  readLogs: () => ipcRenderer.invoke('read-logs'),
  onTriggerAction: (callback) => ipcRenderer.on('trigger-action', (_event, action) => callback(action))
});
