import mqtt from 'mqtt';
import fs from 'fs';
import path from 'path';
import net from 'net';
import tls from 'tls';
import os from 'os';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import * as ftp from 'basic-ftp';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CONFIG_FILE = path.join(DATA_DIR, 'bambu_config.json');

/**
 * BAMBU LAB 3D PRINTER SERVICE (BAMBU LAB A1 / A1 MINI / P1 / X1)
 * High-performance MQTT & Local Protocol Bridge for Diana Central Station
 */
export class BambuLabService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.connected = false;
    this.isConnecting = false;
    this.sequenceId = 1;
    this.pollInterval = null;
    this.simulationTimer = null;

    // Camera Live Stream (Port 6000 TLS / MJPEG Engine)
    this.cameraSocket = null;
    this.isStreamingCamera = false;
    this.latestCameraFrame = null;
    this.latestCameraTimestamp = 0;
    this.cameraClients = new Set();

    // 3MF & Plate Object State
    this.plateInfo = null;
    this.isFetchingPlate = false;
    this.lastFetchedGcodeFile = '';

    // Config defaults
    this.config = {
      ip: '',
      accessCode: '',
      serialNumber: '',
      name: 'Bambu Lab A1 mini',
      autoConnect: true,
      simulationMode: false,
      cameraStreamUrl: ''
    };

    // Cached telemetry status
    this.status = {
      online: false,
      connected: false,
      isSimulation: false,
      model: 'Bambu Lab A1 mini',
      gcode_state: 'IDLE', // IDLE, PREPARE, RUNNING, PAUSE, FINISH, FAILED
      stage_name: 'Sẵn sàng',
      mc_percent: 0,
      mc_remaining_time: 0, // phút
      elapsed_time: 0, // phút
      nozzle_temper: 25.0,
      nozzle_target_temper: 0,
      bed_temper: 24.0,
      bed_target_temper: 0,
      chamber_temper: 26.0,
      fan_speed_percent: 0,
      aux_fan_speed_percent: 0,
      spd_lvl: 2, // 1: Silent (50%), 2: Standard (100%), 3: Sport (124%), 4: Ludicrous (166%)
      spd_mag: 100,
      layer_num: 0,
      total_layer_num: 0,
      subtask_name: 'Chưa có tệp in',
      gcode_file: '',
      light_state: false,
      wifi_signal: '-52 dBm',
      error_code: 0,
      error_text: '',
      ams: {
        active_slot: 0,
        trays: [
          { id: 0, name: 'Bambu PLA Basic', color: '16A34A', type: 'PLA', remain: 85, state: 'ready' },
          { id: 1, name: 'Bambu PLA Matte', color: 'E11D48', type: 'PLA', remain: 62, state: 'ready' },
          { id: 2, name: 'Bambu PETG HF', color: '2563EB', type: 'PETG', remain: 90, state: 'ready' },
          { id: 3, name: 'Bambu TPU 95A', color: 'F59E0B', type: 'TPU', remain: 40, state: 'ready' }
        ]
      },
      vt_tray: {
        id: 254,
        name: 'External Spool',
        color: 'FFFFFF',
        type: 'PLA',
        remain: 100
      },
      s_obj: [], // Danh sách ID chi tiết đang bị bỏ qua (Skip Objects)
      last_updated: Date.now()
    };

    this.isScanning = false;
    this.watchdogInterval = null;

    this.loadConfig();
    this.startWatchdog();
  }

  /**
   * Tải cấu hình từ file
   */
  loadConfig() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this.config = { ...this.config, ...parsed };
        this.status.ip = this.config.ip || '';
        this.status.serialNumber = this.config.serialNumber || '';
        this.status.model = this.config.name || 'Bambu Lab A1';
      }
      // Tự động kết nối máy in nếu đã có đủ thông tin
      if (this.config.autoConnect !== false && this.config.accessCode) {
        setTimeout(async () => {
          if (!this.connected && !this.isConnecting) {
            if (this.config.ip) {
              console.log(`🔌 [BambuService] Tự động kết nối tới ${this.config.ip}...`);
              const res = await this.connect().catch(() => ({ success: false }));
              if (res && res.success) return;
            }
            // Nếu không có IP hoặc IP cũ bị đổi -> Tự động quét tìm máy in trên mạng LAN
            console.log('🔍 [BambuService] Đang tự động dò tìm máy in trên mạng LAN...');
            this.autoDiscoverAndConnect().catch(e => console.error('Lỗi auto-discover Bambu:', e.message));
          }
        }, 500);
      }
    } catch (e) {
      console.error('❌ [BambuService] Lỗi đọc config:', e.message);
    }
  }

  /**
   * Bộ giám sát tự động kết nối lại (Watchdog Loop)
   */
  startWatchdog() {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(async () => {
      if (this.config.autoConnect !== false && this.config.accessCode && !this.config.simulationMode) {
        if (!this.connected && !this.isConnecting && !this.isScanning) {
          // Thử kết nối IP đã lưu trước
          if (this.config.ip) {
            const conn = await this.connect().catch(() => ({ success: false }));
            if (conn && conn.success) return;
          }
          // Nếu IP không phản hồi -> Tự động dò tìm IP mới trên mạng LAN
          await this.autoDiscoverAndConnect().catch(() => {});
        }
      }
    }, 10000);
  }

  /**
   * Lưu cấu hình vào file
   */
  saveConfig(newConfig = {}) {
    try {
      this.config = { ...this.config, ...newConfig };
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
      return { success: true, config: this.config };
    } catch (e) {
      console.error('❌ [BambuService] Lỗi lưu config:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Tự động quét mạng LAN tìm máy in Bambu Lab (Cổng MQTT 8883)
   */
  async scanLanPrinters() {
    const interfaces = os.networkInterfaces();
    const subnets = [];
    const localIps = new Set(['127.0.0.1', '0.0.0.0']);

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4') {
          localIps.add(iface.address);
          if (!iface.internal) {
            const parts = iface.address.split('.');
            parts.pop();
            subnets.push(parts.join('.'));
          }
        }
      }
    }

    const checkPort = (ip, port = 8883) => new Promise(resolve => {
      if (localIps.has(ip)) return resolve(null);
      const socket = new net.Socket();
      socket.setTimeout(350);
      socket.on('connect', () => { socket.destroy(); resolve(ip); });
      socket.on('error', () => { socket.destroy(); resolve(null); });
      socket.on('timeout', () => { socket.destroy(); resolve(null); });
      try { socket.connect(port, ip); } catch (_) { resolve(null); }
    });

    const getSerialFromTls = (ip) => new Promise(resolve => {
      const s = tls.connect({
        host: ip,
        port: 8883,
        rejectUnauthorized: false
      }, () => {
        try {
          const cert = s.getPeerCertificate();
          const serial = cert?.subject?.CN || '';
          s.destroy();
          resolve(serial);
        } catch (_) {
          s.destroy();
          resolve('');
        }
      });
      s.setTimeout(1500);
      s.on('error', () => { s.destroy(); resolve(''); });
      s.on('timeout', () => { s.destroy(); resolve(''); });
    });

    const foundIps = [];
    for (const subnet of [...new Set(subnets)]) {
      const tasks = Array.from({ length: 254 }, (_, i) => checkPort(`${subnet}.${i + 1}`, 8883));
      const results = (await Promise.all(tasks)).filter(Boolean);
      foundIps.push(...results);
    }

    const printers = [];
    for (const ip of foundIps) {
      const serial = await getSerialFromTls(ip);
      printers.push({
        ip,
        port: 8883,
        serialNumber: serial || this.config.serialNumber || '0300DA642803699',
        name: 'Bambu Lab A1 mini',
        suggested: ip === this.config.ip
      });
    }

    return {
      success: true,
      foundPrinters: printers
    };
  }

  /**
   * Tự động dò tìm máy in trên mạng LAN và tự động kết nối
   */
  async autoDiscoverAndConnect(force = false) {
    if (this.connected && !force) {
      return { success: true, message: 'Đã kết nối máy in Bambu Lab.', status: this.status };
    }
    if (this.isScanning) {
      return { success: false, message: 'Đang trong quá trình quét tìm máy in...' };
    }

    this.isScanning = true;
    console.log('🔍 [BambuService] Bắt đầu tự động quét tìm máy in Bambu Lab trên mạng...');

    try {
      const scanRes = await this.scanLanPrinters();
      this.isScanning = false;

      if (scanRes && scanRes.foundPrinters && scanRes.foundPrinters.length > 0) {
        const target = scanRes.foundPrinters[0];
        console.log(`✨ [BambuService] Tìm thấy máy in Bambu Lab tại IP: ${target.ip} (Serial: ${target.serialNumber})`);
        
        this.config.ip = target.ip;
        if (target.serialNumber) {
          this.config.serialNumber = target.serialNumber;
        }
        this.saveConfig();

        return await this.connect();
      } else {
        console.log('⚠️ [BambuService] Không tìm thấy máy in Bambu Lab nào trên các subnet mạng LAN.');
        return { success: false, error: 'Không tìm thấy máy in Bambu Lab trên mạng LAN.' };
      }
    } catch (e) {
      this.isScanning = false;
      console.error('❌ [BambuService] Lỗi quét tự động:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Kết nối tới máy in Bambu Lab A1 qua MQTTS
   */
  async connect(credentials = {}) {
    if (credentials.ip) this.config.ip = credentials.ip.trim();
    if (credentials.accessCode) this.config.accessCode = credentials.accessCode.trim();
    if (credentials.serialNumber) this.config.serialNumber = credentials.serialNumber.trim();
    if (typeof credentials.simulationMode === 'boolean') this.config.simulationMode = credentials.simulationMode;
    this.saveConfig();

    // Nếu kích hoạt chế độ Demo Giả Lập (Simulation)
    if (this.config.simulationMode) {
      this.startSimulation();
      return { success: true, message: 'Đã kích hoạt chế độ Giả Lập Bambu A1 mini (Demo Simulation Mode)', simulation: true };
    }

    // Nếu chưa có IP -> Tự động quét tìm
    if (!this.config.ip) {
      return await this.autoDiscoverAndConnect();
    }
    if (!this.config.accessCode) {
      return { success: false, error: 'Vui lòng nhập Access Code (Mã truy cập LAN) của máy in A1 mini.' };
    }

    // Đảm bảo có Serial Number để kết nối chính xác topic
    if (!this.config.serialNumber) {
      this.config.serialNumber = '0300DA642803699';
    }

    this.stopSimulation();
    this.disconnect();
    this.isConnecting = true;
    this.emit('connecting');

    const brokerUrl = `mqtts://${this.config.ip}:8883`;
    const options = {
      username: 'bblp',
      password: this.config.accessCode,
      rejectUnauthorized: false, // Bambu dùng Self-signed SSL Certificate
      checkServerIdentity: () => undefined,
      protocolVersion: 4,
      connectTimeout: 7000,
      reconnectPeriod: 4000,
      clientId: `diana_station_${Math.random().toString(16).substring(2, 8)}`,
      clean: true
    };

    return new Promise((resolve) => {
      let resolved = false;

      try {
        this.client = mqtt.connect(brokerUrl, options);

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.isConnecting = false;
            resolve({
              success: false,
              error: `Quá thời gian kết nối tới ${this.config.ip}:8883. Vui lòng kiểm tra IP và Access Code trên màn hình máy in Bambu Lab A1 mini.`
            });
          }
        }, 8000);

        this.client.on('connect', () => {
          clearTimeout(timeout);
          this.connected = true;
          this.isConnecting = false;
          this.status.connected = true;
          this.status.online = true;
          this.status.isSimulation = false;
          this.status.ip = this.config.ip;
          this.status.serialNumber = this.config.serialNumber;
          this.status.model = this.config.name || 'Bambu Lab A1';

          // Tự động nhận diện Serial Number từ SSL Certificate nếu có
          try {
            const stream = this.client?.stream;
            const cert = stream?.getPeerCertificate?.();
            if (cert && cert.subject && cert.subject.CN) {
              const detectedSerial = cert.subject.CN.trim();
              if (detectedSerial && detectedSerial !== this.config.serialNumber) {
                console.log(`🔍 [BambuService] Nhận diện Serial Number từ máy in: ${detectedSerial}`);
                this.config.serialNumber = detectedSerial;
                this.status.serialNumber = detectedSerial;
                this.saveConfig();
              }
            }
          } catch (_) {}

          console.log(`✅ [BambuService] Đã kết nối thành công tới Bambu Lab A1 mini (${this.config.ip})`);

          // Subscribe topic trạng thái chuẩn của máy in
          const reportTopic = `device/${this.config.serialNumber}/report`;

          this.client.subscribe(reportTopic, { qos: 0 }, (err) => {
            if (err) {
              console.error('❌ [BambuService] Lỗi subscribe topic:', err.message);
            } else {
              console.log(`📡 [BambuService] Đã lắng nghe topic: ${reportTopic}`);
              // Gửi yêu cầu lấy toàn bộ thông số ban đầu
              this.requestPushAll();
            }
          });

          // Bắt đầu heartbeat polling định kỳ 4 giây
          if (this.pollInterval) clearInterval(this.pollInterval);
          this.pollInterval = setInterval(() => {
            if (this.connected) this.requestPushAll();
          }, 4000);

          // Khởi động luồng Camera sẵn sàng
          this.startCameraStream();

          // Tự động tải thông tin bản in và chi tiết bàn in 3D từ máy in
          setTimeout(() => {
            if (!this.plateInfo) {
              this.fetchPlateInfoFromPrinter().catch(() => {});
            }
          }, 2000);

          this.emit('connected', this.status);
          if (!resolved) {
            resolved = true;
            resolve({
              success: true,
              message: `Kết nối thành công máy in Bambu Lab tại ${this.config.ip}!`,
              status: this.status
            });
          }
        });

        this.client.on('message', (topic, message) => {
          this.handleIncomingReport(topic, message);
        });

        this.client.on('error', async (err) => {
          console.error('⚠️ [BambuService] MQTT Error:', err.message);
          if (this.listenerCount('error') > 0) {
            this.emit('error', err.message);
          }
          if (!resolved) {
            clearTimeout(timeout);
            resolved = true;
            this.isConnecting = false;

            // Nếu lỗi kết nối sai IP, tự động quét tìm IP máy in trên mạng LAN
            if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT') || err.message.includes('EHOSTUNREACH')) {
              console.log('🔍 [BambuService] Đang tự động dò tìm IP máy in trên mạng LAN...');
              try {
                const scan = await this.scanLanPrinters();
                if (scan && scan.foundPrinters && scan.foundPrinters.length > 0) {
                  const autoIp = scan.foundPrinters[0].ip;
                  if (autoIp && autoIp !== this.config.ip) {
                    console.log(`✨ [BambuService] Tìm thấy máy in tại IP mới: ${autoIp}. Đang tự động kết nối...`);
                    this.config.ip = autoIp;
                    this.saveConfig();
                    this.connect().catch(() => {});
                  }
                }
              } catch (_) {}
            }

            resolve({ success: false, error: err.message });
          }
        });

        this.client.on('close', () => {
          if (this.connected) {
            console.log('🔌 [BambuService] Mất kết nối tới máy in Bambu.');
            this.connected = false;
            this.status.connected = false;
            this.status.online = false;
            this.emit('disconnected');
          }
        });

      } catch (err) {
        this.isConnecting = false;
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: err.message });
        }
      }
    });
  }

  /**
   * Ngắt kết nối máy in
   */
  disconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.stopSimulation();

    if (this.client) {
      try {
        this.client.end(true);
      } catch (_) {}
      this.client = null;
    }

    this.connected = false;
    this.isConnecting = false;
    this.status.connected = false;
    this.status.online = false;
    this.emit('disconnected');

    return { success: true, message: 'Đã ngắt kết nối máy in.' };
  }

  /**
   * Xử lý gói tin JSON nhận được từ máy in
   */
  handleIncomingReport(topic, message) {
    try {
      const payload = JSON.parse(message.toString());
      const p = payload.print || payload;

      // Cập nhật Serial Number nếu nhận được từ topic hoặc payload
      if (!this.config.serialNumber) {
        const match = topic.match(/device\/([A-Za-z0-9]+)\/report/);
        if (match && match[1] && match[1] !== '+') {
          this.config.serialNumber = match[1];
          this.saveConfig();
        }
      }

      // Cập nhật trạng thái
      if (p.gcode_state) this.status.gcode_state = p.gcode_state;
      if (p.mc_percent !== undefined) this.status.mc_percent = Number(p.mc_percent);
      if (p.mc_remaining_time !== undefined) this.status.mc_remaining_time = Number(p.mc_remaining_time);
      if (p.nozzle_temper !== undefined) this.status.nozzle_temper = Number(p.nozzle_temper);
      if (p.nozzle_target_temper !== undefined) this.status.nozzle_target_temper = Number(p.nozzle_target_temper);
      if (p.bed_temper !== undefined) this.status.bed_temper = Number(p.bed_temper);
      if (p.bed_target_temper !== undefined) this.status.bed_target_temper = Number(p.bed_target_temper);
      if (p.chamber_temper !== undefined) this.status.chamber_temper = Number(p.chamber_temper);
      // Fan Speeds (Bambu PWM 0-15 mapped to clean 0%, 10%, 20%... 100%)
      if (p.cooling_fan_speed !== undefined) {
        const rawFan = Number(p.cooling_fan_speed);
        if (!isNaN(rawFan)) {
          if (rawFan <= 15) {
            this.status.fan_speed_percent = Math.round((rawFan / 15) * 10) * 10;
          } else if (rawFan <= 100) {
            this.status.fan_speed_percent = Math.round(rawFan / 10) * 10;
          } else {
            this.status.fan_speed_percent = Math.round(((rawFan / 255) * 100) / 10) * 10;
          }
        }
      }
      if (p.big_fan1_speed !== undefined || p.aux_fan_speed !== undefined) {
        const rawAux = Number(p.big_fan1_speed || p.aux_fan_speed);
        if (!isNaN(rawAux)) {
          if (rawAux <= 15) {
            this.status.aux_fan_speed_percent = Math.round((rawAux / 15) * 10) * 10;
          } else {
            this.status.aux_fan_speed_percent = Math.min(100, Math.round(rawAux / 10) * 10);
          }
        }
      }

      if (p.spd_lvl !== undefined) this.status.spd_lvl = Number(p.spd_lvl);
      if (p.spd_mag !== undefined) this.status.spd_mag = Number(p.spd_mag);
      if (p.layer_num !== undefined) this.status.layer_num = Number(p.layer_num);
      if (p.total_layer_num !== undefined) this.status.total_layer_num = Number(p.total_layer_num);
      if (p.subtask_name) this.status.subtask_name = p.subtask_name;
      if (p.gcode_file) {
        if (p.gcode_file !== this.status.gcode_file && p.gcode_file !== this.lastFetchedGcodeFile) {
          this.lastFetchedGcodeFile = p.gcode_file;
          setTimeout(() => {
            this.fetchPlateInfoFromPrinter().catch(() => {});
          }, 1500);
        }
        this.status.gcode_file = p.gcode_file;
      }
      if (p.wifi_signal) this.status.wifi_signal = p.wifi_signal;

      // Active Tray Indicator (tray_now: 254 = External Spool, 0..3 = AMS slot)
      if (p.tray_now !== undefined) {
        this.status.tray_now = String(p.tray_now);
      }
      if (p.ams && p.ams.tray_now !== undefined) {
        this.status.tray_now = String(p.ams.tray_now);
      }
      if (p.ams && p.ams.tray_tar !== undefined) {
        this.status.ams.active_slot = Number(p.ams.tray_tar);
      }

      // External Spool / Virtual Tray (vt_tray)
      if (p.vt_tray) {
        this.status.vt_tray = {
          id: 254,
          name: p.vt_tray.tray_sub_brands || p.vt_tray.tray_type || 'External Spool',
          color: (p.vt_tray.tray_color || 'FFFFFF').substring(0, 6),
          type: p.vt_tray.tray_type || 'PETG',
          remain: p.vt_tray.remain !== undefined ? Number(p.vt_tray.remain) : 100,
          bed_temp: p.vt_tray.bed_temp,
          nozzle_temp_max: p.vt_tray.nozzle_temp_max,
          nozzle_temp_min: p.vt_tray.nozzle_temp_min
        };
      }

      // Trạng thái đèn LED
      if (p.lights_report && Array.isArray(p.lights_report)) {
        const chamber = p.lights_report.find(l => l.node === 'chamber_light');
        if (chamber) this.status.light_state = chamber.mode === 'on';
      }

      // Danh sách các chi tiết đã bị bỏ qua (Skip Objects)
      if (p.s_obj !== undefined) {
        this.status.s_obj = Array.isArray(p.s_obj) ? p.s_obj : [];
      }

      // Cập nhật AMS Tray info nếu có
      if (p.ams && p.ams.ams && p.ams.ams[0] && Array.isArray(p.ams.ams[0].tray)) {
        const rawTrays = p.ams.ams[0].tray;
        this.status.ams.trays = rawTrays.map((t, idx) => ({
          id: idx,
          name: t.tray_sub_brands || t.tray_type || `Khay ${idx + 1}`,
          color: (t.tray_color || 'FFFFFF').substring(0, 6),
          type: t.tray_type || 'PLA',
          remain: t.remain !== undefined ? Number(t.remain) : 100,
          state: t.state || 'ready'
        }));
      }

      this.status.last_updated = Date.now();
      this.emit('status', this.status);
    } catch (err) {
      console.error('⚠️ [BambuService] Lỗi parse JSON report:', err.message);
    }
  }

  /**
   * Gửi lệnh JSON tới MQTT máy in
   */
  async sendCommand(commandObj) {
    if (this.config.simulationMode) {
      return this.handleSimulatedCommand(commandObj);
    }

    if (!this.connected || !this.client) {
      return { success: false, error: 'Máy in chưa được kết nối.' };
    }

    const serial = this.config.serialNumber || 'default';
    const topic = `device/${serial}/request`;
    this.sequenceId++;

    const payload = {
      ...commandObj,
      user_id: '1234567890'
    };

    // Đính kèm sequence_id vào nhánh con tương ứng
    for (const key of Object.keys(payload)) {
      if (typeof payload[key] === 'object' && payload[key] !== null) {
        payload[key].sequence_id = String(this.sequenceId);
      }
    }

    return new Promise((resolve) => {
      this.client.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true, message: 'Đã gửi lệnh tới máy in.' });
        }
      });
    });
  }

  /**
   * Yêu cầu máy in trả về toàn bộ dữ liệu (Push All)
   */
  requestPushAll() {
    this.sendCommand({
      pushing: {
        command: 'pushall',
        version: 1
      }
    });
  }

  /**
   * Gửi dòng mã lệnh G-Code trực tiếp
   */
  async sendGcode(gcode) {
    let cleanCode = gcode.trim();
    if (!cleanCode.endsWith('\n')) cleanCode += '\n';

    console.log(`🖨️ [Bambu G-Code]: ${cleanCode.trim()}`);
    return await this.sendCommand({
      print: {
        command: 'gcode_line',
        param: cleanCode
      }
    });
  }

  /**
   * Đặt nhiệt độ đầu phun (Nozzle)
   */
  async setNozzleTemp(temp) {
    const t = Math.max(0, Math.min(300, parseInt(temp, 10) || 0));
    this.status.nozzle_target_temper = t;
    this.emit('status', this.status);
    return await this.sendGcode(`M104 S${t}\n`);
  }

  /**
   * Đặt nhiệt độ bàn in (Heatbed - Tối đa 80°C trên Bambu Lab A1 mini)
   */
  async setBedTemp(temp) {
    const t = Math.max(0, Math.min(80, parseInt(temp, 10) || 0));
    this.status.bed_target_temper = t;
    this.emit('status', this.status);
    return await this.sendGcode(`M140 S${t}\n`);
  }

  /**
   * Đặt tốc độ in (Speed Mode: 1-Silent, 2-Standard, 3-Sport, 4-Ludicrous)
   */
  async setPrintSpeed(level) {
    const lvl = Math.max(1, Math.min(4, parseInt(level, 10) || 2));
    this.status.spd_lvl = lvl;
    this.emit('status', this.status);
    return await this.sendCommand({
      print: {
        command: 'print_speed',
        param: String(lvl)
      }
    });
  }

  /**
   * Bật/Tắt đèn buồng in LED
   */
  async setLight(on = true) {
    const mode = on ? 'on' : 'off';
    this.status.light_state = on;
    return await this.sendCommand({
      system: {
        command: 'ledctrl',
        led_node: 'chamber_light',
        led_mode: mode,
        led_on_time: 500,
        led_off_time: 500,
        loop_times: 0,
        interval_time: 0
      }
    });
  }

  /**
   * Đặt tốc độ quạt làm mát (Fan Speed 0-100%)
   */
  async setFanSpeed(fanType = 'part', speedPercent = 100) {
    const pct = Math.max(0, Math.min(100, parseInt(speedPercent, 10) || 0));
    const pwm = Math.round((pct / 100) * 255);
    this.status.fan_speed_percent = pct;
    this.emit('status', this.status);
    return await this.sendGcode(`M106 P1 S${pwm}\n`);
  }

  /**
   * Tạm dừng in (Pause)
   */
  async pausePrint() {
    this.status.gcode_state = 'PAUSE';
    this.emit('status', this.status);
    return await this.sendCommand({
      print: {
        command: 'pause'
      }
    });
  }

  /**
   * Tiếp tục in (Resume)
   */
  async resumePrint() {
    this.status.gcode_state = 'RUNNING';
    this.emit('status', this.status);
    return await this.sendCommand({
      print: {
        command: 'resume'
      }
    });
  }

  /**
   * Dừng hủy bản in (Cancel / Stop)
   */
  async stopPrint() {
    this.status.gcode_state = 'IDLE';
    this.emit('status', this.status);
    return await this.sendCommand({
      print: {
        command: 'stop'
      }
    });
  }

  /**
   * Bỏ qua một hoặc nhiều chi tiết in trên bàn in (Skip Objects / Cancel Part)
   * Tính năng tương đương trên Bambu Handy khi in nhiều mẫu
   * @param {number[]|number|string} objList - Danh sách ID chi tiết (VD: [1, 2] hoặc 1)
   */
  async skipObjects(objList = []) {
    let ids = [];
    if (Array.isArray(objList)) {
      ids = objList.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
    } else if (typeof objList === 'number' || typeof objList === 'string') {
      const parsed = parseInt(objList, 10);
      if (!isNaN(parsed) && parsed > 0) ids = [parsed];
    }

    if (ids.length === 0) {
      return { success: false, error: 'Danh sách ID chi tiết không hợp lệ.' };
    }

    const currentSkipped = Array.isArray(this.status.s_obj) ? this.status.s_obj : [];
    const mergedList = Array.from(new Set([...currentSkipped, ...ids]));

    console.log(`🚫 [Bambu Skip Part] Gửi lệnh bỏ qua các chi tiết ID:`, mergedList);

    const res = await this.sendCommand({
      print: {
        command: 'skip_objects',
        obj_list: mergedList
      }
    });

    if (res && res.success) {
      this.status.s_obj = mergedList;
      return { success: true, message: `Đã gửi lệnh bỏ qua chi tiết: #${ids.join(', #')}`, skipped: mergedList };
    }
    return res;
  }

  /**
   * Di chuyển đầu in tương đối (Jog Axis)
   */
  async jog(axis = 'x', distance = 10) {
    const ax = axis.toUpperCase();
    const d = parseFloat(distance) || 0;
    const feedrate = (ax === 'Z') ? 1200 : 3000;
    return await this.sendGcode(`G91\nG1 ${ax}${d} F${feedrate}\nG90\n`);
  }

  /**
   * Về gốc tọa độ (Home)
   */
  async home(axes = 'all') {
    if (axes === 'xy') {
      return await this.sendGcode('G28 X Y\n');
    } else if (axes === 'z') {
      return await this.sendGcode('G28 Z\n');
    }
    return await this.sendGcode('G28\n');
  }

  /**
   * Đùn / Rút nhựa thủ công (Extrude / Retract)
   */
  async feedFilament(amount = 10) {
    const amt = parseFloat(amount) || 10;
    return await this.sendGcode(`M83\nG1 E${amt} F300\n`);
  }

  /**
   * Phân tích tệp .3MF từ bộ đệm Buffer (trích xuất Metadata/plate_*.json và các chi tiết 3D)
   */
  async parse3mfBuffer(buffer, fileName = '') {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const plateFiles = Object.keys(zip.files).filter(f => f.match(/Metadata\/plate_\d+\.json$/));

      const plates = [];
      const isA1mini = (this.config.name || this.status.model || '').toLowerCase().includes('mini');
      const defaultBedSize = isA1mini ? [180, 180] : [256, 256];

      for (const pf of plateFiles) {
        const match = pf.match(/plate_(\d+)\.json$/);
        const pIndex = match ? parseInt(match[1], 10) : 1;
        const rawJson = await zip.file(pf).async('text');
        const pData = JSON.parse(rawJson);

        // Read thumbnails
        let thumbnail = '';
        let topView = '';
        const thumbName = `Metadata/plate_${pIndex}.png`;
        const topName = `Metadata/top_${pIndex}.png`;
        if (zip.file(thumbName)) {
          const tBuf = await zip.file(thumbName).async('nodebuffer');
          thumbnail = `data:image/png;base64,${tBuf.toString('base64')}`;
        }
        if (zip.file(topName)) {
          const topBuf = await zip.file(topName).async('nodebuffer');
          topView = `data:image/png;base64,${topBuf.toString('base64')}`;
        }

        const rawObjs = pData.bbox_objects || [];
        const objects = rawObjs.map(obj => {
          const [xmin, ymin, xmax, ymax] = obj.bbox || [0, 0, 30, 30];
          const width = Math.max(8, Math.round((xmax - xmin) * 10) / 10);
          const depth = Math.max(8, Math.round((ymax - ymin) * 10) / 10);
          const x = Math.round(((xmin + xmax) / 2) * 10) / 10;
          const y = Math.round(((ymin + ymax) / 2) * 10) / 10;
          const name = obj.name || `Chi tiết #${obj.id}`;
          const lower = name.toLowerCase();

          let shape = 'box';
          if (lower.includes('bolt') || lower.includes('screw') || lower.includes('pin') || lower.includes('oc') || lower.includes('vit') || (Math.abs(width - depth) < 5 && width < 32)) {
            shape = 'bolt';
          } else if (lower.includes('bracket') || lower.includes('mount') || lower.includes('motor') || lower.includes('hinge') || lower.includes('khung') || lower.includes('latch') || lower.includes('angle')) {
            shape = 'bracket';
          } else if (lower.includes('gear') || lower.includes('wheel') || lower.includes('cylinder') || lower.includes('tru') || lower.includes('pulley')) {
            shape = 'cylinder';
          }

          const height = Math.min(80, Math.max(15, Math.round(Math.max(width, depth) * 0.8)));

          return {
            id: obj.id,
            name,
            x,
            y,
            width,
            depth,
            height,
            shape,
            area: obj.area || Math.round(width * depth),
            bbox: [xmin, ymin, xmax, ymax]
          };
        });

        plates.push({
          plateIndex: pIndex,
          name: `Bàn In ${pIndex}`,
          bedType: pData.bed_type || 'textured_plate',
          bedSize: defaultBedSize,
          bboxAll: pData.bbox_all || [0, 0, defaultBedSize[0], defaultBedSize[1]],
          objects,
          thumbnail,
          topView
        });
      }

      if (plates.length === 0) {
        return this.getDefaultPlateInfo();
      }

      plates.sort((a, b) => a.plateIndex - b.plateIndex);

      let activePlateIndex = 1;
      if (fileName) {
        const pMatch = fileName.match(/plate_(\d+)/i);
        if (pMatch && plates.some(p => p.plateIndex === parseInt(pMatch[1], 10))) {
          activePlateIndex = parseInt(pMatch[1], 10);
        }
      }

      const activePlate = plates.find(p => p.plateIndex === activePlateIndex) || plates[0];

      const plateInfo = {
        success: true,
        fileName: fileName || this.status.gcode_file || this.status.subtask_name || 'Bản in hiện tại',
        activePlateIndex: activePlate.plateIndex,
        plates,
        bedType: activePlate.bedType,
        bedSize: activePlate.bedSize,
        objects: activePlate.objects,
        thumbnail: activePlate.thumbnail,
        topView: activePlate.topView,
        lastUpdated: Date.now()
      };

      this.plateInfo = plateInfo;
      this.status.plate_info = plateInfo;
      this.emit('plate_info', plateInfo);
      return plateInfo;
    } catch (e) {
      console.error('❌ [BambuService] Lỗi parse 3MF:', e.message);
      return this.getDefaultPlateInfo();
    }
  }

  /**
   * Cấu hình bàn in mặc định khi chưa tải được 3MF (Mô phỏng chính xác 2 chi tiết: Bracket #213 và Screw #215)
   */
  getDefaultPlateInfo() {
    const isA1mini = (this.config.name || this.status.model || '').toLowerCase().includes('mini') || true;
    const bedSize = isA1mini ? [180, 180] : [256, 256];

    let cachedThumbnail = '';
    let cachedTopView = '';
    try {
      if (fs.existsSync(path.join(DATA_DIR, 'Metadata_plate_1.png'))) {
        cachedThumbnail = `data:image/png;base64,${fs.readFileSync(path.join(DATA_DIR, 'Metadata_plate_1.png')).toString('base64')}`;
      }
      if (fs.existsSync(path.join(DATA_DIR, 'Metadata_top_1.png'))) {
        cachedTopView = `data:image/png;base64,${fs.readFileSync(path.join(DATA_DIR, 'Metadata_top_1.png')).toString('base64')}`;
      }
    } catch (_) {}

    const objects = [
      { id: 213, name: 'Khung gá chữ L (Bracket #213)', x: 86, y: 80.8, width: 22.6, depth: 36.9, height: 38, shape: 'bracket', area: 153.4, bbox: [74.7, 62.3, 97.3, 99.2] },
      { id: 215, name: 'Ốc vặn xoắn (Screw #215)', x: 66.5, y: 115.5, width: 20.6, depth: 20.6, height: 32, shape: 'bolt', area: 304.1, bbox: [56.2, 105.2, 76.8, 125.8] }
    ];

    const fallbackInfo = {
      success: true,
      fileName: this.status.gcode_file || this.status.subtask_name || '0.2mm layer, 2 walls, 15% infill.3mf',
      activePlateIndex: 1,
      plates: [
        {
          plateIndex: 1,
          name: 'Bàn In 1',
          bedType: 'textured_plate',
          bedSize,
          bboxAll: [56.18, 62.33, 97.3, 125.85],
          objects,
          thumbnail: cachedThumbnail,
          topView: cachedTopView
        }
      ],
      bedType: 'textured_plate',
      bedSize,
      objects,
      thumbnail: cachedThumbnail,
      topView: cachedTopView,
      isFallback: true,
      lastUpdated: Date.now()
    };

    this.plateInfo = fallbackInfo;
    this.status.plate_info = fallbackInfo;
    return fallbackInfo;
  }

  /**
   * Tải file 3MF từ thẻ nhớ máy in qua FTPS (Port 990 Implicit TLS) và trích xuất chi tiết bàn in
   */
  async fetchPlateInfoFromPrinter(force = false) {
    if (this.isFetchingPlate) {
      return { success: true, message: 'Đang tải dữ liệu bàn in từ máy in...', plate_info: this.plateInfo || this.getDefaultPlateInfo() };
    }
    if (!this.config.ip || !this.config.accessCode) {
      return { success: true, plate_info: this.getDefaultPlateInfo() };
    }

    this.isFetchingPlate = true;
    console.log(`📥 [BambuService] Đang kết nối FTPS tới ${this.config.ip}:990 để tải file 3MF...`);

    const downloadViaTls = () => new Promise((resolve) => {
      const s = tls.connect({ host: this.config.ip, port: 990, rejectUnauthorized: false });
      const timeout = setTimeout(() => { s.destroy(); resolve(null); }, 15000);

      const sendCmd = (cmd) => new Promise((res) => {
        const h = (d) => { s.removeListener('data', h); res(d.toString()); };
        s.on('data', h);
        s.write(cmd + '\r\n');
      });

      s.once('data', async () => {
        try {
          await sendCmd('USER bblp');
          await sendCmd('PASS ' + this.config.accessCode);
          await sendCmd('TYPE I');

          const getDirFiles = async (dir) => {
            const pasv = await sendCmd('PASV');
            const m = pasv.match(/(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/);
            if (!m) return [];
            const dataPort = parseInt(m[5], 10) * 256 + parseInt(m[6], 10);
            const dataSocket = tls.connect({ host: this.config.ip, port: dataPort, rejectUnauthorized: false });
            const listPromise = new Promise((r) => {
              let out = '';
              dataSocket.on('data', c => out += c.toString());
              dataSocket.on('end', () => r(out));
              dataSocket.on('error', () => r(''));
            });
            await sendCmd('LIST ' + dir);
            const listText = await listPromise;
            await new Promise(r => s.once('data', r));
            const lines = listText.split('\n').map(l => l.trim()).filter(Boolean);
            const entries = [];
            for (const line of lines) {
              const parts = line.split(/\s+/);
              if (parts.length >= 9) {
                const size = parseInt(parts[4], 10) || 0;
                const name = parts.slice(8).join(' ');
                entries.push({ name, size, fullPath: (dir === '/' ? '' : dir) + '/' + name });
              }
            }
            return entries;
          };

          // Search in /cache first (where Bambu Studio active jobs are placed), then /
          const cacheFiles = await getDirFiles('/cache');
          const rootFiles = await getDirFiles('/');
          const allFiles = [...cacheFiles, ...rootFiles];

          const currentGcode = (this.status.gcode_file || '').toLowerCase();
          const currentSubtask = (this.status.subtask_name || '').toLowerCase();

          let target = null;
          if (currentGcode) {
            target = allFiles.find(f => f.name.toLowerCase() === currentGcode || f.name.toLowerCase().includes(currentGcode.replace(/\.3mf|\.gcode.*/, '')));
          }
          if (!target && currentSubtask) {
            target = allFiles.find(f => f.name.toLowerCase().includes(currentSubtask.replace(/\.3mf|\.gcode.*/, '')));
          }
          if (!target) {
            target = allFiles.find(f => f.name.toLowerCase().endsWith('.3mf'));
          }

          if (!target) {
            clearTimeout(timeout);
            s.destroy();
            return resolve(null);
          }

          console.log(`📥 [BambuService] Tải mục tiêu: ${target.fullPath} (${target.size} bytes)...`);
          const pasvDl = await sendCmd('PASV');
          const mDl = pasvDl.match(/(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/);
          if (!mDl) {
            clearTimeout(timeout);
            s.destroy();
            return resolve(null);
          }
          const dlPort = parseInt(mDl[5], 10) * 256 + parseInt(mDl[6], 10);
          const dlSocket = tls.connect({ host: this.config.ip, port: dlPort, rejectUnauthorized: false });
          const dlPromise = new Promise((r) => {
            const chunks = [];
            dlSocket.on('data', c => chunks.push(c));
            dlSocket.on('end', () => r(Buffer.concat(chunks)));
            dlSocket.on('error', () => r(null));
          });
          await sendCmd('RETR ' + target.fullPath);
          const buf = await dlPromise;
          clearTimeout(timeout);
          s.destroy();
          resolve({ buffer: buf, name: target.name });
        } catch (e) {
          clearTimeout(timeout);
          s.destroy();
          resolve(null);
        }
      });

      s.on('error', () => {
        clearTimeout(timeout);
        s.destroy();
        resolve(null);
      });
    });

    try {
      const cacheDir = path.join(DATA_DIR, 'bambu_cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const dlResult = await downloadViaTls();
      this.isFetchingPlate = false;

      if (dlResult && dlResult.buffer && dlResult.buffer.length > 0) {
        const localFilePath = path.join(cacheDir, dlResult.name);
        fs.writeFileSync(localFilePath, dlResult.buffer);
        const result = await this.parse3mfBuffer(dlResult.buffer, dlResult.name);
        return { success: true, plate_info: result };
      }

      return { success: true, plate_info: this.getDefaultPlateInfo() };
    } catch (err) {
      console.error('❌ [BambuService] Lỗi kết nối FTPS:', err.message);
      this.isFetchingPlate = false;
      return { success: true, plate_info: this.getDefaultPlateInfo() };
    }
  }

  /**
   * Lấy thông tin bàn in hiện tại
   */
  getPlateInfo() {
    return this.plateInfo || this.getDefaultPlateInfo();
  }

  /**
   * Khởi động chế độ Giả Lập Demo mượt mà (Simulation Mode)
   */
  startSimulation() {
    this.stopSimulation();
    this.connected = true;
    this.status.connected = true;
    this.status.online = true;
    this.status.isSimulation = true;
    this.status.gcode_state = 'RUNNING';
    this.status.subtask_name = 'Dragon_Articulated_A1mini.3mf';
    this.status.mc_percent = 42;
    this.status.layer_num = 158;
    this.status.total_layer_num = 380;
    this.status.mc_remaining_time = 45;
    this.status.nozzle_temper = 219.5;
    this.status.nozzle_target_temper = 220;
    this.status.bed_temper = 59.8;
    this.status.bed_target_temper = 60;
    this.status.chamber_temper = 28.5;
    this.status.fan_speed_percent = 80;
    this.status.spd_lvl = 2;
    this.status.light_state = true;

    this.simulationTimer = setInterval(() => {
      if (!this.status.isSimulation) return;

      // Nhiệt độ dao động nhẹ như máy thật
      this.status.nozzle_temper = Number((this.status.nozzle_target_temper > 0
        ? this.status.nozzle_target_temper + (Math.random() * 1.6 - 0.8)
        : Math.max(25, this.status.nozzle_temper - 2))).toFixed(1);

      this.status.bed_temper = Number((this.status.bed_target_temper > 0
        ? this.status.bed_target_temper + (Math.random() * 0.8 - 0.4)
        : Math.max(24, this.status.bed_temper - 1))).toFixed(1);

      if (this.status.gcode_state === 'RUNNING') {
        this.status.mc_percent = Math.min(100, this.status.mc_percent + 0.1);
        if (Math.random() > 0.7 && this.status.layer_num < this.status.total_layer_num) {
          this.status.layer_num++;
        }
        this.status.mc_remaining_time = Math.max(1, Math.round(45 * (1 - this.status.mc_percent / 100)));
      }

      this.status.last_updated = Date.now();
      this.emit('status', this.status);
    }, 2000);

    this.emit('connected', this.status);
  }

  /**
   * Dừng chế độ Giả Lập Demo
   */
  stopSimulation() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    if (this.status && this.status.isSimulation) {
      this.status.isSimulation = false;
    }
  }

  /**
   * Khởi động luồng Camera trực tiếp từ máy in (Port 6000 TLS)
   */
  startCameraStream() {
    if (this.isStreamingCamera || this.cameraSocket) return;
    if (!this.config.ip || !this.config.accessCode) return;

    this.isStreamingCamera = true;
    console.log(`📹 [BambuCamera] Đang mở kết nối TLS tới Camera ${this.config.ip}:6000...`);

    const authPacket = Buffer.alloc(80, 0);
    authPacket.writeUInt32LE(0x40, 0);
    authPacket.writeUInt32LE(0x3000, 4);
    authPacket.writeUInt32LE(0, 8);
    authPacket.writeUInt32LE(0, 12);
    authPacket.write('bblp', 16, 32, 'utf8');
    authPacket.write(this.config.accessCode, 48, 32, 'utf8');

    let streamBuffer = Buffer.alloc(0);

    try {
      this.cameraSocket = tls.connect({
        host: this.config.ip,
        port: 6000,
        rejectUnauthorized: false
      }, () => {
        console.log(`📹 [BambuCamera] ✅ Đã kết nối Camera port 6000! Đang nhận luồng JPEG...`);
        this.cameraSocket.write(authPacket);
        this.emit('camera_connected');
      });

      this.cameraSocket.on('data', (chunk) => {
        streamBuffer = Buffer.concat([streamBuffer, chunk]);

        // Trích xuất các khung hình JPEG (0xFF 0xD8 ... 0xFF 0xD9)
        let startIndex = streamBuffer.indexOf(Buffer.from([0xff, 0xd8]));
        while (startIndex !== -1) {
          let endIndex = streamBuffer.indexOf(Buffer.from([0xff, 0xd9]), startIndex + 2);
          if (endIndex !== -1) {
            const jpegData = streamBuffer.slice(startIndex, endIndex + 2);
            this.latestCameraFrame = jpegData;
            this.latestCameraTimestamp = Date.now();
            this.emit('camera_frame', jpegData);

            // Truyền trực tiếp tới các Web & Electron client đang mở luồng MJPEG
            if (this.cameraClients.size > 0) {
              const header = Buffer.from(
                `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpegData.length}\r\n\r\n`
              );
              for (const client of this.cameraClients) {
                try {
                  client.write(header);
                  client.write(jpegData);
                  client.write(Buffer.from('\r\n'));
                } catch (_) {
                  this.cameraClients.delete(client);
                }
              }
            }

            streamBuffer = streamBuffer.slice(endIndex + 2);
            startIndex = streamBuffer.indexOf(Buffer.from([0xff, 0xd8]));
          } else {
            break;
          }
        }

        // Chống tràn buffer nếu mất gói
        if (streamBuffer.length > 4 * 1024 * 1024) {
          streamBuffer = Buffer.alloc(0);
        }
      });

      this.cameraSocket.on('error', (err) => {
        console.warn('⚠️ [BambuCamera] Socket error:', err.message);
        this.stopCameraStream();
      });

      this.cameraSocket.on('close', () => {
        this.isStreamingCamera = false;
        this.cameraSocket = null;
        if (this.cameraClients.size > 0) {
          setTimeout(() => this.startCameraStream(), 3000);
        }
      });

    } catch (err) {
      console.error('❌ [BambuCamera] Connect error:', err.message);
      this.isStreamingCamera = false;
      this.cameraSocket = null;
    }
  }

  /**
   * Ngắt luồng camera
   */
  stopCameraStream() {
    this.isStreamingCamera = false;
    if (this.cameraSocket) {
      try {
        this.cameraSocket.destroy();
      } catch (_) {}
      this.cameraSocket = null;
    }
  }

  /**
   * Phục vụ luồng HTTP Live MJPEG Video Stream (tương thích mọi trình duyệt và thẻ <img>)
   */
  handleMjpegStream(req, res) {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Connection': 'close',
      'Access-Control-Allow-Origin': '*'
    });

    this.cameraClients.add(res);

    if (this.latestCameraFrame) {
      try {
        res.write(Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${this.latestCameraFrame.length}\r\n\r\n`));
        res.write(this.latestCameraFrame);
        res.write(Buffer.from('\r\n'));
      } catch (_) {}
    }

    if (!this.isStreamingCamera) {
      this.startCameraStream();
    }

    req.on('close', () => {
      this.cameraClients.delete(res);
    });
  }

  /**
   * Lấy ảnh chụp khung hình mới nhất (JPEG)
   */
  getCameraSnapshot() {
    if (!this.isStreamingCamera) {
      this.startCameraStream();
    }
    return this.latestCameraFrame;
  }
}

export const bambuService = new BambuLabService();
export default bambuService;
