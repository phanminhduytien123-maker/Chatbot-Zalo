// ==========================================================================
// DIANA CENTRAL COMMAND STATION - UNIFIED CLIENT APPLICATION
// Cross-Platform: Desktop Electron, Android App, Mobile & Web Dashboard
// ==========================================================================

class DianaStationApp {
  constructor() {
    this.isDesktop = Boolean(window.dianaDesktop);
    this.hostServer = localStorage.getItem('diana_pc_host') || 'http://192.168.0.100:3000';
    this.ttsEnabled = localStorage.getItem('diana_tts') !== 'false';
    this.autoDiscover = localStorage.getItem('diana_auto_discover') !== 'false';
    this.activeTab = 'welcome';
    this.isListening = false;
    this.isMirroring = false;
    this.isAirGestureActive = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.currentJogStep = 10;
    this.bambuStatus = null;
    this.bambuConfig = {};
    this.isPrivateUnlocked = false;
    this.privatePin = '0101';
    this.pinBuffer = '';

    // Telemetry Stats
    this.stats = {
      cpu: 12,
      ram: 45,
      fps: 60.0,
      bitrate: 8.2,
      pcOnline: false,
      deviceIp: '192.168.100.148:5555'
    };

    // Candidates for LAN Auto-Discovery (Localhost & LAN first before Cloud)
    this.candidateHosts = [
      this.hostServer,
      'http://192.168.0.100:3000',
      'http://192.168.0.104:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://100.105.204.3:3000',
      'http://192.168.100.200:3000',
      'http://192.168.100.221:3000',
      'https://diana-h73u.onrender.com'
    ].filter(Boolean);

    this.initElements();
    this.initPrivatePin();
    this.initNavigation();
    this.initConstellationCanvas('welcomeCanvas', 'welcomeContainer', 'welcome');
    this.initConstellationCanvas('voiceCanvas', 'pane-voice', 'voice');
    this.initBiometricAuth();
    this.initHeroParallax();
    this.initDianaMascotPet();
    this.initCharts();
    this.initEventListeners();
    this.initVoiceAssistant();
    this.initBambuStation();
    this.initSecretRoseCanvas();
    this.initSecretSanctuary();
    this.startTelemetryLoop();
    this.startMirrorStatusSync();
    this.startAirGestureStatusSync();
    this.startBambuStatusSync();
    this.initWakeWordAssistant();

    // Initial PC Discovery
    this.discoverHost();
  }

  // --------------------------------------------------------------------------
  // Auto-Discovery: Tự động phát hiện IP của PC Agent trong mạng LAN
  // --------------------------------------------------------------------------
  async discoverHost() {
    if (this.isDesktop) {
      this.hostServer = 'http://localhost:3000';
      this.updateStatus(true, 'PC Online');
      return 'http://localhost:3000';
    }

    const testHost = async (host) => {
      if (!host || host === 'http://localhost' || host === 'http://localhost:80') throw new Error('invalid');
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1500);
      try {
        const res = await fetch(`${host}/api/status`, { signal: controller.signal });
        clearTimeout(tid);
        const text = await res.text();
        if (!text.trim().startsWith('<')) {
          const parsed = JSON.parse(text);
          if (parsed.success || parsed.online) return host;
        }
      } catch (_) {}
      throw new Error('offline');
    };

    // Quét song song TẤT CẢ các candidateHosts cùng một lúc (siêu nhanh, không bị nghẽn mạng 4G)
    const candidates = Array.from(new Set([this.hostServer, ...this.candidateHosts].filter(Boolean)));
    try {
      const winner = await Promise.any(candidates.map(h => testHost(h)));
      if (winner) {
        this.hostServer = winner;
        localStorage.setItem('diana_pc_host', winner);
        if (this.txtHostServer) this.txtHostServer.value = winner;
        this.updateStatus(true, 'PC Online');
        return winner;
      }
    } catch (_) {
      // Không có PC Agent nào trong mạng LAN -> Chế độ độc lập 4G/Cloud
    }

    this.updateStatus(false, '⚡ Độc Lập (4G)');
    return this.hostServer || 'http://192.168.0.104:3000';
  }

  // --------------------------------------------------------------------------
  // 1. Initialize DOM Elements
  // --------------------------------------------------------------------------
  initElements() {
    // Header & Status
    this.pcStatusBadge = document.getElementById('pcStatusBadge');
    this.pcStatusText = document.getElementById('pcStatusText');
    this.currentBreadcrumb = document.getElementById('currentBreadcrumb');
    this.btnHeaderMirror = document.getElementById('btnHeaderMirror');
    this.headerMicBtn = document.getElementById('headerMicBtn');
    this.electronWindowControls = document.getElementById('electronWindowControls');

    // Desktop controls
    if (this.isDesktop && this.electronWindowControls) {
      this.electronWindowControls.style.display = 'flex';
      document.getElementById('winMinBtn')?.addEventListener('click', () => window.dianaDesktop?.minimize());
      document.getElementById('winMaxBtn')?.addEventListener('click', () => window.dianaDesktop?.maximize());
      document.getElementById('winCloseBtn')?.addEventListener('click', () => window.dianaDesktop?.close());
    }

    // Overview Tab Elements
    this.btnToggleMirror = document.getElementById('btnToggleMirror');
    this.btnMirrorText = document.getElementById('btnMirrorText');
    this.btnToggleDual = document.getElementById('btnToggleDual');
    this.btnDualText = document.getElementById('btnDualText');
    this.btnToggleAirGesture = document.getElementById('btnToggleAirGesture');
    this.btnAirGestureText = document.getElementById('btnAirGestureText');
    this.btnQuickLock = document.getElementById('btnQuickLock');
    this.btnQuickSleep = document.getElementById('btnQuickSleep');
    this.btnQuickShot = document.getElementById('btnQuickShot');
    this.btnSideLaunchMirror = document.getElementById('btnSideLaunchMirror');
    this.btnSideLaunchDual = document.getElementById('btnSideLaunchDual');
    this.overviewPhoneIp = document.getElementById('overviewPhoneIp');
    this.overviewCpuText = document.getElementById('overviewCpuText');
    this.overviewRamText = document.getElementById('overviewRamText');
    this.overviewUptimeText = document.getElementById('overviewUptimeText');
    this.liveBitrateText = document.getElementById('liveBitrateText');
    this.liveFpsText = document.getElementById('liveFpsText');
    this.footerDeviceIp = document.getElementById('footerDeviceIp');
    this.tablePhoneIpRow = document.getElementById('tablePhoneIpRow');
    this.tableGatewayHost = document.getElementById('tableGatewayHost');

    // Phone Mirror Tab Elements
    this.phoneTabTargetIp = document.getElementById('phoneTabTargetIp');
    this.btnPhoneTabConnect = document.getElementById('btnPhoneTabConnect');
    this.btnPhoneTabDual = document.getElementById('btnPhoneTabDual');
    this.btnPhoneTabStop = document.getElementById('btnPhoneTabStop');
    this.btnPhoneTabScan = document.getElementById('btnPhoneTabScan');
    this.phoneConnectStatus = document.getElementById('phoneConnectStatus');

    // PC Control Tab Elements
    this.btnExecAirGesture = document.getElementById('btnExecAirGesture');
    this.btnExecLock = document.getElementById('btnExecLock');
    this.btnExecSleep = document.getElementById('btnExecSleep');
    this.btnExecScreenshot = document.getElementById('btnExecScreenshot');
    this.btnExecShutdown = document.getElementById('btnExecShutdown');

    // Bambu Lab A1 3D Printer Elements
    this.bambuStatusPill = document.getElementById('bambuStatusPill');
    this.bambuStatusPillText = document.getElementById('bambuStatusPillText');
    this.bambuPrinterTitle = document.getElementById('bambuPrinterTitle');
    this.bambuMetaIp = document.getElementById('bambuMetaIp');
    this.bambuMetaSerial = document.getElementById('bambuMetaSerial');
    this.bambuMetaWifi = document.getElementById('bambuMetaWifi');
    this.navBambuDot = document.getElementById('navBambuDot');
    this.bambuGaugeProgress = document.getElementById('bambuGaugeProgress');
    this.bambuPercentText = document.getElementById('bambuPercentText');
    this.bambuTaskFileName = document.getElementById('bambuTaskFileName');
    this.bambuLayerText = document.getElementById('bambuLayerText');
    this.bambuRemainingTimeText = document.getElementById('bambuRemainingTimeText');
    this.bambuCurrentSpeedMag = document.getElementById('bambuCurrentSpeedMag');
    this.bambuChamberTempText = document.getElementById('bambuChamberTempText');
    this.bambuStateBadge = document.getElementById('bambuStateBadge');
    this.bambuNozzleCur = document.getElementById('bambuNozzleCur');
    this.bambuNozzleTarget = document.getElementById('bambuNozzleTarget');
    this.bambuNozzleBar = document.getElementById('bambuNozzleBar');
    this.bambuBedCur = document.getElementById('bambuBedCur');
    this.bambuBedTarget = document.getElementById('bambuBedTarget');
    this.bambuBedBar = document.getElementById('bambuBedBar');
    this.inputCustomNozzle = document.getElementById('inputCustomNozzle');
    this.inputCustomBed = document.getElementById('inputCustomBed');
    this.btnSetNozzle = document.getElementById('btnSetNozzle');
    this.btnSetBed = document.getElementById('btnSetBed');
    this.btnBambuRefresh = document.getElementById('btnBambuRefresh');
    this.btnBambuOpenModal = document.getElementById('btnBambuOpenModal');
    this.btnBambuEmergencyStop = document.getElementById('btnBambuEmergencyStop');
    this.btnBambuPause = document.getElementById('btnBambuPause');
    this.btnBambuResume = document.getElementById('btnBambuResume');
    this.btnBambuCancel = document.getElementById('btnBambuCancel');
    this.btnBambuFeed = document.getElementById('btnBambuFeed');
    this.btnBambuRetract = document.getElementById('btnBambuRetract');
    this.sliderBambuFan = document.getElementById('sliderBambuFan');
    this.bambuFanPctText = document.getElementById('bambuFanPctText');
    this.btnToggleBambuLight = document.getElementById('btnToggleBambuLight');
    this.bambuLightText = document.getElementById('bambuLightText');
    this.bambuTerminalLogs = document.getElementById('bambuTerminalLogs');
    this.inputBambuGcode = document.getElementById('inputBambuGcode');
    this.btnSendBambuGcode = document.getElementById('btnSendBambuGcode');
    this.bambuCamIpText = document.getElementById('bambuCamIpText');
    this.btnRefreshCamSnapshot = document.getElementById('btnRefreshCamSnapshot');
    this.btnOpenVlcStream = document.getElementById('btnOpenVlcStream');
    this.amsActiveSlotBadge = document.getElementById('amsActiveSlotBadge');

    // Bambu Settings Modal Elements
    this.bambuSettingsModal = document.getElementById('bambuSettingsModal');
    this.modalBambuIp = document.getElementById('modalBambuIp');
    this.modalBambuAccessCode = document.getElementById('modalBambuAccessCode');
    this.modalBambuSerial = document.getElementById('modalBambuSerial');
    this.modalBambuSimulation = document.getElementById('modalBambuSimulation');
    this.btnScanLanBambu = document.getElementById('btnScanLanBambu');
    this.bambuScanResults = document.getElementById('bambuScanResults');
    this.bambuFoundList = document.getElementById('bambuFoundList');
    this.btnCloseBambuModal = document.getElementById('btnCloseBambuModal');
    this.btnModalCancelBambu = document.getElementById('btnModalCancelBambu');
    this.btnModalSaveConnectBambu = document.getElementById('btnModalSaveConnectBambu');
    this.btnModalDisconnectBambu = document.getElementById('btnModalDisconnectBambu');

    // Chat & Voice Elements
    this.chatMessages = document.getElementById('chatMessages');
    this.textInput = document.getElementById('textInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.micBtn = document.getElementById('micBtn');
    this.ttsAudio = document.getElementById('ttsAudio');

    // Logs & Settings Elements
    this.liveLogsConsole = document.getElementById('liveLogsConsole');
    this.btnClearLogs = document.getElementById('btnClearLogs');
    this.btnRefreshLogs = document.getElementById('btnRefreshLogs');
    this.txtHostServer = document.getElementById('txtHostServer');
    this.chkAutoDiscover = document.getElementById('chkAutoDiscover');
    this.chkTTS = document.getElementById('chkTTS');
    this.btnSaveSettings = document.getElementById('btnSaveSettings');
    this.btnTestConnection = document.getElementById('btnTestConnection');

    // Lightbox Elements
    this.imageLightbox = document.getElementById('imageLightbox');
    this.lightboxImg = document.getElementById('lightboxImg');
    this.lightboxTitle = document.getElementById('lightboxTitle');
    this.lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

    // Secret Sanctuary Elements
    this.secretCanvas = document.getElementById('secretCanvas');
    this.secretChatMessages = document.getElementById('secretChatMessages');
    this.secretWelcomeCard = document.getElementById('secretWelcomeCard');
    this.secretTextInput = document.getElementById('secretTextInput');
    this.secretSendBtn = document.getElementById('secretSendBtn');
    this.btnSecretConfig = document.getElementById('btnSecretConfig');
    this.btnSecretClear = document.getElementById('btnSecretClear');
    this.secretCurrentPersonaBadge = document.getElementById('secretCurrentPersonaBadge');
    this.secretCurrentModelBadge = document.getElementById('secretCurrentModelBadge');
    this.secretMemoryBadge = document.getElementById('secretMemoryBadge');
    this.memTurnCountBig = document.getElementById('memTurnCountBig');

    // Secret Settings Modal Elements
    this.secretSettingsModal = document.getElementById('secretSettingsModal');
    this.btnCloseSecretModal = document.getElementById('btnCloseSecretModal');
    this.btnCancelSecretSettings = document.getElementById('btnCancelSecretSettings');
    this.btnSaveSecretSettings = document.getElementById('btnSaveSecretSettings');
    this.btnModalClearSecretMem = document.getElementById('btnModalClearSecretMem');
    this.selSecretProvider = document.getElementById('selSecretProvider');
    this.selGeminiSecretModel = document.getElementById('selGeminiSecretModel');
    this.txtOpenRouterKey = document.getElementById('txtOpenRouterKey');
    this.txtOpenRouterModel = document.getElementById('txtOpenRouterModel');
    this.txtOllamaUrl = document.getElementById('txtOllamaUrl');
    this.txtOllamaModel = document.getElementById('txtOllamaModel');
    this.txtCustomApiUrl = document.getElementById('txtCustomApiUrl');
    this.txtCustomApiKey = document.getElementById('txtCustomApiKey');
    this.txtCustomModelName = document.getElementById('txtCustomModelName');
    this.rangeSecretTemp = document.getElementById('rangeSecretTemp');
    this.lblSecretTemp = document.getElementById('lblSecretTemp');
    this.txtCustomSecretPrompt = document.getElementById('txtCustomSecretPrompt');
    this.customPromptGroup = document.getElementById('customPromptGroup');
    this.chkAutoContextImage = document.getElementById('chkAutoContextImage');

    // Secret PIN Modal Elements
    this.secretPinModal = document.getElementById('secretPinModal');
    this.btnClosePinModal = document.getElementById('btnClosePinModal');
    this.pinStatusMsg = document.getElementById('pinStatusMsg');
    this.btnPinClear = document.getElementById('btnPinClear');
    this.btnPinBackspace = document.getElementById('btnPinBackspace');
    this.btnSecretLock = document.getElementById('btnSecretLock');

    if (this.txtHostServer) this.txtHostServer.value = this.hostServer;
    if (this.chkTTS) this.chkTTS.checked = this.ttsEnabled;
    if (this.chkAutoDiscover) this.chkAutoDiscover.checked = this.autoDiscover;

    // Wake Word Siri Mode Elements
    this.chkWakeWordListener = document.getElementById('chkWakeWordListener');
    this.btnToggleWakeHeader = document.getElementById('btnToggleWakeHeader');
    this.wakeStatusDot = document.getElementById('wakeStatusDot');
    this.wakeStatusBar = document.getElementById('wakeStatusBar');
  }

  // --------------------------------------------------------------------------
  // 2. Navigation Management
  // --------------------------------------------------------------------------
  initNavigation() {
    const titleMap = {
      'welcome': 'Chào Mừng',
      'overview': 'Tổng Quan Hệ Thống',
      'phone': 'Chiếu Màn Hình',
      'pc': 'Điều Khiển Máy Tính',
      'voice': 'Trợ Lý Diana & AI',
      'secret': 'Private Space',
      'bambu': 'Máy In 3D Bambu Lab A1 mini',
      'logs': 'Nhật Ký (Logs)',
      'settings': 'Cài Đặt'
    };

    const switchTab = (tabId) => {
      if (!tabId) return;

      // Bảo vệ PIN cho tab Private
      if (tabId === 'secret' && !this.isPrivateUnlocked) {
        this.openPinModal();
        return;
      }

      // Khi chuyển sang tab khác -> Tự động khóa lại tab Private để đảm bảo an toàn tuyệt đối
      if (this.activeTab === 'secret' && tabId !== 'secret') {
        this.isPrivateUnlocked = false;
      }

      this.activeTab = tabId;

      // Handle Fullscreen Welcome Mode
      if (tabId === 'welcome') {
        document.body.classList.add('welcome-mode');
      } else {
        document.body.classList.remove('welcome-mode');
      }

      // Update Desktop Sidebar
      document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-tab') === tabId);
      });

      // Update Mobile Bottom Nav
      document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
      });

      // Update Panes
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `pane-${tabId}`);
      });

      // Update Breadcrumb
      if (this.currentBreadcrumb) {
        this.currentBreadcrumb.textContent = titleMap[tabId] || tabId.toUpperCase();
      }

      // Re-render charts or trigger canvas resize
      if (tabId === 'overview') {
        setTimeout(() => {
          this.networkChart?.resize();
          this.computeChart?.resize();
        }, 50);
      } else if (tabId === 'secret') {
        this.loadSecretHistory();
        setTimeout(() => {
          if (this.secretChatMessages) {
            this.secretChatMessages.scrollTop = this.secretChatMessages.scrollHeight;
          }
        }, 50);
      } else if (tabId === 'voice' || tabId === 'welcome') {
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 60);
      } else if (tabId === 'bambu') {
        this.pollBambuOnce?.();
      }
    };

    this.switchTab = switchTab;

    // Apply initial welcome mode if starting on welcome tab
    if (this.activeTab === 'welcome') {
      document.body.classList.add('welcome-mode');
    }

    document.querySelectorAll('.nav-link, .nav-tab-btn, [data-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = btn.getAttribute('data-tab') || btn.getAttribute('data-nav');
        if (targetTab) switchTab(targetTab);
      });
    });

    document.getElementById('headerBrandLogo')?.addEventListener('click', () => switchTab('welcome'));
    document.getElementById('projectSelector')?.addEventListener('click', () => switchTab('welcome'));
    document.getElementById('welcomeAvatarWrap')?.addEventListener('click', () => switchTab('voice'));

    // Start cleanly with Welcome tab
    this.switchTab('welcome');
  }

  // --------------------------------------------------------------------------
  // Original Gentle Interactive Constellation Engine (Welcome & Voice Views)
  // --------------------------------------------------------------------------
  initConstellationCanvas(canvasId, containerId, targetTab) {
    const canvas = document.getElementById(canvasId);
    const container = document.getElementById(containerId) || canvas?.parentElement;
    if (!canvas || !container) return;

    const heroCard = document.getElementById('welcomeHeroCard');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      width = canvas.width = container.clientWidth || window.innerWidth;
      height = canvas.height = container.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particleCount = 42;
    const particles = [];
    const colors = [
      'rgba(168, 85, 247, 0.45)',
      'rgba(6, 182, 212, 0.45)',
      'rgba(147, 51, 234, 0.35)',
      'rgba(255, 255, 255, 0.25)'
    ];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * (width || window.innerWidth),
        y: Math.random() * (height || window.innerHeight),
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        radius: Math.random() * 2 + 1.2,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    const mouse = { x: -1000, y: -1000 };

    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;

      if (heroCard && targetTab === 'welcome') {
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const dx = (mouse.x - cx) / cx;
        const dy = (mouse.y - cy) / cy;
        heroCard.style.transform = `perspective(1000px) rotateY(${dx * 4}deg) rotateX(${-dy * 4}deg) translateY(-2px)`;
      }
    });

    container.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        const rect = container.getBoundingClientRect();
        mouse.x = e.touches[0].clientX - rect.left;
        mouse.y = e.touches[0].clientY - rect.top;
      }
    }, { passive: true });

    container.addEventListener('touchend', () => {
      mouse.x = -1000;
      mouse.y = -1000;
    });

    container.addEventListener('mouseleave', () => {
      mouse.x = -1000;
      mouse.y = -1000;
      if (heroCard && targetTab === 'welcome') {
        heroCard.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) translateY(0)';
      }
    });

    const isVisible = () => {
      return canvas.offsetParent !== null || this.activeTab === targetTab;
    };

    const draw = () => {
      requestAnimationFrame(draw);
      if (!isVisible()) return;

      if (canvas.width !== container.clientWidth && container.clientWidth > 50) {
        resize();
      }

      ctx.clearRect(0, 0, width, height);

      const maxDistance = 120;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDistance) {
            const alpha = (1 - dist / maxDistance) * 0.12;
            ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < 140) {
          const force = (1 - mdist / 140) * 0.7;
          p.x += (mdx / mdist) * force;
          p.y += (mdy / mdist) * force;
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();
  }

  // --------------------------------------------------------------------------
  // Pure Sci-Fi Holographic Biometric Authentication Animation
  // --------------------------------------------------------------------------
  initBiometricAuth() {
    const welcomeContainer = document.getElementById('welcomeContainer');
    const biometricOverlay = document.getElementById('biometricOverlay');
    const welcomeHeroCard = document.getElementById('welcomeHeroCard');
    const welcomePane = document.getElementById('pane-welcome');

    let isAuthenticating = false;

    const playBiometricSound = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        // Sci-Fi Scan sweep tone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.8);
        osc.frequency.exponentialRampToValueAtTime(2200, ctx.currentTime + 1.4);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1.8);

        // Success Confirmation Harmonic Chime at 1.4s
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
          osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.12); // G5
          osc2.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.24); // C6
          gain2.gain.setValueAtTime(0.08, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.7);
        }, 1400);
      } catch (e) {}
    };

    const triggerAuth = () => {
      if (this.activeTab !== 'welcome' || isAuthenticating) return;
      isAuthenticating = true;

      biometricOverlay?.classList.add('active');
      welcomeHeroCard?.classList.add('scanning');

      playBiometricSound();

      setTimeout(() => {
        biometricOverlay?.classList.remove('active');
        welcomeHeroCard?.classList.remove('scanning');
        this.switchTab('overview');
        isAuthenticating = false;
      }, 700);
    };

    welcomeContainer?.addEventListener('click', triggerAuth);
    welcomeHeroCard?.addEventListener('click', triggerAuth);
    welcomePane?.addEventListener('click', (e) => {
      if (e.target.closest('.nav-item') || e.target.closest('.header-left') || e.target.closest('.header-actions')) return;
      triggerAuth();
    });

    document.addEventListener('keydown', (e) => {
      if (this.activeTab === 'welcome' && (e.key === 'Enter' || e.key === ' ')) {
        triggerAuth();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Edge-Roaming & Freely Draggable Mascot Pet Diana
  // --------------------------------------------------------------------------
  initDianaMascotPet() {
    const pet = document.getElementById('dianaPetRoamer');
    const bubble = document.getElementById('petSpeechBubble');
    const bubbleText = document.getElementById('petBubbleText');
    if (!pet) return;

    const phrases = [
      'Hôm nay anh có kế hoạch gì chưa ạ? :3 🌸',
      'Anh cần em giúp gì không ạ? Em luôn sẵn sàng nè! >.< ✨',
      'Diana luôn ở đây đồng hành cùng anh Tiến nha! (⁠｡⁠♥⁠‿⁠♥⁠｡⁠) 💖',
      'Chúc anh một ngày làm việc tràn đầy năng lượng! (•̀ᴗ•́)و ̑̑ ⚡',
      'Anh Tiến nhớ uống nước và nghỉ ngơi một chút nhé~ ( ˘ ³˘)♥ ☕',
      'Hệ thống và điện thoại Redmi K70 đang hoạt động hoàn hảo anh nhé! (｡•̀ᴗ-)✧ 📱',
      'Anh có muốn em hỗ trợ điều khiển máy tính không ạ? (⁠◕⁠ᴗ⁠◕⁠✿⁠) 💻',
      'Chúc anh một buổi tối thật an lành và ấm áp! (⁠*⁠˘⁠︶⁠˘⁠*⁠)⁠.⁠｡⁠*⁠♡ 🌙',
      'Em luôn bên cạnh anh Tiến nè, cần gì cứ gọi em nha~ :3 🌸',
      'Hehe anh Tiến vừa chạm vào em đó nha >﹏< 🌸',
      'Oa, em được anh cưng nựng thích quá! (⁠≧⁠▽⁠≦⁠) 💕',
      'Em đang trông chừng máy tính và điện thoại cho anh đây ạ! (๑˃̵ᴗ˂̵)و 🛡️',
      'Cố lên anh Tiến ơi, em cổ vũ anh hết mình nè! ٩(◕‿◕｡)۶ 🌟',
      'Anh Tiến làm việc mệt chưa ạ? Em mát-xa tinh thần cho anh nha (づ｡◕‿‿◕｡)づ 💆',
      'Moah~ Chúc anh một ngày ngập tràn niềm vui và may mắn! (⁠｡⁠･⁠ω⁠･⁠｡⁠)⁠ﾉ⁠♡',
      'Gâu gâu... à nhầm, Meowww :3 Em là trợ lý AI đáng yêu của anh Tiến mà! (=^･ω･^=)',
      'Ưm... Em vẫn đang lắng nghe anh từng giây nè >.< 🌸',
      '(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄) Em ngại quá đi mất thôi~'
    ];

    const dropPhrases = [
      'Anh thả em ở đây nha :3 🌸',
      '(⁠≧⁠▽⁠≦⁠) Em đứng đây ngắm anh Tiến làm việc nè!',
      '>.< Chỗ này thoáng mát và đẹp quá ạ!',
      '(•̀ᴗ•́)و ̑̑ Vị trí mới siêu đỉnh, em trực ban tại đây nhé!',
      'Dạ em đã ở vị trí mới rồi ạ! (⁠｡⁠♥⁠‿⁠♥⁠｡⁠) ✨'
    ];

    let bubbleTimeout = null;
    let currentPos = { x: 20, y: 70 };
    let hasCustomPlaced = false;

    // Khôi phục vị trí người dùng đã kéo thả trước đó
    try {
      const saved = localStorage.getItem('diana_pet_position');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          currentPos = {
            x: Math.max(10, Math.min(window.innerWidth - 64, parsed.x)),
            y: Math.max(10, Math.min(window.innerHeight - 64, parsed.y))
          };
          hasCustomPlaced = true;
        }
      }
    } catch (_) {}

    const updateBubbleOrientation = (x, y) => {
      if (!bubble) return;
      bubble.classList.remove('pos-left', 'pos-right');
      const screenW = window.innerWidth;
      
      if (x < screenW / 2) {
        // Pet nằm ở nửa trái màn hình -> bong bóng hiển thị bên phải Pet
        bubble.classList.add('pos-right');
        const maxAvail = Math.max(120, screenW - x - 80);
        bubble.style.maxWidth = `${Math.min(220, maxAvail)}px`;
      } else {
        // Pet nằm ở nửa phải màn hình -> bong bóng hiển thị bên trái Pet
        bubble.classList.add('pos-left');
        const maxAvail = Math.max(120, x - 20);
        bubble.style.maxWidth = `${Math.min(220, maxAvail)}px`;
      }
    };

    const showRandomBubble = (customText = null) => {
      if (bubbleTimeout) clearTimeout(bubbleTimeout);
      updateBubbleOrientation(currentPos.x, currentPos.y);
      const text = customText || phrases[Math.floor(Math.random() * phrases.length)];
      if (bubbleText) bubbleText.textContent = text;
      bubble?.classList.add('active');

      bubbleTimeout = setTimeout(() => {
        bubble?.classList.remove('active');
      }, 5500);
    };

    // Khởi tạo vị trí ban đầu
    if (!hasCustomPlaced) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      currentPos = { x: Math.max(w - 78, 20), y: Math.max(h - 78, 70) };
    }
    updateBubbleOrientation(currentPos.x, currentPos.y);
    pet.style.left = `${currentPos.x}px`;
    pet.style.top = `${currentPos.y}px`;

    // Cơ chế kéo thả tự do 100% (Free Drag & Drop)
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startLeft = 0;
    let startTop = 0;
    let hasMoved = false;

    const onPointerDown = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      isDragging = true;
      hasMoved = false;
      dragStartX = clientX;
      dragStartY = clientY;
      const rect = pet.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      pet.style.transition = 'none';
      pet.style.cursor = 'grabbing';
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragStartX;
      const dy = clientY - dragStartY;

      if (!hasMoved && Math.hypot(dx, dy) > 5) {
        hasMoved = true;
      }

      if (hasMoved) {
        if (e.cancelable && e.touches) e.preventDefault();
        const newX = Math.max(10, Math.min(window.innerWidth - 64, startLeft + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - 64, startTop + dy));
        pet.style.left = `${newX}px`;
        pet.style.top = `${newY}px`;
        currentPos = { x: newX, y: newY };
        updateBubbleOrientation(newX, newY);
      }
    };

    const onPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      pet.style.cursor = 'pointer';
      pet.style.transition = 'transform 0.3s ease, filter 0.3s ease';

      if (hasMoved) {
        hasCustomPlaced = true;
        try {
          localStorage.setItem('diana_pet_position', JSON.stringify(currentPos));
        } catch (_) {}
        const dropMsg = dropPhrases[Math.floor(Math.random() * dropPhrases.length)];
        showRandomBubble(dropMsg);
      }
    };

    pet.addEventListener('mousedown', onPointerDown);
    pet.addEventListener('touchstart', onPointerDown, { passive: false });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);

    // Lời chào mở đầu
    setTimeout(() => {
      showRandomBubble('Chào anh Tiến! Diana đã sẵn sàng hỗ trợ anh ạ :3 🌸');
    }, 2500);

    // Phát biểu cảm ngẫu nhiên định kỳ
    setInterval(() => {
      if (!isDragging && Math.random() > 0.35) {
        showRandomBubble();
      }
    }, 14000);

    // Click handler (chỉ kích hoạt khi không kéo thả)
    pet.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasMoved) return;
      showRandomBubble();
      pet.style.transform = 'scale(1.25) rotate(15deg)';
      setTimeout(() => {
        pet.style.transform = 'scale(1) rotate(0deg)';
      }, 300);
    });

    // Double click to open Voice AI
    pet.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (hasMoved) return;
      this.switchTab('voice');
    });

    this.pulseMascotWake = (text = 'Dạ em nghe ạ! 🌸✨') => {
      showRandomBubble(text);
      pet?.classList.add('pulse-active');
      setTimeout(() => pet?.classList.remove('pulse-active'), 2500);
    };
  }

  // --------------------------------------------------------------------------
  // Interactive Welcome Hero Parallax Experience
  // --------------------------------------------------------------------------
  initHeroParallax() {
    const container = document.getElementById('welcomeContainer');
    const heroCard = document.getElementById('welcomeHeroCard');
    if (!container || !heroCard) return;

    let mouse = { x: -1000, y: -1000 };

    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;

      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = (mouse.x - cx) / cx;
      const dy = (mouse.y - cy) / cy;
      heroCard.style.transform = `perspective(1000px) rotateY(${dx * 4}deg) rotateX(${-dy * 4}deg) translateY(-2px)`;
    });

    container.addEventListener('mouseleave', () => {
      heroCard.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) translateY(0)';
    });
  }

  // --------------------------------------------------------------------------
  // 3. Render.com Minimalist Canvas Chart Engine
  // --------------------------------------------------------------------------
  initCharts() {
    class MinimalistChart {
      constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.maxPoints = options.maxPoints || 40;
        this.yLabels = options.yLabels || ['8 MB', '6 MB', '4 MB', '2 MB', '0 MB'];
        this.yMax = options.yMax || 8;
        this.showTimeLabels = options.showTimeLabels !== false;
        this.series = options.series || [];

        this.resize();
        window.addEventListener('resize', () => this.resize());
      }

      resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.draw();
      }

      addData(seriesIndex, value) {
        if (!this.series[seriesIndex]) return;
        const s = this.series[seriesIndex];
        s.data.push(value);
        if (s.data.length > this.maxPoints) s.data.shift();
        this.draw();
      }

      draw() {
        if (!this.ctx || !this.width || !this.height) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        const paddingLeft = 10;
        const paddingRight = 45;
        const paddingTop = 12;
        const paddingBottom = this.showTimeLabels ? 22 : 12;
        const chartWidth = Math.max(10, w - paddingLeft - paddingRight);
        const chartHeight = Math.max(10, h - paddingTop - paddingBottom);

        // 1. Gridlines & Y Labels
        const gridCount = this.yLabels.length - 1;
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1c1e24';
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let i = 0; i <= gridCount; i++) {
          const y = paddingTop + (chartHeight / gridCount) * i;
          ctx.beginPath();
          ctx.moveTo(paddingLeft, y);
          ctx.lineTo(paddingLeft + chartWidth, y);
          ctx.stroke();

          const label = this.yLabels[i];
          if (label) ctx.fillText(label, paddingLeft + chartWidth + 8, y);
        }

        // 2. Series Lines & Gradient Fills
        this.series.forEach(s => {
          if (!s.data || s.data.length < 2) return;
          const points = [];
          const stepX = chartWidth / (this.maxPoints - 1);

          for (let i = 0; i < s.data.length; i++) {
            const val = Math.min(Math.max(s.data[i], 0), this.yMax);
            const px = paddingLeft + i * stepX;
            const py = paddingTop + chartHeight - (val / this.yMax) * chartHeight;
            points.push({ x: px, y: py });
          }

          if (s.fillGradient) {
            const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
            grad.addColorStop(0, s.color + '25');
            grad.addColorStop(1, s.color + '00');

            ctx.beginPath();
            ctx.moveTo(points[0].x, paddingTop + chartHeight);
            for (let i = 0; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.lineTo(points[points.length - 1].x, paddingTop + chartHeight);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
          }

          ctx.beginPath();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 1.6;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';

          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
          ctx.stroke();
        });

        // 3. Time labels
        if (this.showTimeLabels) {
          ctx.fillStyle = '#585c69';
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          const timeMarks = ['60s', '45s', '30s', '15s', 'Live'];
          const numLabels = timeMarks.length;
          for (let i = 0; i < numLabels; i++) {
            const tx = paddingLeft + (chartWidth / (numLabels - 1)) * i;
            ctx.fillText(timeMarks[i], tx, h - paddingBottom + 6);
          }
        }
      }
    }

    // Network Chart (Bandwidth & FPS)
    this.networkChart = new MinimalistChart('networkChart', {
      maxPoints: 40,
      yMax: 10,
      yLabels: ['10 MB', '7.5 MB', '5 MB', '2.5 MB', '0 MB'],
      showTimeLabels: true,
      series: [
        { color: '#84cc16', data: [], fillGradient: true }, // Lime green (Bitrate)
        { color: '#a855f7', data: [], fillGradient: true }  // Purple (FPS)
      ]
    });

    // Compute Chart (CPU & RAM)
    this.computeChart = new MinimalistChart('computeChart', {
      maxPoints: 40,
      yMax: 100,
      yLabels: ['100%', '75%', '50%', '25%', '0%'],
      showTimeLabels: true,
      series: [
        { color: '#06b6d4', data: [], fillGradient: true }, // Cyan (CPU)
        { color: '#f59e0b', data: [], fillGradient: true }  // Amber (RAM)
      ]
    });

    // Pre-seed points
    for (let i = 0; i < 35; i++) {
      this.networkChart.series[0].data.push(6 + Math.random() * 3);
      this.networkChart.series[1].data.push(6 + (Math.random() * 0.4 - 0.2));
      this.computeChart.series[0].data.push(10 + Math.random() * 15);
      this.computeChart.series[1].data.push(45 + Math.random() * 5);
    }
    this.networkChart.draw();
    this.computeChart.draw();
  }

  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // 4. Host Discovery & API Client
  // --------------------------------------------------------------------------

  async apiRequest(endpoint, options = {}) {
    if (this.isDesktop) {
      if (endpoint === '/api/phone/dual/toggle' || endpoint.startsWith('/api/phone/dual/toggle') || endpoint === '/api/phone/dual/start' || endpoint.startsWith('/api/phone/dual/start') || endpoint.includes('mode=dual')) {
        let target = options.query?.target;
        if (!target && endpoint.includes('target=')) {
          const params = new URLSearchParams(endpoint.split('?')[1]);
          target = params.get('target');
        }
        return await (window.dianaDesktop?.startPhoneDual ? window.dianaDesktop.startPhoneDual(target || '') : window.dianaDesktop?.startPhoneMirror(target || '', 'dual'));
      }
      if (endpoint === '/api/phone/mirror/start' || endpoint.startsWith('/api/phone/mirror/start')) {
        let target = options.query?.target;
        if (!target && endpoint.includes('target=')) {
          const params = new URLSearchParams(endpoint.split('?')[1]);
          target = params.get('target');
        }
        const mode = endpoint.includes('mode=dual') ? 'dual' : 'mirror';
        return await window.dianaDesktop?.startPhoneMirror(target || '', mode);
      }
      if (endpoint === '/api/phone/mirror/stop' || endpoint.startsWith('/api/phone/mirror/stop')) {
        return await window.dianaDesktop?.stopPhoneMirror();
      }
      if (endpoint === '/api/phone/mirror/toggle' || endpoint.startsWith('/api/phone/mirror/toggle')) {
        let target = options.query?.target;
        if (!target && endpoint.includes('target=')) {
          const params = new URLSearchParams(endpoint.split('?')[1]);
          target = params.get('target');
        }
        const mode = endpoint.includes('mode=dual') ? 'dual' : 'mirror';
        const status = await window.dianaDesktop?.getMirrorStatus?.();
        if (status && status.mirrorActive) {
          return await window.dianaDesktop?.stopPhoneMirror();
        } else {
          return await window.dianaDesktop?.startPhoneMirror(target || '', mode);
        }
      }
      if (endpoint === '/pc/action' || endpoint.includes('lock')) {
        return window.dianaDesktop?.lockPC();
      }
      if (endpoint === '/api/bambu/status') {
        const st = await window.dianaDesktop?.bambuGetStatus?.();
        return { success: true, status: st };
      }
      if (endpoint === '/api/bambu/config') {
        const cfg = await window.dianaDesktop?.bambuGetConfig?.();
        return { success: true, config: cfg };
      }
      if (endpoint === '/api/bambu/scan') {
        return await window.dianaDesktop?.bambuScanLan?.();
      }
      if (endpoint === '/api/bambu/connect') {
        const bodyObj = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
        return await window.dianaDesktop?.bambuConnect?.(bodyObj);
      }
      if (endpoint === '/api/bambu/disconnect') {
        return await window.dianaDesktop?.bambuDisconnect?.();
      }
      if (endpoint === '/api/bambu/action') {
        const bodyObj = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
        return await this.bambuExec(bodyObj.action, bodyObj);
      }
    }

    const defaultHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const mergedOptions = {
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) }
    };

    const isChatEndpoint = endpoint.includes('/chat') || endpoint.includes('/voice');

    // Nếu PC Offline và là endpoint Chat/Voice -> Không cần quét LAN, trả về offline ngay để chạy AI độc lập 0s
    if (!this.stats.pcOnline && isChatEndpoint) {
      return { success: false, offline: true, error: 'PC Agent offline - standalone mode' };
    }

    // Xác định máy chủ mục tiêu
    let primaryHost = this.hostServer;
    if (!primaryHost || primaryHost === 'http://localhost' || primaryHost === 'http://localhost:80') {
      if (typeof window !== 'undefined' && window.location?.origin && window.location.origin.startsWith('http') && !window.location.origin.startsWith('file://')) {
        primaryHost = window.location.origin;
      } else {
        primaryHost = 'http://localhost:3000';
      }
    }

    // Danh sách host thử nghiệm có thứ tự ưu tiên
    const hostsToTry = isChatEndpoint
      ? [primaryHost]
      : Array.from(new Set([
          primaryHost,
          typeof window !== 'undefined' ? window.location?.origin : null,
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://192.168.0.100:3000',
          'http://192.168.0.101:3000'
        ].filter(h => h && h.startsWith('http') && !h.startsWith('file://'))));

    for (let i = 0; i < hostsToTry.length; i++) {
      const host = hostsToTry[i];
      const url = endpoint.startsWith('http') ? endpoint : `${host}${endpoint}`;

      try {
        const controller = new AbortController();
        const isLan = host.includes('192.168.') || host.includes('100.') || host.includes('localhost') || host.includes('127.0.0.1');
        // Đối với LAN: timeout tối đa 1200ms để phát hiện offline siêu nhanh (không làm người dùng chờ)
        const timeoutMs = isLan ? 1200 : 5000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        const res = await fetch(url, {
          ...mergedOptions,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        
        // Nếu trả về HTML trang web (chưa trúng endpoint API) -> Thử host kế tiếp
        if (text.trim().startsWith('<')) {
          continue;
        }

        try {
          const parsed = JSON.parse(text);
          if (this.hostServer !== host && host.startsWith('http://192.')) {
            this.hostServer = host;
            localStorage.setItem('diana_pc_host', host);
            if (this.txtHostServer) this.txtHostServer.value = host;
            this.updateStatus(true, 'PC Online');
          }
          return parsed;
        } catch (_) {
          return { success: res.ok, message: text };
        }
      } catch (err) {
        continue;
      }
    }

    return { 
      success: false, 
      offline: true,
      error: 'PC Agent offline (Standalone Mode)' 
    };
  }

  async apiCall(endpoint, options = {}) {
    return this.apiRequest(endpoint, options);
  }

  updateStatus(online, text) {
    this.stats.pcOnline = online;
    if (this.pcStatusBadge) {
      this.pcStatusBadge.className = `status-badge ${online ? 'online' : 'standalone'}`;
    }
    if (this.pcStatusText) {
      this.pcStatusText.textContent = text || (online ? 'PC Online' : '⚡ Độc Lập (4G)');
    }
  }

  log(msg, type = 'info') {
    if (!this.liveLogsConsole) return;
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    const time = new Date().toLocaleTimeString('vi-VN');
    line.textContent = `[${time}] ${msg}`;
    this.liveLogsConsole.appendChild(line);
    this.liveLogsConsole.scrollTop = this.liveLogsConsole.scrollHeight;
  }

  showToast(msg, type = 'info') {
    let toast = document.getElementById('dianaAppToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'dianaAppToast';
      toast.className = 'diana-app-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `diana-app-toast active ${type}`;
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      if (toast) toast.className = 'diana-app-toast';
    }, 2800);
  }

  // --------------------------------------------------------------------------
  // 5. Hardware Telemetry & Real-Time Stats Loop
  // --------------------------------------------------------------------------
  startTelemetryLoop() {
    let tickCount = 0;
    let missedPings = 0;
    setInterval(async () => {
      tickCount++;
      try {
        if (this.isDesktop && window.dianaDesktop?.getSystemStats) {
          const stats = await window.dianaDesktop.getSystemStats();
          if (stats) {
            this.stats.cpu = stats.cpuUsage || 12;
            this.stats.ram = stats.memUsagePercent || 48;
            if (this.overviewUptimeText) this.overviewUptimeText.textContent = `${stats.uptimeHours || 0} Giờ Uptime`;
          }
          const mirrorStatus = await window.dianaDesktop?.getMirrorStatus?.();
          if (mirrorStatus && typeof mirrorStatus.mirrorActive === 'boolean') {
            if (mirrorStatus.mirrorActive !== this.isMirroring) {
              this.isMirroring = mirrorStatus.mirrorActive;
              this.updateMirrorUI(mirrorStatus.mirrorActive ? 'active' : 'idle');
            }
          }
        } else if (this.hostServer) {
          try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`${this.hostServer}/api/status`, { signal: controller.signal }).then(r => r.json()).catch(() => null);
            clearTimeout(tid);
            if (res && (res.success || res.online)) {
              missedPings = 0;
              this.updateStatus(true, 'PC Online');
              if (res.uptime && this.overviewUptimeText) {
                this.overviewUptimeText.textContent = `${res.uptime} Uptime`;
              }
              if (typeof res.mirrorActive === 'boolean') {
                if (res.mirrorActive !== this.isMirroring) {
                  this.isMirroring = res.mirrorActive;
                  this.updateMirrorUI(res.mirrorActive ? 'active' : 'idle');
                }
              }
            } else {
              missedPings++;
              if (missedPings >= 3) {
                this.updateStatus(false, '⚡ Độc Lập (4G)');
              }
            }
          } catch (_) {
            missedPings++;
            if (missedPings >= 3) {
              this.updateStatus(false, '⚡ Độc Lập (4G)');
            }
          }
        }

        // Add telemetry point to rolling graphs
        this.computeChart?.addData(0, this.stats.cpu + (Math.random() * 4 - 2));
        this.computeChart?.addData(1, this.stats.ram + (Math.random() * 2 - 1));

        const liveFps = (59.5 + Math.random() * 1.0).toFixed(1);
        const liveBitrate = (7.8 + Math.random() * 0.8).toFixed(1);

        this.networkChart?.addData(0, parseFloat(liveBitrate));
        this.networkChart?.addData(1, (parseFloat(liveFps) / 60) * 8);

        if (this.overviewCpuText) this.overviewCpuText.textContent = `CPU: ${Math.round(this.stats.cpu)}%`;
        if (this.overviewRamText) this.overviewRamText.textContent = `RAM: ${Math.round(this.stats.ram)}%`;
        if (this.liveBitrateText) this.liveBitrateText.textContent = `${liveBitrate} Mbps`;
        if (this.liveFpsText) this.liveFpsText.textContent = `${liveFps} FPS`;
      } catch (_) {}
    }, 1500);
  }

  // --------------------------------------------------------------------------
  // 5b. Mirror UI State Manager & Real-Time Status Sync
  // --------------------------------------------------------------------------
  updateMirrorUI(state, errorMsg, mode = this.mirrorMode || 'mirror') {
    const isDual = mode === 'dual';
    const btnText = this.btnMirrorText;
    const dualText = this.btnDualText;
    const headerBtn = this.btnHeaderMirror;
    const sideBtn = this.btnSideLaunchMirror;
    const sideDualBtn = this.btnSideLaunchDual;
    const connectBtn = this.btnPhoneTabConnect;
    const dualBtn = this.btnPhoneTabDual;
    const statusBox = this.phoneConnectStatus;
    const mirrorDot = this.btnToggleMirror?.querySelector('.tool-dot');
    const dualDot = this.btnToggleDual?.querySelector('.tool-dot');

    switch (state) {
      case 'active':
        if (isDual) {
          if (dualText) dualText.textContent = '⏹ Dừng Song Song';
          if (btnText) btnText.textContent = '📱 Chiếu Màn Hình Gốc';
          if (headerBtn) { headerBtn.textContent = '⚡ Song Song (Đang Chạy)'; headerBtn.classList.add('active'); }
          if (sideDualBtn) { sideDualBtn.textContent = '⏹ Dừng Màn Hình Song Song'; sideDualBtn.classList.add('active'); }
          if (dualBtn) { dualBtn.textContent = '⏹ Dừng Màn Hình Song Song'; dualBtn.classList.add('active'); }
          if (this.btnToggleDual) this.btnToggleDual.classList.add('active');
          if (this.btnToggleMirror) this.btnToggleMirror.classList.remove('active');
          if (statusBox) statusBox.innerHTML = `<p style="color:#c084fc;">⚡ <strong>Đang chạy Màn Hình Song Song Độc Lập!</strong> Màn hình điện thoại thật hoàn toàn tự do.</p>`;
          if (dualDot) dualDot.style.background = '#c084fc';
          if (mirrorDot) mirrorDot.style.background = '';
        } else {
          if (btnText) btnText.textContent = '⏹ Dừng Chiếu (Đang Chạy)';
          if (dualText) dualText.textContent = '⚡ Màn Hình Song Song';
          if (headerBtn) { headerBtn.textContent = 'Dừng Chiếu'; headerBtn.classList.add('active'); }
          if (sideBtn) { sideBtn.textContent = 'Dừng Chiếu Màn Hình'; sideBtn.classList.add('active'); }
          if (connectBtn) { connectBtn.textContent = 'Dừng Chiếu Màn Hình'; connectBtn.classList.add('active'); }
          if (this.btnToggleMirror) this.btnToggleMirror.classList.add('active');
          if (this.btnToggleDual) this.btnToggleDual.classList.remove('active');
          if (statusBox) statusBox.innerHTML = `<p style="color:#84cc16;">✅ <strong>Đang chiếu trực tiếp màn hình điện thoại!</strong> Direct3D 11.</p>`;
          if (mirrorDot) mirrorDot.style.background = '#4ade80';
          if (dualDot) dualDot.style.background = '';
        }
        break;
      case 'connecting':
        if (isDual && dualText) dualText.textContent = 'Đang khởi chạy...';
        else if (btnText) btnText.textContent = 'Đang kết nối...';
        if (this.btnToggleMirror) this.btnToggleMirror.classList.remove('active');
        if (this.btnToggleDual) this.btnToggleDual.classList.remove('active');
        if (statusBox) statusBox.innerHTML = `<p style="color:#fbbf24;">⏳ <strong>Đang kết nối tới thiết bị...</strong> Vui lòng giữ màn hình điện thoại sáng.</p>`;
        break;
      case 'stopping':
        if (btnText) btnText.textContent = 'Đang dừng...';
        if (dualText) dualText.textContent = 'Đang dừng...';
        if (this.btnToggleMirror) this.btnToggleMirror.classList.remove('active');
        if (this.btnToggleDual) this.btnToggleDual.classList.remove('active');
        break;
      case 'error':
      case 'idle':
      default:
        this.mirrorMode = null;
        if (btnText) btnText.textContent = 'Bật Chiếu Màn Hình';
        if (dualText) dualText.textContent = '⚡ Màn Hình Song Song';
        if (headerBtn) { headerBtn.textContent = 'Chiếu Màn Hình'; headerBtn.classList.remove('active'); }
        if (sideBtn) { sideBtn.textContent = '📱 Bật Chiếu Màn Hình Trên PC'; sideBtn.classList.remove('active'); }
        if (sideDualBtn) { sideDualBtn.textContent = '⚡ Màn Hình Song Song Độc Lập'; sideDualBtn.classList.remove('active'); }
        if (connectBtn) { connectBtn.textContent = '📱 Chiếu Màn Hình'; connectBtn.classList.remove('active'); }
        if (dualBtn) { dualBtn.textContent = '⚡ Màn Hình Song Song'; dualBtn.classList.remove('active'); }
        if (this.btnToggleMirror) this.btnToggleMirror.classList.remove('active');
        if (this.btnToggleDual) this.btnToggleDual.classList.remove('active');
        if (statusBox) statusBox.innerHTML = state === 'error'
          ? `<p style="color:#ef4444;">⚠️ <strong>Lỗi kết nối:</strong> ${errorMsg || 'Vui lòng kiểm tra lại ADB'}</p>`
          : `<p>🟢 <strong>Sẵn sàng:</strong> Chọn chế độ chiếu màn hình hoặc màn hình song song để hiển thị trên PC.</p>`;
        if (mirrorDot) mirrorDot.style.background = '';
        if (dualDot) dualDot.style.background = '';
        break;
    }
  }

  /**
   * Đồng bộ trạng thái mirror thực tế giữa Phone App và PC App
   * Poll server mỗi 2.5 giây để kiểm tra scrcpy.exe có đang chạy hay không
   */
  startMirrorStatusSync() {
    setInterval(async () => {
      try {
        let mirrorActive = false;

        if (this.isDesktop && window.dianaDesktop?.getMirrorStatus) {
          // Desktop Electron: kiểm tra qua IPC
          const status = await window.dianaDesktop.getMirrorStatus();
          if (status && typeof status.mirrorActive === 'boolean') {
            mirrorActive = status.mirrorActive;
          }
        } else if (this.stats.pcOnline) {
          // Web/Phone App: poll server API chỉ khi PC Online
          const host = this.hostServer || window.location.origin;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 1200);
          const res = await fetch(`${host}/api/mirror/status`, { signal: controller.signal });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.mirrorActive === 'boolean') {
              mirrorActive = data.mirrorActive;
            }
          }
        }

        // Đồng bộ nếu trạng thái server khác với client local
        if (mirrorActive !== this.isMirroring) {
          this.isMirroring = mirrorActive;
          this.updateMirrorUI(mirrorActive ? 'active' : 'idle');
        }
      } catch (_) {}
    }, 2500);
  }

  updateAirGestureUI(isActive) {
    this.isAirGestureActive = isActive;
    if (this.btnToggleAirGesture) {
      if (isActive) {
        this.btnToggleAirGesture.classList.add('active');
        if (this.btnAirGestureText) this.btnAirGestureText.textContent = 'Cử Chỉ: Đang Bật';
      } else {
        this.btnToggleAirGesture.classList.remove('active');
        if (this.btnAirGestureText) this.btnAirGestureText.textContent = 'Cử Chỉ Tay (Air Gesture)';
      }
    }
    if (this.btnExecAirGesture) {
      this.btnExecAirGesture.textContent = isActive ? 'Tắt Cử Chỉ' : 'Bật Cử Chỉ';
      this.btnExecAirGesture.className = isActive ? 'btn-control-action danger' : 'btn-control-action';
    }
  }

  startAirGestureStatusSync() {
    setInterval(async () => {
      try {
        let active = false;
        if (this.isDesktop && window.dianaDesktop?.getAirGestureStatus) {
          const res = await window.dianaDesktop.getAirGestureStatus();
          active = Boolean(res && res.active);
        } else if (this.stats.pcOnline) {
          const host = this.hostServer || window.location.origin;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 1200);
          const res = await fetch(`${host}/api/air-gesture/status`, { signal: controller.signal });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            active = Boolean(data && data.active);
          }
        }
        if (active !== this.isAirGestureActive) {
          this.updateAirGestureUI(active);
        }
      } catch (_) {}
    }, 2500);
  }

  // --------------------------------------------------------------------------
  // 6. Action Handlers: Scrcpy Mirror, PC Remote, Settings
  // --------------------------------------------------------------------------
  initEventListeners() {
    // Mirror Toggle (Start/Stop)
    const toggleMirror = async (mode = 'mirror') => {
      const isDual = mode === 'dual';
      if (this.isMirroring && this.mirrorMode === mode) {
        // === DỪNG PHIÊN HIỆN TẠI ===
        this.log('[Scrcpy] ⏹ Đang dừng phiên làm việc...', 'info');
        this.updateMirrorUI('stopping');
        try {
          if (this.isDesktop) {
            await window.dianaDesktop?.stopPhoneMirror();
          } else {
            await this.apiCall('/api/phone/mirror/stop', { method: 'GET' });
          }
          this.isMirroring = false;
          this.mirrorMode = null;
          this.updateMirrorUI('idle');
          this.log('[Scrcpy] ⏹ Đã dừng phiên màn hình.', 'info');
        } catch (err) {
          this.isMirroring = false;
          this.mirrorMode = null;
          this.updateMirrorUI('idle');
          this.log(`[Scrcpy] ❌ Lỗi dừng: ${err.message || err}`, 'error');
        }
        return;
      }

      // === KHỞI CHẠY CHẾ ĐỘ MỚI ===
      const target = this.phoneTabTargetIp?.value?.trim() || localStorage.getItem('diana_phone_ip') || '';
      if (target) {
        try { localStorage.setItem('diana_phone_ip', target); } catch (_) {}
        if (this.phoneTabTargetIp && !this.phoneTabTargetIp.value) this.phoneTabTargetIp.value = target;
      }
      this.log(`[Scrcpy] 📱 Đang khởi chạy ${isDual ? 'Màn Hình Song Song Độc Lập' : 'Chiếu Màn Hình Gốc'}...`, 'info');
      this.mirrorMode = mode;
      this.updateMirrorUI('connecting', null, mode);

      try {
        let res;
        if (this.isDesktop) {
          if (isDual && window.dianaDesktop?.startPhoneDual) {
            res = await window.dianaDesktop.startPhoneDual(target);
          } else if (window.dianaDesktop?.startPhoneMirror) {
            res = await window.dianaDesktop.startPhoneMirror(target, mode);
          }
        } else {
          const endpoint = isDual
            ? `/api/phone/dual/toggle?target=${encodeURIComponent(target)}`
            : `/api/phone/mirror/toggle?target=${encodeURIComponent(target)}&mode=${mode}`;
          res = await this.apiCall(endpoint, { method: 'GET' });
        }

        if (res && res.success) {
          if (res.activeDevice) {
            try { localStorage.setItem('diana_phone_ip', res.activeDevice); } catch (_) {}
            if (this.phoneTabTargetIp) this.phoneTabTargetIp.value = res.activeDevice;
          }
          if (res.isMirroring === false || res.action === 'stopped' || res.message?.includes('tắt')) {
            this.isMirroring = false;
            this.mirrorMode = null;
            this.updateMirrorUI('idle');
            this.log('[Scrcpy] ⏹ Đã dừng phiên màn hình!', 'info');
          } else {
            this.isMirroring = true;
            this.mirrorMode = mode;
            this.updateMirrorUI('active', null, mode);
            this.log(`[Scrcpy] ✅ Đã mở ${isDual ? 'Màn Hình Song Song Độc Lập' : 'Chiếu Màn Hình'} cho ${res.activeDevice || target || ''} trên PC!`, 'success');
          }
        } else {
          this.isMirroring = false;
          this.mirrorMode = null;
          this.updateMirrorUI('error', res?.error);
          this.log(`[Scrcpy] ❌ Lỗi kết nối: ${res?.error || 'Thất bại'}`, 'error');
        }
      } catch (err) {
        this.isMirroring = false;
        this.mirrorMode = null;
        this.updateMirrorUI('error', err.message);
        this.log(`[Scrcpy] ❌ Lỗi: ${err.message || err}`, 'error');
      }
    };

    // Tất cả nút mirror / dual screen
    this.btnHeaderMirror?.addEventListener('click', () => toggleMirror('mirror'));
    this.btnToggleMirror?.addEventListener('click', () => toggleMirror('mirror'));
    this.btnSideLaunchMirror?.addEventListener('click', () => toggleMirror('mirror'));
    this.btnPhoneTabConnect?.addEventListener('click', () => toggleMirror('mirror'));

    this.btnToggleDual?.addEventListener('click', () => toggleMirror('dual'));
    this.btnSideLaunchDual?.addEventListener('click', () => toggleMirror('dual'));
    this.btnPhoneTabDual?.addEventListener('click', () => toggleMirror('dual'));
    this.btnPhoneTabStop?.addEventListener('click', async () => {
      // Nút stop riêng ở tab Phone luôn force stop
      this.log('[Scrcpy] ⏹ Đang dừng phiên chiếu màn hình...', 'info');
      try {
        if (this.isDesktop) {
          await window.dianaDesktop?.stopPhoneMirror();
        } else {
          await this.apiCall('/api/phone/mirror/stop', { method: 'GET' });
        }
      } catch (_) {}
      this.isMirroring = false;
      this.updateMirrorUI('idle');
      this.log('[Scrcpy] Đã dừng stream màn hình.', 'info');
    });

    // Expose trigger NFC Mirror ra toàn cục để Native App hoặc sự kiện chạm RFID gọi
    window.dianaTriggerMirror = (mode = 'mirror') => toggleMirror(mode);
    window.dianaStation = {
      ...(window.dianaStation || {}),
      triggerNfcMirror: (mode = 'mirror') => toggleMirror(mode),
      stopMirror: () => {
        this.apiCall('/api/phone/mirror/stop', { method: 'GET' }).catch(() => {});
        this.isMirroring = false;
        this.updateMirrorUI('idle');
      }
    };

    // Scan LAN for ADB Devices
    this.btnPhoneTabScan?.addEventListener('click', async () => {
      this.btnPhoneTabScan.textContent = '🔍 Đang quét...';
      try {
        if (this.isDesktop) {
          const found = await window.dianaDesktop?.scanAdbDevices();
          if (found && found.length > 0) {
            const ip = `${found[0]}:5555`;
            if (this.phoneTabTargetIp) this.phoneTabTargetIp.value = ip;
            if (this.overviewPhoneIp) this.overviewPhoneIp.textContent = ip;
            alert(`✅ Đã tìm thấy thiết bị: ${ip}`);
          } else {
            alert('⚠️ Không tìm thấy thiết bị nào mở cổng 5555 trên LAN.');
          }
        } else {
          // Default to Redmi K70 address
          if (this.phoneTabTargetIp) this.phoneTabTargetIp.value = '192.168.100.225:5555';
          alert('✅ Đã nạp địa chỉ IP mặc định: 192.168.100.225:5555');
        }
      } catch (_) {}
      this.btnPhoneTabScan.textContent = '🔍 Quét';
    });

    // Air Gesture Toggle (Start/Stop)
    const toggleAirGesture = async () => {
      this.log('[AirGesture] 🖐️ Đang chuyển đổi trạng thái cử chỉ tay AI...', 'info');
      try {
        let res;
        if (this.isDesktop && window.dianaDesktop?.toggleAirGesture) {
          res = await window.dianaDesktop.toggleAirGesture();
        } else {
          res = await this.apiCall('/api/air-gesture/toggle', { method: 'GET' });
        }

        const isActive = Boolean(res && res.active);
        this.updateAirGestureUI(isActive);
        if (isActive) {
          this.log('[AirGesture] 🖐️ Đã BẬT Air Gesture AI! Di chuyển ngón tay trước Webcam để điều khiển chuột & cử chỉ.', 'success');
        } else {
          this.log('[AirGesture] ⏹ Đã TẮT Air Gesture AI.', 'info');
        }
      } catch (err) {
        this.log(`[AirGesture] ❌ Lỗi: ${err.message || err}`, 'error');
      }
    };

    this.btnToggleAirGesture?.addEventListener('click', toggleAirGesture);
    this.btnExecAirGesture?.addEventListener('click', toggleAirGesture);

    // PC Controls
    const executePCCommand = async (commandName, voiceQuery) => {
      this.log(`[PC Control] Đang thực thi lệnh: ${commandName}...`, 'info');
      try {
        if (this.isDesktop) {
          if (commandName === 'lock') window.dianaDesktop?.lockPC();
          if (commandName === 'sleep') window.dianaDesktop?.sleepPC();
        } else {
          const res = await this.apiCall('/api/voice', {
            method: 'POST',
            body: JSON.stringify({ query: voiceQuery })
          });
          this.log(`[PC Control] Kết quả: ${res.reply || 'Thành công'}`, 'success');
          if (res.reply) this.speakTTS(res.reply);
        }
      } catch (err) {
        this.log(`[PC Control] Lỗi: ${err.message}`, 'error');
      }
    };

    this.btnExecLock?.addEventListener('click', () => executePCCommand('lock', 'Khóa máy tính cho anh'));
    this.btnQuickLock?.addEventListener('click', () => executePCCommand('lock', 'Khóa máy tính cho anh'));
    this.btnExecSleep?.addEventListener('click', () => executePCCommand('sleep', 'Chế độ ngủ máy tính'));
    this.btnQuickSleep?.addEventListener('click', () => executePCCommand('sleep', 'Chế độ ngủ máy tính'));

    // Screenshot PC
    const captureScreenshot = async () => {
      this.log('[PC Control] 📸 Đang chụp ảnh màn hình PC...', 'info');
      try {
        const res = await this.apiCall('/api/voice', {
          method: 'POST',
          body: JSON.stringify({ query: 'Chụp ảnh màn hình máy tính' })
        });
        
        let replyPayload = res?.reply || res;
        let base64 = typeof replyPayload === 'object' ? replyPayload.screenshotBase64 : res?.screenshotBase64;
        let textMsg = typeof replyPayload === 'object' ? (replyPayload.text || replyPayload.message) : (replyPayload || '📸 Đã chụp màn hình máy tính!');

        this.log(`[PC Control] ${textMsg}`, 'success');

        if (base64) {
          const imgSrc = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
          if (this.imageLightbox && this.lightboxImg) {
            if (this.lightboxTitle) this.lightboxTitle.textContent = '📸 Ảnh Chụp Màn Hình PC';
            this.lightboxImg.src = imgSrc;
            this.imageLightbox.style.display = 'flex';
          }
        }
        
        this.appendMessage('bot', replyPayload);
      } catch (err) {
        this.log(`[PC Control] Lỗi chụp màn hình: ${err.message}`, 'error');
      }
    };

    this.btnExecScreenshot?.addEventListener('click', captureScreenshot);
    this.btnQuickShot?.addEventListener('click', captureScreenshot);
    this.lightboxCloseBtn?.addEventListener('click', () => {
      if (this.imageLightbox) this.imageLightbox.style.display = 'none';
    });

    // Shutdown PC
    this.btnExecShutdown?.addEventListener('click', () => {
      if (confirm('⚠️ Bạn có chắc chắn muốn tắt máy tính không?')) {
        executePCCommand('shutdown', 'Tắt máy tính cho anh');
      }
    });

    // Logs Console Controls
    this.btnClearLogs?.addEventListener('click', () => {
      if (this.liveLogsConsole) this.liveLogsConsole.innerHTML = '';
      this.log('[System] Đã xóa nhật ký.', 'info');
    });

    this.btnRefreshLogs?.addEventListener('click', async () => {
      if (this.isDesktop && window.dianaDesktop?.readLogs) {
        const res = await window.dianaDesktop.readLogs();
        if (res?.logs) this.log(res.logs, 'info');
      }
    });

    // Settings Controls
    this.btnSaveSettings?.addEventListener('click', () => {
      if (this.txtHostServer) {
        this.hostServer = this.txtHostServer.value.trim();
        localStorage.setItem('diana_pc_host', this.hostServer);
      }
      if (this.chkTTS) {
        this.ttsEnabled = this.chkTTS.checked;
        localStorage.setItem('diana_tts', String(this.ttsEnabled));
      }
      if (this.chkAutoDiscover) {
        this.autoDiscover = this.chkAutoDiscover.checked;
        localStorage.setItem('diana_auto_discover', String(this.autoDiscover));
      }
      alert('💾 Đã lưu cấu hình cài đặt thành công!');
      this.discoverHost();
    });

    this.btnTestConnection?.addEventListener('click', () => this.discoverHost());

    // Khởi tạo tính năng tùy biến thẻ RFID / NFC
    this.initNfcTagSettings();
  }

  // --------------------------------------------------------------------------
  // 6.6 NFC / RFID Tag Manager & Custom Actions
  // --------------------------------------------------------------------------
  initNfcTagSettings() {
    this.nfcTags = [
      { id: '6C7CAE67', name: 'Cuộn Bambu #1 (Trắng/PLA)', action: 'toggle_mirror' },
      { id: '4C50A167', name: 'Cuộn Bambu #2 (Đen/PETG)', action: 'toggle_station' }
    ];
    this.nfcAvailableActions = [
      { id: 'toggle_mirror', icon: '📱', label: 'Bật / Tắt Chiếu Màn Hình (Scrcpy 60FPS)' },
      { id: 'toggle_station', icon: '🖥️', label: 'Bật / Tắt Trạm Diana Central Station' },
      { id: 'toggle_both', icon: '⚡', label: 'Đồng Bộ Song Song Cả Hai (Trạm + Chiếu MH)' },
      { id: 'toggle_dual', icon: '🌐', label: 'Màn Hình Ảo Song Song (Dual Display)' },
      { id: 'lock_pc', icon: '🔒', label: 'Khóa Máy Tính Tức Thì (Win + L)' },
      { id: 'sleep_pc', icon: '🌙', label: 'Đưa Máy Vào Chế Độ Ngủ (Sleep)' },
      { id: 'focus_mode', icon: '🎧', label: 'Chế Độ Tập Trung & Chill (Studio Focus)' },
      { id: 'bambu_status', icon: '🖨️', label: 'Đọc Trạng Thái Máy In Bambu Lab' },
      { id: 'pc_screenshot', icon: '📸', label: 'Chụp Màn Hình PC Gửi Sang Điện Thoại' }
    ];

    const renderTagsList = () => {
      const container = document.getElementById('nfcTagsList');
      if (!container) return;
      container.innerHTML = '';

      if (!this.nfcTags || this.nfcTags.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px; font-size: 0.85rem;">Chưa có thẻ nào được cấu hình. Anh hãy thêm thẻ mới bên dưới nhé!</div>`;
        return;
      }

      this.nfcTags.forEach((tag, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 12px; padding: 12px 14px; display: grid; grid-template-columns: 130px 1fr 1fr auto auto; gap: 10px; align-items: center; transition: all 0.2s ease;';
        item.className = 'nfc-tag-card-item';

        const actionOptions = this.nfcAvailableActions.map(a => 
          `<option value="${a.id}" ${tag.action === a.id ? 'selected' : ''}>${a.icon} ${a.label}</option>`
        ).join('');

        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 1.1rem;">🏷️</span>
            <code style="background: rgba(0, 0, 0, 0.5); color: #38bdf8; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-family: monospace; font-size: 0.86rem;">${tag.id}</code>
          </div>
          <div>
            <input type="text" class="clean-input nfc-tag-name-input" data-index="${idx}" value="${tag.name || ''}" placeholder="Tên gợi nhớ..." style="padding: 6px 10px; font-size: 0.84rem;">
          </div>
          <div>
            <select class="clean-select nfc-tag-action-select" data-index="${idx}" style="padding: 6px 10px; font-size: 0.84rem;">
              ${actionOptions}
            </select>
          </div>
          <div>
            <button class="btn-tool-secondary btn-test-nfc-action" data-index="${idx}" title="Chạy thử hành động này" style="padding: 6px 12px; font-size: 0.78rem;">
              ▶ Thử
            </button>
          </div>
          <div>
            <button class="btn-action-danger btn-delete-nfc-tag" data-index="${idx}" title="Xóa thẻ" style="padding: 6px 10px; font-size: 0.78rem;">
              🗑️
            </button>
          </div>
        `;

        container.appendChild(item);
      });

      // Bind dynamic handlers
      container.querySelectorAll('.nfc-tag-name-input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const i = parseInt(e.target.dataset.index);
          if (this.nfcTags[i]) this.nfcTags[i].name = e.target.value.trim();
        });
      });

      container.querySelectorAll('.nfc-tag-action-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const i = parseInt(e.target.dataset.index);
          if (this.nfcTags[i]) this.nfcTags[i].action = e.target.value;
        });
      });

      container.querySelectorAll('.btn-test-nfc-action').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const i = parseInt(e.target.dataset.index);
          const tag = this.nfcTags[i];
          if (!tag) return;
          this.log(`[RFID NFC] 🚀 Đang thử nghiệm hành động "${tag.action}" của thẻ [${tag.id}]...`, 'info');
          try {
            const res = await this.apiCall(`/api/nfc/trigger?action=${tag.action}&tagId=${tag.id}`);
            this.log(`[RFID NFC] ✅ Kết quả: ${res.message || 'Thành công'}`, 'success');
          } catch (err) {
            this.log(`[RFID NFC] ❌ Lỗi chạy thử: ${err.message}`, 'error');
          }
        });
      });

      container.querySelectorAll('.btn-delete-nfc-tag').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const i = parseInt(e.target.dataset.index);
          if (confirm(`Anh có chắc chắn muốn xóa thẻ ${this.nfcTags[i]?.id}?`)) {
            this.nfcTags.splice(i, 1);
            renderTagsList();
          }
        });
      });
    };

    const fetchConfig = async () => {
      try {
        const res = await this.apiCall('/api/nfc/config');
        if (res && res.success) {
          if (Array.isArray(res.tags)) this.nfcTags = res.tags;
          if (Array.isArray(res.availableActions)) this.nfcAvailableActions = res.availableActions;
          if (res.lastScanned) {
            const lblId = document.getElementById('lblNfcLastScannedId');
            const lblTime = document.getElementById('lblNfcLastScannedTime');
            if (lblId) lblId.textContent = res.lastScanned.id;
            if (lblTime) lblTime.textContent = `(${res.lastScanned.time || 'vừa xong'})`;
          }
          renderTagsList();
        }
      } catch (err) {
        // Fallback to local storage
        const saved = localStorage.getItem('diana_nfc_tags');
        if (saved) {
          try { this.nfcTags = JSON.parse(saved); } catch (_) {}
        }
        renderTagsList();
      }
    };

    const saveConfig = async () => {
      try {
        localStorage.setItem('diana_nfc_tags', JSON.stringify(this.nfcTags));
        const res = await this.apiCall('/api/nfc/config', {
          method: 'POST',
          body: JSON.stringify({ tags: this.nfcTags })
        });
        this.log('[RFID NFC] 💾 Đã lưu cấu hình thẻ RFID thành công!', 'success');
        alert('💾 Đã lưu cấu hình thẻ RFID/NFC thành công! Các thao tác chạm thẻ sẽ hoạt động theo thiết lập mới.');
      } catch (err) {
        this.log(`[RFID NFC] ⚠️ Lưu cấu hình offline: ${err.message}`, 'warning');
        alert('💾 Đã lưu cấu hình thẻ vào bộ nhớ cục bộ.');
      }
    };

    // Form thêm thẻ mới
    const btnAdd = document.getElementById('btnAddNewNfcTag');
    btnAdd?.addEventListener('click', () => {
      const txtId = document.getElementById('txtNewTagId');
      const txtName = document.getElementById('txtNewTagName');
      const selAction = document.getElementById('selNewTagAction');

      const idVal = (txtId?.value || '').trim().toUpperCase();
      const nameVal = (txtName?.value || '').trim();
      const actVal = selAction?.value || 'toggle_mirror';

      if (!idVal) {
        alert('Vui lòng nhập mã UID của thẻ (hoặc chạm thẻ vào điện thoại để lấy mã tự động)!');
        return;
      }

      const existing = this.nfcTags.find(t => t.id.toUpperCase() === idVal);
      if (existing) {
        alert(`Thẻ có mã UID ${idVal} đã tồn tại trong danh sách!`);
        return;
      }

      this.nfcTags.push({
        id: idVal,
        name: nameVal || `Thẻ RFID ${idVal}`,
        action: actVal
      });

      if (txtId) txtId.value = '';
      if (txtName) txtName.value = '';
      renderTagsList();
    });

    // Quick add from last scanned
    const btnQuickAdd = document.getElementById('btnQuickAddLastScanned');
    btnQuickAdd?.addEventListener('click', () => {
      const lblId = document.getElementById('lblNfcLastScannedId');
      const lastId = lblId?.textContent?.trim();
      if (lastId && lastId !== 'CHƯA CÓ') {
        const txtId = document.getElementById('txtNewTagId');
        if (txtId) {
          txtId.value = lastId;
          txtId.focus();
        }
      }
    });

    // Save & Refresh buttons
    document.getElementById('btnSaveNfcConfig')?.addEventListener('click', saveConfig);
    document.getElementById('btnRefreshNfcConfig')?.addEventListener('click', fetchConfig);

    // Initial load
    fetchConfig();

    // Poll last scanned tag periodically when settings tab is active
    setInterval(() => {
      const settingsPane = document.getElementById('pane-settings');
      if (settingsPane && settingsPane.classList.contains('active')) {
        this.apiCall('/api/nfc/config').then(res => {
          if (res?.lastScanned) {
            const lblId = document.getElementById('lblNfcLastScannedId');
            const lblTime = document.getElementById('lblNfcLastScannedTime');
            if (lblId) lblId.textContent = res.lastScanned.id;
            if (lblTime) lblTime.textContent = `(${res.lastScanned.time || 'vừa xong'})`;
          }
        }).catch(() => {});
      }
    }, 3000);
  }

  // --------------------------------------------------------------------------
  // 7. Voice Assistant & AI Chat
  // --------------------------------------------------------------------------
  initVoiceAssistant() {
    const showAssistantTyping = () => {
      document.getElementById('assistantTypingIndicator')?.remove();
      const typingRow = document.createElement('div');
      typingRow.className = 'chat-bubble bot chat-typing-bubble';
      typingRow.id = 'assistantTypingIndicator';
      typingRow.innerHTML = `
        <div class="bubble-avatar">✨</div>
        <div class="bubble-content" style="padding: 10px 16px;">
          <div class="secret-typing"><span></span><span></span><span></span></div>
        </div>
      `;
      this.chatMessages?.appendChild(typingRow);
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    };

    const removeAssistantTyping = () => {
      document.getElementById('assistantTypingIndicator')?.remove();
    };

    // Send Text Query
    const sendQuery = async () => {
      const query = this.textInput?.value?.trim();
      if (!query) return;

      this.textInput.value = '';
      this.appendMessage('user', query);
      showAssistantTyping();

      // Hide welcome card if visible
      const welcomeCard = document.getElementById('welcomeCard');
      if (welcomeCard) welcomeCard.style.display = 'none';

      try {
        this.log(`[AI] Truy vấn: "${query}"`, 'info');
        let replyText = '';
        let screenshotBase64 = null;

        // Nếu PC Online -> Thử gọi PC Agent
        if (this.stats.pcOnline) {
          try {
            const res = await this.apiCall('/api/voice', {
              method: 'POST',
              body: JSON.stringify({ query })
            });

            if (res && (res.reply || res.message)) {
              replyText = res.reply || res.message;
              screenshotBase64 = res.screenshotBase64;
            }
          } catch (_) {}
        }

        // Nếu PC Offline hoặc lỗi -> Chạy Standalone AI Direct siêu tốc (0ms delay)
        if (!replyText) {
          try {
            let hist = [];
            try {
              hist = JSON.parse(localStorage.getItem('diana_assistant_history') || '[]');
            } catch (_) {}

            const isImgCmd = query.toLowerCase().startsWith('/anhhientai') || query.toLowerCase().startsWith('/anh') || query.toLowerCase().includes('ảnh hiện tại') || query.toLowerCase().includes('ảnh của em');
            if (isImgCmd) {
              replyText = 'Dạ, đây là hình ảnh hiện tại của em lúc này nè anh Tiến! Em rất vui được ở bên cạnh anh ạ 🌸✨';
              screenshotBase64 = null;
              this.appendMessage('bot', {
                text: replyText,
                imageUrl: 'assets/diana_sweet.jpg'
              });
              hist.push({ role: 'user', text: query, timestamp: new Date().toISOString() });
              hist.push({ role: 'model', text: replyText, timestamp: new Date().toISOString() });
              localStorage.setItem('diana_assistant_history', JSON.stringify(hist));
              removeAssistantTyping();
              if (this.ttsEnabled) this.speakTTS(replyText);
              return;
            }

            const apiKey = 'AIzaSyAf2IDSIbcY_5LbICNeDmrbdzesruguGPE';
            const prompt = `Bạn là Diana - Trợ lý ảo AI thông minh, tận tâm và thân thiện của anh Phan Minh Duy Tiến (sinh viên TDTU, MSSV 42200522, ngành Kỹ thuật Điện tử - Viễn thông).
Bạn luôn trả lời bằng tiếng Việt một cách tự nhiên, lễ phép, thông minh và súc tích (xưng Em, gọi là Anh hoặc Anh Tiến).
Bạn có kiến thức sâu rộng về học tập, lập trình, công nghệ, cuộc sống và luôn hỗ trợ anh Tiến nhiệt tình nhất có thể.`;

            const contents = [
              { role: 'user', parts: [{ text: `System Instruction: ${prompt}` }] },
              { role: 'model', parts: [{ text: `Dạ em chào anh Tiến, em là Diana, trợ lý của anh đây ạ! Anh cần em hỗ trợ điều gì hôm nay? ✨` }] }
            ];

            if (Array.isArray(hist)) {
              for (const m of hist.slice(-8)) {
                contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] });
              }
            }
            contents.push({ role: 'user', parts: [{ text: query }] });

            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 8000);
            const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                contents,
                generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
              })
            });
            clearTimeout(tid);

            const genData = await genRes.json();
            if (genData.candidates && genData.candidates[0]?.content?.parts?.[0]?.text) {
              replyText = genData.candidates[0].content.parts[0].text;
              hist.push({ role: 'user', text: query, timestamp: new Date().toISOString() });
              hist.push({ role: 'model', text: replyText, timestamp: new Date().toISOString() });
              localStorage.setItem('diana_assistant_history', JSON.stringify(hist));
            }
          } catch (err2) {
            console.warn('[Assistant Standalone] Lỗi direct AI:', err2);
          }
        }

        removeAssistantTyping();

        if (replyText) {
          let replyPayload = replyText;
          if (screenshotBase64) {
            replyPayload = { text: replyText, screenshotBase64 };
          }
          this.appendMessage('bot', replyPayload);
          this.log(`[AI] Phản hồi: "${replyText}"`, 'success');

          if (this.ttsEnabled) {
            this.speakTTS(replyText);
          }
        } else {
          this.appendMessage('bot', 'Dạ em chào anh Tiến, em đang ở chế độ độc lập và sẵn sàng trò chuyện cùng anh rồi ạ! ✨');
        }
      } catch (err) {
        removeAssistantTyping();
        this.appendMessage('bot', `⚠️ Lỗi: ${err.message}`);
      } finally {
        removeAssistantTyping();
      }
    };

    this.sendBtn?.addEventListener('click', sendQuery);
    this.textInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendQuery();
      }
    });

    // Quick prompt chips
    document.querySelectorAll('.prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.getAttribute('data-query');
        if (query && this.textInput) {
          this.textInput.value = query;
          sendQuery();
        }
      });
    });

    // Voice Mic Recording
    const toggleMic = () => {
      if (this.isListening) {
        this.stopVoiceRecording();
      } else {
        this.startVoiceRecording();
      }
    };

    this.micBtn?.addEventListener('click', toggleMic);
    this.headerMicBtn?.addEventListener('click', toggleMic);

    // Global Reload Shortcut (Ctrl+R / F5)
    window.addEventListener('keydown', (e) => {
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') || e.key === 'F5') {
        if (window.dianaDesktop?.reload) {
          e.preventDefault();
          window.dianaDesktop.reload();
        } else {
          window.location.reload();
        }
      }
    });
  }

  appendMessage(role, text) {
    if (!this.chatMessages) return;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'bubble-avatar';
    avatar.textContent = role === 'user' ? '👤' : '✨';

    const content = document.createElement('div');
    content.className = 'bubble-content';

    let messageText = '';
    let imageSrc = null;

    if (typeof text === 'string') {
      messageText = text;
    } else if (text && typeof text === 'object') {
      messageText = text.text || text.reply || text.message || '';
      if (!messageText && !text.screenshotBase64 && !text.imageUrl && !text.attachments) {
        messageText = JSON.stringify(text);
      }
      if (text.screenshotBase64) {
        imageSrc = text.screenshotBase64.startsWith('data:') ? text.screenshotBase64 : `data:image/png;base64,${text.screenshotBase64}`;
      } else if (text.imageUrl) {
        imageSrc = text.imageUrl;
      } else if (Array.isArray(text.attachments) && text.attachments.length > 0) {
        const att = text.attachments[0];
        if (typeof att === 'string' && (att.endsWith('.png') || att.endsWith('.jpg') || att.endsWith('.jpeg'))) {
          imageSrc = `${this.hostServer || ''}/api/screenshot/latest?t=${Date.now()}`;
        }
      }
    } else {
      messageText = String(text || '');
    }

    content.innerHTML = (messageText || '').replace(/\n/g, '<br>');

    if (imageSrc) {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'bubble-img-container';
      imgContainer.style.marginTop = '10px';
      imgContainer.style.cursor = 'pointer';

      const img = document.createElement('img');
      img.src = imageSrc;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '320px';
      img.style.borderRadius = '12px';
      img.style.display = 'block';
      img.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
      img.style.border = '1px solid rgba(255,255,255,0.12)';
      img.title = 'Bấm để phóng to';

      img.addEventListener('click', () => {
        if (this.imageLightbox && this.lightboxImg) {
          this.lightboxImg.src = imageSrc;
          this.imageLightbox.style.display = 'flex';
        }
      });

      imgContainer.appendChild(img);
      content.appendChild(imgContainer);
    }

    bubble.appendChild(avatar);
    bubble.appendChild(content);
    this.chatMessages.appendChild(bubble);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  async startVoiceRecording() {
    this.isListening = true;
    if (this.micBtn) this.micBtn.classList.add('listening');
    this.log('[Voice] 🎤 Đang lắng nghe giọng nói...', 'info');

    // 1. Try Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.log(`[Voice STT] Nhận diện: "${transcript}"`, 'success');
        if (this.textInput) {
          this.textInput.value = transcript;
          this.sendBtn?.click();
        }
      };

      recognition.onerror = () => {
        this.fallbackAudioRecord();
      };

      recognition.onend = () => {
        this.stopVoiceRecording();
      };

      try {
        recognition.start();
        this.speechRecognizer = recognition;
        return;
      } catch (_) {}
    }

    this.fallbackAudioRecord();
  }

  async fallbackAudioRecord() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result.split(',')[1];
          try {
            const res = await this.apiCall('/api/voice-audio', {
              method: 'POST',
              body: JSON.stringify({ audio: base64Audio, mimeType: 'audio/webm' })
            });
            if (res && res.reply) {
              this.appendMessage('user', res.query || 'Ghi âm');
              this.appendMessage('bot', res.reply);
              if (this.ttsEnabled) this.speakTTS(res.reply);
            }
          } catch (_) {}
        };
      };

      this.mediaRecorder.start();
    } catch (err) {
      this.log(`[Voice Error] Không thể truy cập Micro: ${err.message}`, 'error');
      this.stopVoiceRecording();
    }
  }

  stopVoiceRecording() {
    this.isListening = false;
    if (this.micBtn) this.micBtn.classList.remove('listening');
    if (this.speechRecognizer) {
      try { this.speechRecognizer.stop(); } catch (_) {}
      this.speechRecognizer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (_) {}
    }
  }

  // ==========================================================================
  // ALWAYS-LISTENING WAKE WORD CONTROLLER ("Diana ơi" - SIRI MODE)
  // ==========================================================================
  initWakeWordAssistant() {
    const updateUIState = (active) => {
      if (this.chkWakeWordListener) this.chkWakeWordListener.checked = active;
      if (this.btnToggleWakeHeader) {
        this.btnToggleWakeHeader.textContent = active ? 'Đang Bật' : 'Đã Tắt';
        this.btnToggleWakeHeader.style.color = active ? '#4ade80' : '#94a3b8';
      }
      if (this.wakeStatusDot) {
        this.wakeStatusDot.style.background = active ? '#22c55e' : '#64748b';
        this.wakeStatusDot.style.boxShadow = active ? '0 0 8px #22c55e' : 'none';
      }
    };

    // Lắng nghe sự kiện Wake Word từ tiến trình nền
    if (this.isDesktop && window.dianaDesktop?.onWakeEvent) {
      window.dianaDesktop.onWakeEvent((data) => {
        if (!data) return;
        this.log(`[Wake Word] Sự kiện: ${data.event} | ${data.query || ''}`, 'info');

        // Khi phát hiện "Diana ơi", kích hoạt hiệu ứng thú cưng Diana
        if (data.event === 'wake_with_cmd' || data.event === 'listening_for_command') {
          if (typeof this.pulseMascotWake === 'function') {
            this.pulseMascotWake('Dạ em nghe anh Tiến nè! ✨🌸');
          }
        }

        // Khi hoàn thành câu lệnh, hiển thị lịch sử hội thoại lên Chat UI
        if (data.event === 'completed' && data.query && data.reply) {
          const welcomeCard = document.getElementById('welcomeCard');
          if (welcomeCard) welcomeCard.style.display = 'none';

          this.appendMessage('user', data.query);
          this.appendMessage('bot', data.reply);
          if (typeof this.pulseMascotWake === 'function') {
            this.pulseMascotWake(data.reply.slice(0, 40) + '...');
          }
        }
      });

      // Lấy trạng thái hiện tại
      window.dianaDesktop.getWakeListenerStatus?.().then((res) => {
        if (res && typeof res.active === 'boolean') {
          updateUIState(res.active);
        }
      });
    }

    const handleToggle = async () => {
      if (this.isDesktop && window.dianaDesktop?.toggleWakeListener) {
        const res = await window.dianaDesktop.toggleWakeListener();
        updateUIState(Boolean(res?.active));
        this.log(`[Wake Word] Đã chuyển trạng thái: ${res?.active ? 'BẬT' : 'TẮT'}`, 'info');
      } else {
        alert('Tính năng luôn lắng nghe "Diana ơi" chạy trực tiếp trên ứng dụng Diana Station PC!');
      }
    };

    this.chkWakeWordListener?.addEventListener('change', handleToggle);
    this.btnToggleWakeHeader?.addEventListener('click', handleToggle);
  }

  // ==========================================================================
  // BAMBU LAB A1 3D PRINTER STATION CONTROLLER & CAMERA ENGINE
  // ==========================================================================
  initBambuStation() {
    this.isBambuCamStreaming = false;
    this.bambuCamSnapshotTimer = null;
    this.activeTempTarget = 'nozzle';

    this.bambuCameraFeed = document.getElementById('bambuCameraFeed');
    this.bambuCamPlaceholder = document.getElementById('bambuCamPlaceholder');
    this.bambuCamStatusMsg = document.getElementById('bambuCamStatusMsg');
    this.btnBambuCamPlayToggle = document.getElementById('btnBambuCamPlayToggle');
    this.bambuCamLiveIndicator = document.getElementById('bambuCamLiveIndicator');
    this.btnCamFullscreen = document.getElementById('btnCamFullscreen');
    this.btnCamRefresh = document.getElementById('btnCamRefresh');
    this.btnCamLightToggle = document.getElementById('btnCamLightToggle');
    this.btnToggleBambuLight = document.getElementById('btnToggleBambuLight');
    this.btnScanLanBambu = document.getElementById('btnScanLanBambu');
    this.btnBambuPause = document.getElementById('btnBambuPause');
    this.btnBambuCancel = document.getElementById('btnBambuCancel');
    this.btnBambuPauseText = document.getElementById('btnBambuPauseText');

    this.bambuStatusPill = document.getElementById('bambuStatusPill');
    this.bambuStatusPillText = document.getElementById('bambuStatusPillText');
    this.bambuMetaIp = document.getElementById('bambuMetaIp');
    this.bambuMetaWifi = document.getElementById('bambuMetaWifi');
    this.bambuMetaSerial = document.getElementById('bambuMetaSerial');
    this.bambuTaskFileName = document.getElementById('bambuTaskFileName');
    this.bambuPercentText = document.getElementById('bambuPercentText');
    this.bambuLinearProgress = document.getElementById('bambuLinearProgress');
    this.bambuLayerText = document.getElementById('bambuLayerText');
    this.bambuRemainingTimeText = document.getElementById('bambuRemainingTimeText');
    this.bambuEtaText = document.getElementById('bambuEtaText');
    this.bambuStateBadge = document.getElementById('bambuStateBadge');
    this.bambuNozzleCur = document.getElementById('bambuNozzleCur');
    this.bambuNozzleTarget = document.getElementById('bambuNozzleTarget');
    this.bambuBedCur = document.getElementById('bambuBedCur');
    this.bambuBedTarget = document.getElementById('bambuBedTarget');

    this.bambuSpoolType = document.getElementById('bambuSpoolType');
    this.bambuSpoolNameText = document.getElementById('bambuSpoolNameText');
    this.bambuSpoolTempRange = document.getElementById('bambuSpoolTempRange');
    this.bambuSpoolPosition = document.getElementById('bambuSpoolPosition');
    this.bambuSpoolTag = document.getElementById('bambuSpoolTag');
    this.bambuSpoolRing = document.getElementById('bambuSpoolRing');

    // Nạp cấu hình đã lưu
    const fetchConfig = async () => {
      try {
        let cfg = this.bambuConfig;
        if (this.isDesktop && window.dianaDesktop?.bambuGetConfig) {
          cfg = await window.dianaDesktop.bambuGetConfig();
        } else {
          const res = await this.apiCall('/api/bambu/config');
          if (res && res.config) cfg = res.config;
        }
        if (cfg) {
          this.bambuConfig = cfg;
          if (this.bambuMetaIp) this.bambuMetaIp.textContent = `🌐 IP: ${cfg.ip || '192.168.0.100'}`;
          if (this.bambuMetaSerial) this.bambuMetaSerial.textContent = `SN: ${cfg.serialNumber || '0300DA642803699'}`;
        }
      } catch (_) {}
    };

    fetchConfig();

    // 0. Mở & Đóng Cài Đặt Kết Nối Máy In (Settings Modal)
    this.btnBambuOpenModal = document.getElementById('btnBambuOpenModal');
    this.bambuSettingsModal = document.getElementById('bambuSettingsModal');
    this.modalBambuIp = document.getElementById('modalBambuIp');
    this.modalBambuAccessCode = document.getElementById('modalBambuAccessCode');
    this.modalBambuSerial = document.getElementById('modalBambuSerial');
    this.modalBambuSimulation = document.getElementById('modalBambuSimulation');
    this.btnCloseBambuModal = document.getElementById('btnCloseBambuModal');
    this.btnModalCancelBambu = document.getElementById('btnModalCancelBambu');
    this.btnModalSaveConnectBambu = document.getElementById('btnModalSaveConnectBambu');
    this.btnModalDisconnectBambu = document.getElementById('btnModalDisconnectBambu');

    const openSettingsModal = () => {
      if (this.bambuSettingsModal) {
        if (this.modalBambuIp && this.bambuConfig?.ip) this.modalBambuIp.value = this.bambuConfig.ip;
        if (this.modalBambuAccessCode && this.bambuConfig?.accessCode) this.modalBambuAccessCode.value = this.bambuConfig.accessCode;
        if (this.modalBambuSerial && this.bambuConfig?.serialNumber) this.modalBambuSerial.value = this.bambuConfig.serialNumber;
        if (this.modalBambuSimulation) this.modalBambuSimulation.checked = Boolean(this.bambuConfig?.simulation);
        this.bambuSettingsModal.style.display = 'flex';
      }
    };
    const closeSettingsModal = () => {
      if (this.bambuSettingsModal) this.bambuSettingsModal.style.display = 'none';
    };

    this.btnBambuOpenModal?.addEventListener('click', openSettingsModal);
    this.btnCloseBambuModal?.addEventListener('click', closeSettingsModal);
    this.btnModalCancelBambu?.addEventListener('click', closeSettingsModal);

    // Lưu & Kết Nối Ngay
    this.btnModalSaveConnectBambu?.addEventListener('click', async () => {
      const ip = this.modalBambuIp?.value?.trim() || '';
      const accessCode = this.modalBambuAccessCode?.value?.trim() || '';
      const serialNumber = this.modalBambuSerial?.value?.trim() || '';
      const simulation = Boolean(this.modalBambuSimulation?.checked);

      if (!ip && !simulation) {
        this.showToast('⚠️ Vui lòng nhập địa chỉ IP máy in', 'warn');
        return;
      }

      this.showToast('🔄 Đang lưu và kết nối máy in...', 'info');
      const newCfg = { ...this.bambuConfig, ip, accessCode, serialNumber, simulation };

      try {
        if (this.isDesktop && window.dianaDesktop?.bambuSaveConfig) {
          await window.dianaDesktop.bambuSaveConfig(newCfg);
          await window.dianaDesktop.bambuConnect({ ip, accessCode, serialNumber, simulation });
        } else {
          await this.apiCall('/api/bambu/config', {
            method: 'POST',
            body: JSON.stringify(newCfg)
          });
          await this.apiCall('/api/bambu/connect', {
            method: 'POST',
            body: JSON.stringify({ ip, accessCode, serialNumber, simulation })
          });
        }
        this.bambuConfig = newCfg;
        if (this.bambuMetaIp) this.bambuMetaIp.textContent = `🌐 IP: ${ip || 'Giả Lập'}`;
        if (this.bambuMetaSerial) this.bambuMetaSerial.textContent = `SN: ${serialNumber || '0300DA642803699'}`;
        this.showToast('🟢 Đã lưu cấu hình & kết nối máy in!', 'success');
        closeSettingsModal();
        await this.pollBambuOnce?.();
      } catch (err) {
        this.showToast(`❌ Lỗi kết nối: ${err.message}`, 'error');
      }
    });

    // Ngắt kết nối
    this.btnModalDisconnectBambu?.addEventListener('click', async () => {
      try {
        if (this.isDesktop && window.dianaDesktop?.bambuDisconnect) {
          await window.dianaDesktop.bambuDisconnect();
        } else {
          await this.apiCall('/api/bambu/disconnect', { method: 'POST' });
        }
        this.showToast('🔌 Đã ngắt kết nối máy in', 'info');
        closeSettingsModal();
      } catch (err) {
        this.showToast(`❌ Lỗi: ${err.message}`, 'error');
      }
    });

    // 1. Dò tìm lại IP máy in (Auto-Discover LAN)
    this.btnScanLanBambu?.addEventListener('click', async () => {
      if (!this.btnScanLanBambu) return;
      const btnSpan = this.btnScanLanBambu.querySelector('span');
      if (btnSpan) btnSpan.textContent = 'Đang Dò...';
      this.btnScanLanBambu.disabled = true;
      this.showToast('🔍 Đang quét toàn bộ dải mạng LAN để tìm IP máy in Bambu Lab...', 'info');
      this.log('[Bambu] 🔍 Đang quét toàn bộ dải mạng LAN để tìm IP máy in Bambu Lab...', 'info');

      try {
        let scanResult = await this.bambuExec('discover');
        if (!scanResult || !scanResult.success) {
          scanResult = await this.apiCall('/api/bambu/action', {
            method: 'POST',
            body: JSON.stringify({ action: 'discover' })
          });
        }

        if (scanResult && (scanResult.success || (scanResult.foundPrinters && scanResult.foundPrinters.length > 0))) {
          const foundIp = scanResult.ip || (scanResult.foundPrinters ? scanResult.foundPrinters[0]?.ip : '192.168.0.100');
          this.log(`[Bambu] 🟢 Đã tìm thấy máy in tại IP ${foundIp}! Đang kết nối...`, 'success');
          this.showToast(`🟢 Đã kết nối máy in tại IP ${foundIp}`, 'success');
          if (this.bambuMetaIp) this.bambuMetaIp.textContent = `🌐 IP: ${foundIp}`;
          await this.pollBambuOnce?.();
          this.startBambuCameraStream();
        } else {
          this.log('[Bambu] ⚠️ Đã quét xong mạng LAN.', 'warn');
          this.showToast('⚠️ Đã quét xong, giữ nguyên IP hiện tại', 'warn');
        }
      } catch (err) {
        this.log(`[Bambu Scan Error] ${err.message}`, 'error');
        this.showToast(`❌ Lỗi quét IP: ${err.message}`, 'error');
      } finally {
        if (btnSpan) btnSpan.textContent = 'Dò Tìm IP';
        this.btnScanLanBambu.disabled = false;
      }
    });

    // 2. Chamber LED Light Toggle (Optimistic Instant Response)
    const toggleLight = async () => {
      const isCurrentlyOn = this.bambuStatus ? Boolean(this.bambuStatus.light_state) : false;
      const nextState = !isCurrentlyOn;

      // Phản hồi giao diện tức thì (Optimistic UI)
      if (this.btnToggleBambuLight) this.btnToggleBambuLight.classList.toggle('active', nextState);
      if (this.btnCamLightToggle) this.btnCamLightToggle.classList.toggle('active', nextState);
      if (this.bambuStatus) this.bambuStatus.light_state = nextState;

      this.showToast(nextState ? '💡 Đã BẬT đèn buồng in' : '💡 Đã TẮT đèn buồng in', 'info');
      this.log(`[Bambu Light] Đổi trạng thái đèn ➜ ${nextState ? 'BẬT' : 'TẮT'}`, 'info');

      const res = await this.bambuExec('set_light', { state: nextState });
      if (res && res.success) {
        this.showToast(nextState ? '💡 Đèn buồng in: ĐANG BẬT' : '💡 Đèn buồng in: ĐÃ TẮT', 'success');
      }
    };

    this.btnToggleBambuLight?.addEventListener('click', toggleLight);
    this.btnCamLightToggle?.addEventListener('click', toggleLight);

    // 3. Print Job Controls (Pause / Resume / Cancel)
    this.btnBambuPause?.addEventListener('click', async () => {
      const isPaused = this.bambuStatus?.gcode_state === 'PAUSE';
      if (isPaused) {
        // Optimistic UI for Resume
        if (this.bambuStatus) this.bambuStatus.gcode_state = 'RUNNING';
        if (this.btnBambuPauseText) this.btnBambuPauseText.textContent = 'Tạm Dừng In';
        if (this.bambuStateBadge) this.bambuStateBadge.textContent = 'Printing';
        if (this.bambuStatusPill && this.bambuStatusPillText) {
          this.bambuStatusPill.className = 'bambu-status-pill printing';
          this.bambuStatusPillText.textContent = 'Đang In';
        }
        this.showToast('▶️ Đang tiếp tục in...', 'info');
        this.log('[Bambu] ▶️ Gửi lệnh Tiếp tục in (Resume)...', 'info');
        await this.bambuExec('resume');
      } else {
        // Optimistic UI for Pause
        if (this.bambuStatus) this.bambuStatus.gcode_state = 'PAUSE';
        if (this.btnBambuPauseText) this.btnBambuPauseText.textContent = 'Tiếp Tục In';
        if (this.bambuStateBadge) this.bambuStateBadge.textContent = 'Paused';
        if (this.bambuStatusPill && this.bambuStatusPillText) {
          this.bambuStatusPill.className = 'bambu-status-pill paused';
          this.bambuStatusPillText.textContent = 'Tạm Dừng';
        }
        this.showToast('⏸️ Đã gửi lệnh tạm dừng in', 'warn');
        this.log('[Bambu] ⏸️ Gửi lệnh Tạm dừng in (Pause)...', 'info');
        await this.bambuExec('pause');
      }
    });

    this.btnBambuCancel?.addEventListener('click', async () => {
      if (confirm('Bạn có chắc chắn muốn DỪNG & HỦY bản in hiện tại không?')) {
        if (this.bambuStatus) this.bambuStatus.gcode_state = 'IDLE';
        if (this.bambuStateBadge) this.bambuStateBadge.textContent = 'Stopping...';
        this.showToast('⏹️ Đã gửi lệnh hủy bản in', 'warn');
        this.log('[Bambu] ⏹️ Gửi lệnh Hủy bản in (Stop)...', 'warn');
        await this.bambuExec('stop');
      }
    });

    // =========================================================================
    // 3.1 3D VIRTUAL BUILD PLATE & SKIP OBJECT ENGINE (BAMBU HANDY STYLE)
    // =========================================================================
    this.bambuSkipModal = document.getElementById('bambuSkipModal');
    this.btnBambuSkipPart = document.getElementById('btnBambuSkipPart');
    this.btnCloseSkipModal = document.getElementById('btnCloseSkipModal');
    this.btnCancelSkipModal = document.getElementById('btnCancelSkipModal');
    this.btnConfirmSkipPart = document.getElementById('btnConfirmSkipPart');
    this.btnConfirmSkipText = document.getElementById('btnConfirmSkipText');

    this.bambuPlateSelect = document.getElementById('bambuPlateSelect');
    this.btnPlateView3D = document.getElementById('btnPlateView3D');
    this.btnPlateView2D = document.getElementById('btnPlateView2D');
    this.btnPlateViewSlicer = document.getElementById('btnPlateViewSlicer');
    this.btnPlateResetView = document.getElementById('btnPlateResetView');
    this.btnPlateSyncFtps = document.getElementById('btnPlateSyncFtps');
    this.btnPlateUpload3mf = document.getElementById('btnPlateUpload3mf');
    this.fileInput3mf = document.getElementById('fileInput3mf');

    this.bambuPlateLayerBadge = document.getElementById('bambuPlateLayerBadge');
    this.bambuPlateModelText = document.getElementById('bambuPlateModelText');

    this.bambu3DPlateCanvas = document.getElementById('bambu3DPlateCanvas');
    this.bambu3DPlateContainer = document.getElementById('bambu3DPlateContainer');
    this.bambu3DTooltip = document.getElementById('bambu3DTooltip');
    this.tooltipPartTitle = document.getElementById('tooltipPartTitle');
    this.tooltipPartStatus = document.getElementById('tooltipPartStatus');

    this.inspectorPartTitle = document.getElementById('inspectorPartTitle');
    this.inspectorPartBadge = document.getElementById('inspectorPartBadge');
    this.inspectorPartCoords = document.getElementById('inspectorPartCoords');
    this.inspectorPartDims = document.getElementById('inspectorPartDims');
    this.inspectorPartShape = document.getElementById('inspectorPartShape');
    this.inspectorPartLayerState = document.getElementById('inspectorPartLayerState');
    this.btnInspectorToggleSkip = document.getElementById('btnInspectorToggleSkip');
    this.inspectorIcon = document.getElementById('inspectorIcon');

    this.bambuPlatePartsGrid = document.getElementById('bambuPlatePartsGrid');
    this.bambuTotalPartsCount = document.getElementById('bambuTotalPartsCount');
    this.txtCustomSkipId = document.getElementById('txtCustomSkipId');
    this.btnAddCustomSkipId = document.getElementById('btnAddCustomSkipId');
    this.bambuSelectedChipsContainer = document.getElementById('bambuSelectedChipsContainer');

    this.selectedSkipIds = new Set();
    this.inspectedPart = null;
    this.hoveredPart = null;
    this.plateViewMode = '3d'; // '3d' or '2d'
    this.plateInfo = null;
    this.plateParts = [];
    this.plateBedSize = [180, 180];

    // Interactive 3D Orbit Camera State (Matched to Bambu Studio Perspective)
    this.camera3D = {
      yaw: 35,        // Azimuth angle around Z-axis (35 deg matches Bambu Studio)
      pitch: 46,      // Elevation angle (46 deg isometric tilt)
      zoom: 1.25,     // Zoom scale filling viewport
      panX: 0,        // Screen pan offset X
      panY: 10        // Screen pan offset Y
    };
    this.isDraggingPlate = false;
    this.hasDraggedPlate = false;
    this.dragStartPos = { x: 0, y: 0 };
    this.dragButton = 0; // 0 = Left (Orbit), 2 = Right (Pan)

    // Helper to format plate description
    const updateBedModelText = () => {
      if (!this.bambuPlateModelText) return;
      const w = this.plateBedSize[0] || 180;
      const d = this.plateBedSize[1] || 180;
      const bedName = this.plateInfo?.bedType === 'textured_plate' ? 'Bambu Textured PEI Plate' : 'Bambu Textured PEI Plate';
      this.bambuPlateModelText.textContent = `${bedName} (${w}x${d}mm)`;
    };

    // Default 2-item layout matching the actual print plate in Bambu Studio (Bracket #213 + Screw #215)
    const applyDefaultParts = () => {
      this.plateBedSize = [180, 180];

      this.plateParts = [
        { id: 213, name: 'Khung gá chữ L (Bracket #213)', x: 86, y: 80.8, width: 22.6, depth: 36.9, height: 38, shape: 'bracket', area: 153.4, bbox: [74.7, 62.3, 97.3, 99.2] },
        { id: 215, name: 'Ốc vặn xoắn (Screw #215)', x: 66.5, y: 115.5, width: 20.6, depth: 20.6, height: 32, shape: 'bolt', area: 304.1, bbox: [56.2, 105.2, 76.8, 125.8] }
      ];

      // Merge any already skipped IDs from printer telemetry
      const alreadySkipped = Array.isArray(this.bambuStatus?.s_obj) ? this.bambuStatus.s_obj : [];
      alreadySkipped.forEach((id, idx) => {
        if (!this.plateParts.some(p => p.id === id)) {
          this.plateParts.push({
            id,
            name: `Chi tiết #${id}`,
            x: 135,
            y: 45 + idx * 40,
            width: 24,
            depth: 24,
            height: 25,
            shape: 'box'
          });
        }
      });

      updateBedModelText();
      renderPlatePartsGrid();
      renderSelectedChips();
      if (this.plateParts.length > 0) updateInspectorUI(this.plateParts[0]);
      drawPlateCanvas();
    };

    // Apply parsed plate data from 3MF
    const applyPlateInfo = (info) => {
      if (!info) return applyDefaultParts();
      this.plateInfo = info;
      this.plateBedSize = info.bedSize || (info.plates?.[0]?.bedSize) || [180, 180];

      if (this.bambuPlateSelect && Array.isArray(info.plates) && info.plates.length > 0) {
        this.bambuPlateSelect.innerHTML = info.plates.map(p => `
          <option value="${p.plateIndex}" ${p.plateIndex === info.activePlateIndex ? 'selected' : ''}>
            ${p.name || `Bàn In ${p.plateIndex}`} (${p.objects?.length || 0} mẫu)
          </option>
        `).join('');
        this.bambuPlateSelect.style.display = info.plates.length > 1 ? 'inline-block' : 'none';
      }

      const activePlate = (info.plates && info.plates.find(p => p.plateIndex === (info.activePlateIndex || 1))) || info.plates?.[0];
      const rawObjs = activePlate?.objects || info.objects || [];

      if (rawObjs.length > 0) {
        this.plateParts = rawObjs.map(obj => {
          const name = obj.name || `Chi tiết #${obj.id}`;
          const lower = name.toLowerCase();
          let shape = obj.shape || 'box';
          if (shape === 'box') {
            if (lower.includes('screw') || lower.includes('bolt') || lower.includes('oc') || lower.includes('vit')) {
              shape = 'bolt';
            } else if (lower.includes('bracket') || lower.includes('mount') || lower.includes('l-') || lower.includes('khung')) {
              shape = 'bracket';
            } else if (lower.includes('cyl') || lower.includes('gear') || lower.includes('tru')) {
              shape = 'cylinder';
            }
          }

          return {
            id: obj.id,
            name,
            x: obj.x || 90,
            y: obj.y || 90,
            width: Math.max(8, obj.width || 24),
            depth: Math.max(8, obj.depth || 24),
            height: Math.max(12, obj.height || 30),
            shape,
            area: obj.area || (obj.width * obj.depth),
            bbox: obj.bbox
          };
        });
      } else {
        applyDefaultParts();
      }

      updateBedModelText();
      renderPlatePartsGrid();
      renderSelectedChips();
      if (this.plateParts.length > 0) updateInspectorUI(this.plateParts[0]);
      drawPlateCanvas();
    };

    // Cached 3MF Slicer Renders from Bambu Studio
    let topViewImg = null;
    let thumbnailImg = null;

    const loadPlateImages = () => {
      if (this.plateInfo?.topView) {
        topViewImg = new Image();
        topViewImg.onload = () => drawPlateCanvas();
        topViewImg.src = this.plateInfo.topView;
      }
      if (this.plateInfo?.thumbnail) {
        thumbnailImg = new Image();
        thumbnailImg.onload = () => drawPlateCanvas();
        thumbnailImg.src = this.plateInfo.thumbnail;
      }
    };

    // Load plate info from backend or FTPS
    const loadPlateData = async (forceFetch = false) => {
      try {
        let res = null;
        if (forceFetch) {
          this.showToast('📥 Đang tải file 3MF từ máy in qua FTPS...', 'info');
          res = await this.bambuExec('fetch_plate', { force: true });
        } else {
          res = await this.bambuExec('get_plate_info');
        }

        if (res && res.plate_info) {
          applyPlateInfo(res.plate_info);
          loadPlateImages();
          if (forceFetch) this.showToast('✅ Đã cập nhật chi tiết bàn in 3D từ máy in!', 'success');
        } else if (this.bambuStatus?.plate_info) {
          applyPlateInfo(this.bambuStatus.plate_info);
          loadPlateImages();
        } else {
          applyDefaultParts();
          loadPlateImages();
        }
      } catch (err) {
        console.error('Error loading plate data:', err);
        applyDefaultParts();
        loadPlateImages();
      }
    };

    // -------------------------------------------------------------------------
    // True 3D Mathematical Projection Engine (Right-Side Up Coordinate System)
    // -------------------------------------------------------------------------
    const projectPoint3D = (x, y, z, width, height) => {
      const is2D = this.plateViewMode === '2d';
      const yawDeg = is2D ? 0 : this.camera3D.yaw;
      const pitchDeg = is2D ? 90 : this.camera3D.pitch;

      const yawRad = (yawDeg * Math.PI) / 180;
      const pitchRad = (pitchDeg * Math.PI) / 180;

      const bedW = this.plateBedSize[0] || 180;
      const bedD = this.plateBedSize[1] || 180;

      // Bed-centered coordinates:
      // dx: Left-to-Right (-bedW/2 .. +bedW/2)
      // dy: Front-to-Back (-bedD/2 .. +bedD/2)
      // dz: Height above bed (0 .. maxZ)
      const dx = x - bedW / 2;
      const dy = y - bedD / 2;
      const dz = z;

      // Rotate Yaw around Z axis (smooth 360 azimuth)
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const x1 = dx * cosY + dy * sinY;
      const y1 = -dx * sinY + dy * cosY;
      const z1 = dz;

      // Rotate Pitch (elevation angle from 15 horizon to 90 top-down)
      const cosP = Math.cos(pitchRad);
      const sinP = Math.sin(pitchRad);
      const xProj = x1;
      const yProj = y1 * sinP + z1 * cosP;
      const depth = y1 * cosP - z1 * sinP;

      // Perspective scale factor
      const baseScale = (Math.min(width, height) / (bedW * 1.5)) * (is2D ? 1.05 : this.camera3D.zoom);
      const screenX = width / 2 + (is2D ? 0 : this.camera3D.panX) + xProj * baseScale;
      const screenY = height / 2 + (is2D ? 0 : this.camera3D.panY) - yProj * baseScale;

      return { x: screenX, y: screenY, depth, rawZ: z };
    };

    // -------------------------------------------------------------------------
    // Main 3D Canvas Drawing Engine (Bambu Studio Photorealistic Quality)
    // -------------------------------------------------------------------------
    const drawPlateCanvas = () => {
      if (!this.bambu3DPlateCanvas) return;
      const canvas = this.bambu3DPlateCanvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width || 620;
      const h = rect.height || 460;

      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // Deep Studio Vignette Background
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, Math.max(w, h) * 0.75);
      bgGrad.addColorStop(0, '#161922');
      bgGrad.addColorStop(0.6, '#0d0f15');
      bgGrad.addColorStop(1, '#07080c');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const bedW = this.plateBedSize[0] || 180;
      const bedD = this.plateBedSize[1] || 180;
      const alreadySkipped = Array.isArray(this.bambuStatus?.s_obj) ? this.bambuStatus.s_obj : [];

      // -----------------------------------------------------------------------
      // MODE 1: PHOTOREALISTIC SLICER 3D RENDER (Metadata/plate_1.png)
      // -----------------------------------------------------------------------
      if (this.plateViewMode === 'slicer') {
        if (thumbnailImg && thumbnailImg.complete && thumbnailImg.naturalWidth > 0) {
          const imgRatio = thumbnailImg.naturalWidth / thumbnailImg.naturalHeight;
          let dw = w * 0.88;
          let dh = dw / imgRatio;
          if (dh > h * 0.85) {
            dh = h * 0.85;
            dw = dh * imgRatio;
          }
          const dx = (w - dw) / 2;
          const dy = (h - dh) / 2;

          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
          ctx.shadowBlur = 28;
          ctx.drawImage(thumbnailImg, dx, dy, dw, dh);
          ctx.restore();

          // Overlay interactive badges
          this.plateParts.forEach(part => {
            const isSkipped = alreadySkipped.includes(part.id);
            const isSelected = this.selectedSkipIds.has(part.id);
            const isHovered = this.hoveredPart && this.hoveredPart.id === part.id;

            const normX = part.x / bedW;
            const normY = 1 - (part.y / bedD);
            const px = dx + normX * dw;
            const py = dy + normY * dh;

            part.centerScreen = { x: px, y: py };
            part.screenPoly = [
              { x: px - 38, y: py - 20 },
              { x: px + 38, y: py - 20 },
              { x: px + 38, y: py + 20 },
              { x: px - 38, y: py + 20 }
            ];

            ctx.save();
            ctx.font = 'bold 12px system-ui, sans-serif';
            const labelText = isSkipped ? `🚫 #${part.id} (ĐÃ BỎ)` : (isSelected ? `✂️ #${part.id} (SẼ BỎ)` : `✓ #${part.id} (${part.name.split(' ')[0]})`);
            const txtW = ctx.measureText(labelText).width;

            ctx.fillStyle = isSkipped ? 'rgba(239, 68, 68, 0.95)' : (isSelected ? 'rgba(249, 115, 22, 0.95)' : (isHovered ? 'rgba(56, 189, 248, 0.95)' : 'rgba(16, 185, 129, 0.92)'));
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            const rx = px - txtW / 2 - 8;
            const ry = py - 12;
            const rw = txtW + 16;
            const rh = 24;
            ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, 6) : ctx.rect(rx, ry, rw, rh);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, px, py);
            ctx.restore();
          });

          ctx.restore();
          return;
        }
      }

      // -----------------------------------------------------------------------
      // MODE 2: 2D ORTHOGRAPHIC TOP-DOWN SLICER VIEW (Metadata/top_1.png)
      // -----------------------------------------------------------------------
      if (this.plateViewMode === '2d' && topViewImg && topViewImg.complete && topViewImg.naturalWidth > 0) {
        const ptTL = projectPoint3D(0, bedD, 0, w, h);
        const ptBR = projectPoint3D(bedW, 0, 0, w, h);
        const dw = ptBR.x - ptTL.x;
        const dh = ptBR.y - ptTL.y;

        // Draw Textured PEI base plate in 2D
        ctx.save();
        ctx.fillStyle = '#22252e';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.fillRect(ptTL.x, ptTL.y, dw, dh);
        ctx.strokeRect(ptTL.x, ptTL.y, dw, dh);

        // 10mm grid lines
        for (let g = 10; g < bedW; g += 10) {
          const gx = ptTL.x + (g / bedW) * dw;
          const gy = ptTL.y + (g / bedD) * dh;
          ctx.strokeStyle = g % 50 === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gx, ptTL.y);
          ctx.lineTo(gx, ptTL.y + dh);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ptTL.x, gy);
          ctx.lineTo(ptTL.x + dw, gy);
          ctx.stroke();
        }

        // Draw exact high-res Bambu Studio slice render
        ctx.drawImage(topViewImg, ptTL.x, ptTL.y, dw, dh);
        ctx.restore();

        // Overlay interactive glowing boxes
        this.plateParts.forEach(part => {
          const isSkipped = alreadySkipped.includes(part.id);
          const isSelected = this.selectedSkipIds.has(part.id);
          const isHovered = this.hoveredPart && this.hoveredPart.id === part.id;
          const isInspected = this.inspectedPart && this.inspectedPart.id === part.id;

          const bbox = part.bbox || [part.x - part.width / 2, part.y - part.depth / 2, part.x + part.width / 2, part.y + part.depth / 2];
          const bTL = projectPoint3D(bbox[0], bbox[3], 0, w, h);
          const bBR = projectPoint3D(bbox[2], bbox[1], 0, w, h);
          const bw = bBR.x - bTL.x;
          const bh = bBR.y - bTL.y;

          part.screenPoly = [
            { x: bTL.x, y: bTL.y },
            { x: bBR.x, y: bTL.y },
            { x: bBR.x, y: bBR.y },
            { x: bTL.x, y: bBR.y }
          ];
          part.centerScreen = { x: bTL.x + bw / 2, y: bTL.y + bh / 2 };

          ctx.save();
          const strokeCol = isSkipped ? '#ef4444' : (isSelected ? '#f97316' : (isHovered || isInspected ? '#38bdf8' : '#10b981'));
          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = isHovered || isSelected ? 3 : 2;
          ctx.fillStyle = isSkipped ? 'rgba(239, 68, 68, 0.38)' : (isSelected ? 'rgba(249, 115, 22, 0.38)' : (isHovered ? 'rgba(56, 189, 248, 0.28)' : 'rgba(16, 185, 129, 0.18)'));
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(bTL.x, bTL.y, bw, bh, 6) : ctx.rect(bTL.x, bTL.y, bw, bh);
          ctx.fill();
          ctx.stroke();

          // Floating Badge
          ctx.font = 'bold 11px system-ui, sans-serif';
          const label = isSkipped ? `🚫 #${part.id} (ĐÃ BỎ)` : (isSelected ? `✂️ #${part.id} (SẼ BỎ)` : `#${part.id} ${part.name.split(' ')[0]}`);
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = isSkipped ? 'rgba(239, 68, 68, 0.95)' : (isSelected ? 'rgba(249, 115, 22, 0.95)' : 'rgba(15, 23, 42, 0.92)');
          ctx.beginPath();
          const bx = bTL.x + bw / 2 - tw / 2 - 7;
          const by = bTL.y - 14;
          ctx.roundRect ? ctx.roundRect(bx, by, tw + 14, 20, 5) : ctx.rect(bx, by, tw + 14, 20);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, bTL.x + bw / 2, by + 10);
          ctx.restore();
        });

        ctx.restore();
        return;
      }

      // -----------------------------------------------------------------------
      // MODE 3: FULL 3D PHOTOREALISTIC BAMBU STUDIO VIEW
      // -----------------------------------------------------------------------
      const p0 = projectPoint3D(0, 0, 0, w, h);              // Front-Left (0, 0)
      const p1 = projectPoint3D(bedW, 0, 0, w, h);           // Front-Right (180, 0)
      const p2 = projectPoint3D(bedW, bedD, 0, w, h);        // Back-Right (180, 180)
      const p3 = projectPoint3D(0, bedD, 0, w, h);           // Back-Left (0, 180)

      if (this.plateViewMode === '3d') {
        // Soft ambient floor shadow
        ctx.save();
        const s0 = projectPoint3D(-12, -12, -12, w, h);
        const s1 = projectPoint3D(bedW + 12, -12, -12, w, h);
        const s2 = projectPoint3D(bedW + 12, bedD + 12, -12, w, h);
        const s3 = projectPoint3D(-12, bedD + 12, -12, w, h);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y + 16);
        ctx.lineTo(s1.x, s1.y + 16);
        ctx.lineTo(s2.x, s2.y + 16);
        ctx.lineTo(s3.x, s3.y + 16);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.filter = 'blur(16px)';
        ctx.fill();
        ctx.restore();

        // 3D Extruded Steel Bed Edge (Thickness 4.5mm)
        const t0 = projectPoint3D(0, 0, -4.5, w, h);
        const t1 = projectPoint3D(bedW, 0, -4.5, w, h);
        const t2 = projectPoint3D(bedW, bedD, -4.5, w, h);
        const t3 = projectPoint3D(0, bedD, -4.5, w, h);

        const edgeFaces = [
          { pts: [p0, p1, t1, t0], col: '#222630' },
          { pts: [p1, p2, t2, t1], col: '#1a1d26' },
          { pts: [p2, p3, t3, t2], col: '#14161d' },
          { pts: [p3, p0, t0, t3], col: '#1d202a' }
        ];

        edgeFaces.forEach(f => {
          ctx.beginPath();
          ctx.moveTo(f.pts[0].x, f.pts[0].y);
          ctx.lineTo(f.pts[1].x, f.pts[1].y);
          ctx.lineTo(f.pts[2].x, f.pts[2].y);
          ctx.lineTo(f.pts[3].x, f.pts[3].y);
          ctx.closePath();
          ctx.fillStyle = f.col;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }

      // 2. Draw Authentic Bambu Textured PEI Surface
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();

      const peiGrad = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
      peiGrad.addColorStop(0, '#2d323f');
      peiGrad.addColorStop(0.5, '#222631');
      peiGrad.addColorStop(1, '#181b23');
      ctx.fillStyle = peiGrad;
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Authentic Bambu Plate Grid (10mm minor, 50mm major)
      ctx.save();
      for (let grid = 10; grid < bedW; grid += 10) {
        const isMajor = grid % 50 === 0;
        ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = isMajor ? 1.2 : 0.8;

        const gx1 = projectPoint3D(grid, 0, 0, w, h);
        const gx2 = projectPoint3D(grid, bedD, 0, w, h);
        ctx.beginPath();
        ctx.moveTo(gx1.x, gx1.y);
        ctx.lineTo(gx2.x, gx2.y);
        ctx.stroke();

        const gy1 = projectPoint3D(0, grid, 0, w, h);
        const gy2 = projectPoint3D(bedW, grid, 0, w, h);
        ctx.beginPath();
        ctx.moveTo(gy1.x, gy1.y);
        ctx.lineTo(gy2.x, gy2.y);
        ctx.stroke();
      }

      // Authentic Bambu Alignment Tab with Green "01" (Back-Right of Bed)
      const tabA = projectPoint3D(bedW - 12, bedD, 0, w, h);
      const tabB = projectPoint3D(bedW + 14, bedD, 0, w, h);
      const tabC = projectPoint3D(bedW + 14, bedD + 18, 0, w, h);
      const tabD = projectPoint3D(bedW - 12, bedD + 18, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(tabA.x, tabA.y);
      ctx.lineTo(tabB.x, tabB.y);
      ctx.lineTo(tabC.x, tabC.y);
      ctx.lineTo(tabD.x, tabD.y);
      ctx.closePath();
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const tabCenter = projectPoint3D(bedW + 1, bedD + 9, 0, w, h);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('01', tabCenter.x, tabCenter.y);

      // Bambu Lab Branding Watermark
      const logoPt = projectPoint3D(bedW / 2, 14, 0, w, h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`BAMBU LAB ${bedW === 180 ? 'A1 MINI' : 'BUILD PLATE'}`, logoPt.x, logoPt.y);

      // Coordinate Triad Axes (0,0,0)
      const axLen = 22;
      const oPt = projectPoint3D(0, 0, 0, w, h);
      const xPt = projectPoint3D(axLen, 0, 0, w, h);
      const yPt = projectPoint3D(0, axLen, 0, w, h);
      const zPt = projectPoint3D(0, 0, axLen, w, h);

      ctx.beginPath();
      ctx.moveTo(oPt.x, oPt.y);
      ctx.lineTo(xPt.x, xPt.y);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText('X', xPt.x + 4, xPt.y);

      ctx.beginPath();
      ctx.moveTo(oPt.x, oPt.y);
      ctx.lineTo(yPt.x, yPt.y);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = '#10b981';
      ctx.fillText('Y', yPt.x, yPt.y - 4);

      if (this.plateViewMode === '3d') {
        ctx.beginPath();
        ctx.moveTo(oPt.x, oPt.y);
        ctx.lineTo(zPt.x, zPt.y);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.fillStyle = '#3b82f6';
        ctx.fillText('Z', zPt.x - 6, zPt.y - 4);
      }
      ctx.restore();

      // 3. Sort Parts by Camera Depth (Back-to-Front Painter's Algorithm)
      const sortedParts = [...this.plateParts].sort((a, b) => {
        const pa = projectPoint3D(a.x, a.y, 0, w, h);
        const pb = projectPoint3D(b.x, b.y, 0, w, h);
        return pa.depth - pb.depth;
      });

      // -----------------------------------------------------------------------
      // 4. DRAW PHOTOREALISTIC BAMBU 3D PRINTED PARTS
      // -----------------------------------------------------------------------
      sortedParts.forEach(part => {
        const isSkipped = alreadySkipped.includes(part.id);
        const isSelected = this.selectedSkipIds.has(part.id);
        const isHovered = this.hoveredPart && this.hoveredPart.id === part.id;
        const isInspected = this.inspectedPart && this.inspectedPart.id === part.id;

        const curLayers = Number(this.bambuStatus?.layer_num) || 152;
        const totalLayers = Number(this.bambuStatus?.total_layer_num) || 300;
        const printRatio = Math.max(0.3, Math.min(1, curLayers / totalLayers));
        const realHeight = isSkipped ? part.height * 0.4 : part.height * printRatio;

        const hw = part.width / 2;
        const hd = part.depth / 2;

        // Base Drop Shadow beneath object
        ctx.save();
        const baseSh0 = projectPoint3D(part.x - hw * 1.15, part.y - hd * 1.15, 0, w, h);
        const baseSh1 = projectPoint3D(part.x + hw * 1.15, part.y - hd * 1.15, 0, w, h);
        const baseSh2 = projectPoint3D(part.x + hw * 1.15, part.y + hd * 1.15, 0, w, h);
        const baseSh3 = projectPoint3D(part.x - hw * 1.15, part.y + hd * 1.15, 0, w, h);
        ctx.beginPath();
        ctx.moveTo(baseSh0.x, baseSh0.y);
        ctx.lineTo(baseSh1.x, baseSh1.y);
        ctx.lineTo(baseSh2.x, baseSh2.y);
        ctx.lineTo(baseSh3.x, baseSh3.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.filter = 'blur(6px)';
        ctx.fill();
        ctx.restore();

        // Realistic Filament Palette (Bambu Matte Black with Directional Lighting)
        let filamentBase = '#1d2027';
        let filamentLit = '#383e4d';
        let filamentMid = '#272b36';
        let filamentShadow = '#101217';
        let filamentEdge = '#474e61';

        if (isSkipped) {
          filamentBase = '#451a1a';
          filamentLit = '#7f1d1d';
          filamentMid = '#5f1818';
          filamentShadow = '#2b0b0b';
          filamentEdge = '#ef4444';
        } else if (isSelected) {
          filamentBase = '#7c2d12';
          filamentLit = '#ea580c';
          filamentMid = '#9a3412';
          filamentShadow = '#431407';
          filamentEdge = '#f97316';
        } else if (isHovered || isInspected) {
          filamentBase = '#0c4a6e';
          filamentLit = '#0284c7';
          filamentMid = '#0369a1';
          filamentShadow = '#082f49';
          filamentEdge = '#38bdf8';
        }

        // =====================================================================
        // PART 1: BAMBU THUMBSCREW / M8-M10 BOLT (#215)
        // Authentic Scalloped / Fluted Knurled Knob + Threaded Shaft
        // =====================================================================
        if (part.shape === 'bolt' || part.id === 215) {
          const knobH = Math.min(realHeight, 6.5);
          const shaftH = realHeight;
          const rKnob = 11.2;
          const rShaft = 5.4;
          const lobes = 12;

          // 1. Draw 12-Lobed Scalloped Knurled Base Knob
          const knobBasePts = [];
          const knobTopPts = [];

          for (let i = 0; i < lobes * 2; i++) {
            const ang = (i * Math.PI) / lobes;
            const r = i % 2 === 0 ? rKnob : rKnob * 0.84; // Scalloped flutes
            const kx = part.x + Math.cos(ang) * r;
            const ky = part.y + Math.sin(ang) * r;
            knobBasePts.push(projectPoint3D(kx, ky, 0, w, h));
            knobTopPts.push(projectPoint3D(kx, ky, knobH, w, h));
          }

          if (this.plateViewMode === '3d') {
            for (let i = 0; i < knobTopPts.length; i++) {
              const j = (i + 1) % knobTopPts.length;
              ctx.beginPath();
              ctx.moveTo(knobTopPts[i].x, knobTopPts[i].y);
              ctx.lineTo(knobTopPts[j].x, knobTopPts[j].y);
              ctx.lineTo(knobBasePts[j].x, knobBasePts[j].y);
              ctx.lineTo(knobBasePts[i].x, knobBasePts[i].y);
              ctx.closePath();
              ctx.fillStyle = i % 2 === 0 ? filamentMid : filamentShadow;
              ctx.fill();
              ctx.strokeStyle = filamentEdge;
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }
          }

          // Top Face of Knurled Knob
          ctx.beginPath();
          knobTopPts.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.fillStyle = filamentLit;
          ctx.fill();
          ctx.strokeStyle = filamentEdge;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // 2. Threaded Cylindrical Shaft
          if (shaftH > knobH && this.plateViewMode === '3d') {
            const segs = 16;
            const shaftBasePts = [];
            const shaftTopPts = [];

            for (let s = 0; s < segs; s++) {
              const ang = (s * Math.PI * 2) / segs;
              const sx = part.x + Math.cos(ang) * rShaft;
              const sy = part.y + Math.sin(ang) * rShaft;
              shaftBasePts.push(projectPoint3D(sx, sy, knobH, w, h));
              shaftTopPts.push(projectPoint3D(sx, sy, shaftH, w, h));
            }

            // Draw Shaft Facets with Realistic Shading
            for (let s = 0; s < segs; s++) {
              const next = (s + 1) % segs;
              ctx.beginPath();
              ctx.moveTo(shaftTopPts[s].x, shaftTopPts[s].y);
              ctx.lineTo(shaftTopPts[next].x, shaftTopPts[next].y);
              ctx.lineTo(shaftBasePts[next].x, shaftBasePts[next].y);
              ctx.lineTo(shaftBasePts[s].x, shaftBasePts[s].y);
              ctx.closePath();

              const ang = (s * Math.PI * 2) / segs;
              const shade = Math.cos(ang - Math.PI / 4);
              ctx.fillStyle = shade > 0 ? filamentLit : filamentShadow;
              ctx.fill();
              ctx.strokeStyle = filamentEdge;
              ctx.lineWidth = 0.6;
              ctx.stroke();
            }

            // Draw Realistic Helical Threads on the Shaft
            const numThreads = Math.max(3, Math.floor((shaftH - knobH) / 2.5));
            ctx.save();
            for (let t = 1; t <= numThreads; t++) {
              const tz = knobH + ((shaftH - knobH) / (numThreads + 1)) * t;
              const threadPts = [];
              for (let s = 0; s <= segs / 2; s++) {
                const ang = (s * Math.PI * 2) / segs;
                const tx = part.x + Math.cos(ang) * (rShaft * 1.06);
                const ty = part.y + Math.sin(ang) * (rShaft * 1.06);
                threadPts.push(projectPoint3D(tx, ty, tz, w, h));
              }
              ctx.beginPath();
              threadPts.forEach((pt, idx) => {
                if (idx === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
              });
              ctx.strokeStyle = filamentLit;
              ctx.lineWidth = 1.4;
              ctx.stroke();
            }
            ctx.restore();

            // Top Chamfered Cap of Screw Shaft
            ctx.beginPath();
            shaftTopPts.forEach((pt, idx) => {
              if (idx === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.closePath();
            ctx.fillStyle = filamentLit;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }

          part.screenPoly = knobTopPts.concat(knobBasePts);
          part.centerScreen = projectPoint3D(part.x, part.y, realHeight / 2, w, h);
        }
        // =====================================================================
        // PART 2: BAMBU MONITOR BRACKET (#213)
        // Upright U-Clamp with Stiffener Gusset & Two Threaded Counterbored Holes
        // =====================================================================
        else if (part.shape === 'bracket' || part.id === 213) {
          const flangeH = Math.min(realHeight, 6);
          const uprightH = realHeight;
          const wallThick = 4.5;
          const lipLen = 14;

          // 1. Base Flange (Sitting on Bed)
          const b0 = projectPoint3D(part.x - hw, part.y - hd, 0, w, h);
          const b1 = projectPoint3D(part.x + hw, part.y - hd, 0, w, h);
          const b2 = projectPoint3D(part.x + hw, part.y + hd, 0, w, h);
          const b3 = projectPoint3D(part.x - hw, part.y + hd, 0, w, h);

          const f0 = projectPoint3D(part.x - hw, part.y - hd, flangeH, w, h);
          const f1 = projectPoint3D(part.x + hw, part.y - hd, flangeH, w, h);
          const f2 = projectPoint3D(part.x + hw, part.y + hd, flangeH, w, h);
          const f3 = projectPoint3D(part.x - hw, part.y + hd, flangeH, w, h);

          if (this.plateViewMode === '3d') {
            // Front & right sides of bottom flange
            ctx.beginPath();
            ctx.moveTo(f1.x, f1.y);
            ctx.lineTo(f2.x, f2.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.closePath();
            ctx.fillStyle = filamentMid;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(f0.x, f0.y);
            ctx.lineTo(f1.x, f1.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.lineTo(b0.x, b0.y);
            ctx.closePath();
            ctx.fillStyle = filamentLit;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.stroke();
          }

          // 2. Upright Vertical Spine Wall
          if (uprightH > flangeH && this.plateViewMode === '3d') {
            const u0 = projectPoint3D(part.x - hw, part.y + hd - wallThick, uprightH, w, h);
            const u1 = projectPoint3D(part.x + hw, part.y + hd - wallThick, uprightH, w, h);
            const u2 = projectPoint3D(part.x + hw, part.y + hd, uprightH, w, h);
            const u3 = projectPoint3D(part.x - hw, part.y + hd, uprightH, w, h);

            const ub0 = projectPoint3D(part.x - hw, part.y + hd - wallThick, flangeH, w, h);
            const ub1 = projectPoint3D(part.x + hw, part.y + hd - wallThick, flangeH, w, h);

            // Front Main Face of Vertical Spine
            ctx.beginPath();
            ctx.moveTo(u0.x, u0.y);
            ctx.lineTo(u1.x, u1.y);
            ctx.lineTo(ub1.x, ub1.y);
            ctx.lineTo(ub0.x, ub0.y);
            ctx.closePath();
            ctx.fillStyle = filamentBase;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Right Face of Upright
            ctx.beginPath();
            ctx.moveTo(u1.x, u1.y);
            ctx.lineTo(u2.x, u2.y);
            ctx.lineTo(f2.x, f2.y);
            ctx.lineTo(ub1.x, ub1.y);
            ctx.closePath();
            ctx.fillStyle = filamentShadow;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.stroke();

            // Top Cap of Upright
            ctx.beginPath();
            ctx.moveTo(u0.x, u0.y);
            ctx.lineTo(u1.x, u1.y);
            ctx.lineTo(u2.x, u2.y);
            ctx.lineTo(u3.x, u3.y);
            ctx.closePath();
            ctx.fillStyle = filamentLit;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.lineWidth = 1.4;
            ctx.stroke();

            // 3. Top Clamping Lip / Overhang
            const lip0 = projectPoint3D(part.x - hw, part.y + hd - wallThick - lipLen, uprightH, w, h);
            const lip1 = projectPoint3D(part.x + hw, part.y + hd - wallThick - lipLen, uprightH, w, h);
            const lipB0 = projectPoint3D(part.x - hw, part.y + hd - wallThick - lipLen, uprightH - 5, w, h);
            const lipB1 = projectPoint3D(part.x + hw, part.y + hd - wallThick - lipLen, uprightH - 5, w, h);

            ctx.beginPath();
            ctx.moveTo(lip0.x, lip0.y);
            ctx.lineTo(lip1.x, lip1.y);
            ctx.lineTo(u1.x, u1.y);
            ctx.lineTo(u0.x, u0.y);
            ctx.closePath();
            ctx.fillStyle = filamentLit;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.stroke();

            // 4. Side Stiffener Gusset Rib (Left spine edge)
            const ribTop = projectPoint3D(part.x - hw, part.y + hd - wallThick, uprightH * 0.75, w, h);
            const ribBot = projectPoint3D(part.x - hw, part.y - hd + 6, flangeH, w, h);
            const ribOut = projectPoint3D(part.x - hw - 3.5, part.y + hd - wallThick, flangeH + 4, w, h);
            ctx.beginPath();
            ctx.moveTo(ribTop.x, ribTop.y);
            ctx.lineTo(ribOut.x, ribOut.y);
            ctx.lineTo(ribBot.x, ribBot.y);
            ctx.closePath();
            ctx.fillStyle = filamentLit;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.stroke();

            // 5. TWO AUTHENTIC COUNTERBORED THREADED SCREW HOLES
            const holeZList = [uprightH * 0.3, uprightH * 0.75];
            holeZList.forEach(hz => {
              if (hz > flangeH && hz < uprightH) {
                const holeCenter = projectPoint3D(part.x, part.y + hd - wallThick, hz, w, h);

                // Outer Counterbore Boss Chamfer
                ctx.beginPath();
                ctx.arc(holeCenter.x, holeCenter.y, 7.5, 0, Math.PI * 2);
                ctx.fillStyle = filamentLit;
                ctx.fill();
                ctx.strokeStyle = filamentEdge;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                // Inner Through-Hole (Dark cavity with concentric thread ridges)
                ctx.beginPath();
                ctx.arc(holeCenter.x, holeCenter.y, 4.2, 0, Math.PI * 2);
                ctx.fillStyle = '#0a0c10';
                ctx.fill();
                ctx.strokeStyle = '#2d3342';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Concentric inner thread ring
                ctx.beginPath();
                ctx.arc(holeCenter.x, holeCenter.y, 2.5, 0, Math.PI * 2);
                ctx.strokeStyle = '#475569';
                ctx.lineWidth = 0.8;
                ctx.stroke();
              }
            });
          }

          part.screenPoly = [f0, f1, f2, f3, b2, b3];
          part.centerScreen = projectPoint3D(part.x, part.y, realHeight / 2, w, h);
        }
        // =====================================================================
        // PART 3: GENERIC 3D OBJECT (Beveled Sliced Geometry)
        // =====================================================================
        else {
          const t0 = projectPoint3D(part.x - hw, part.y - hd, realHeight, w, h);
          const t1 = projectPoint3D(part.x + hw, part.y - hd, realHeight, w, h);
          const t2 = projectPoint3D(part.x + hw, part.y + hd, realHeight, w, h);
          const t3 = projectPoint3D(part.x - hw, part.y + hd, realHeight, w, h);

          const c0 = projectPoint3D(part.x - hw, part.y - hd, 0, w, h);
          const c1 = projectPoint3D(part.x + hw, part.y - hd, 0, w, h);
          const c2 = projectPoint3D(part.x + hw, part.y + hd, 0, w, h);
          const c3 = projectPoint3D(part.x - hw, part.y + hd, 0, w, h);

          if (this.plateViewMode === '3d') {
            ctx.beginPath();
            ctx.moveTo(t1.x, t1.y);
            ctx.lineTo(t2.x, t2.y);
            ctx.lineTo(c2.x, c2.y);
            ctx.lineTo(c1.x, c1.y);
            ctx.closePath();
            ctx.fillStyle = filamentMid;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(t2.x, t2.y);
            ctx.lineTo(t3.x, t3.y);
            ctx.lineTo(c3.x, c3.y);
            ctx.lineTo(c2.x, c2.y);
            ctx.closePath();
            ctx.fillStyle = filamentShadow;
            ctx.fill();
            ctx.strokeStyle = filamentEdge;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.moveTo(t0.x, t0.y);
          ctx.lineTo(t1.x, t1.y);
          ctx.lineTo(t2.x, t2.y);
          ctx.lineTo(t3.x, t3.y);
          ctx.closePath();
          ctx.fillStyle = filamentLit;
          ctx.fill();
          ctx.strokeStyle = filamentEdge;
          ctx.lineWidth = 1.4;
          ctx.stroke();

          part.screenPoly = [t0, t1, t2, c2, c3, t3];
          part.centerScreen = projectPoint3D(part.x, part.y, realHeight / 2, w, h);
        }

        // Floating 3D ID Badge Pill
        const badgeZ = this.plateViewMode === '3d' ? realHeight + 14 : 0;
        const badgePt = projectPoint3D(part.x, part.y, badgeZ, w, h);

        ctx.save();
        ctx.font = 'bold 11px system-ui, sans-serif';
        const labelText = isSkipped ? `🚫 #${part.id} (ĐÃ BỎ)` : (isSelected ? `✂️ #${part.id} (SẼ BỎ)` : `#${part.id}`);
        const txtW = ctx.measureText(labelText).width;

        ctx.fillStyle = isSkipped ? 'rgba(239, 68, 68, 0.95)' : (isSelected ? 'rgba(249, 115, 22, 0.95)' : (isHovered ? 'rgba(2, 132, 199, 0.95)' : 'rgba(15, 23, 42, 0.88)'));
        ctx.strokeStyle = filamentEdge;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const rx = badgePt.x - txtW / 2 - 8;
        const ry = badgePt.y - 10;
        const rw = txtW + 16;
        const rh = 20;
        ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, 5) : ctx.rect(rx, ry, rw, rh);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, badgePt.x, badgePt.y);
        ctx.restore();
      });

      // 5. Virtual Nozzle Toolhead with glowing heat laser
      if (this.bambuStatus?.gcode_state === 'RUNNING' && sortedParts.length > 0) {
        const activePart = sortedParts.find(p => !alreadySkipped.includes(p.id)) || sortedParts[0];
        const nTime = Date.now() * 0.003;
        const nx = activePart.x + Math.sin(nTime) * 10;
        const ny = activePart.y + Math.cos(nTime) * 10;
        const nz = activePart.height * Math.min(1, (Number(this.bambuStatus?.layer_num) || 152) / 300);

        const nozPt = projectPoint3D(nx, ny, nz, w, h);
        const nozTop = projectPoint3D(nx, ny, nz + 18, w, h);

        ctx.save();
        ctx.beginPath();
        ctx.arc(nozPt.x, nozPt.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 14;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(nozPt.x, nozPt.y);
        ctx.lineTo(nozTop.x - 8, nozTop.y);
        ctx.lineTo(nozTop.x + 8, nozTop.y);
        ctx.closePath();
        ctx.fillStyle = '#cbd5e1';
        ctx.fill();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    };

    // -------------------------------------------------------------------------
    // 3D Raycasting / Hit-testing for Picking Objects
    // -------------------------------------------------------------------------
    const isPointInPolygon = (px, py, poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };

    const findPartAtPoint = (px, py) => {
      const partsReversed = [...this.plateParts].reverse();
      for (const part of partsReversed) {
        if (part.screenPoly && isPointInPolygon(px, py, part.screenPoly)) {
          return part;
        }
        if (part.centerScreen) {
          const dist = Math.hypot(px - part.centerScreen.x, py - part.centerScreen.y);
          if (dist < 36) return part;
        }
      }
      return null;
    };

    // -------------------------------------------------------------------------
    // Inspector & Selection UI Synchronizer
    // -------------------------------------------------------------------------
    const updateInspectorUI = (part) => {
      if (!part) {
        if (this.inspectorPartTitle) this.inspectorPartTitle.textContent = 'Chưa chọn chi tiết';
        if (this.inspectorPartBadge) {
          this.inspectorPartBadge.className = 'inspector-status-badge normal';
          this.inspectorPartBadge.textContent = 'Sẵn sàng';
        }
        if (this.inspectorPartCoords) this.inspectorPartCoords.textContent = 'X: --, Y: --';
        if (this.inspectorPartDims) this.inspectorPartDims.textContent = '-- x -- mm';
        if (this.inspectorPartShape) this.inspectorPartShape.textContent = 'Khối chuẩn';
        if (this.inspectorPartLayerState) this.inspectorPartLayerState.textContent = 'Layer 1..300';
        if (this.btnInspectorToggleSkip) {
          this.btnInspectorToggleSkip.disabled = true;
          this.btnInspectorToggleSkip.innerHTML = '<span>🚫 Chọn Bỏ Qua Chi Tiết Này</span>';
          this.btnInspectorToggleSkip.className = 'btn-inspector-toggle-skip';
        }
        return;
      }

      this.inspectedPart = part;
      const alreadySkipped = Array.isArray(this.bambuStatus?.s_obj) ? this.bambuStatus.s_obj : [];
      const isSkipped = alreadySkipped.includes(part.id);
      const isSelected = this.selectedSkipIds.has(part.id);

      if (this.inspectorPartTitle) this.inspectorPartTitle.textContent = `${part.name} (#${part.id})`;
      if (this.inspectorPartCoords) this.inspectorPartCoords.textContent = `X: ${part.x}mm, Y: ${part.y}mm`;
      if (this.inspectorPartDims) this.inspectorPartDims.textContent = `${part.width} x ${part.depth} x ${part.height} mm`;
      if (this.inspectorPartShape) {
        const shapeNames = { bolt: 'Ốc vít / Trụ ren', bracket: 'Khung gá chữ L', cylinder: 'Khối trụ tròn', box: 'Khối hộp chữ nhật' };
        this.inspectorPartShape.textContent = shapeNames[part.shape] || 'Khối chuẩn 3D';
      }
      if (this.inspectorPartLayerState) this.inspectorPartLayerState.textContent = `Layer 1 / ${this.bambuStatus?.total_layer_num || 300}`;

      if (this.inspectorPartBadge) {
        if (isSkipped) {
          this.inspectorPartBadge.className = 'inspector-status-badge skipped';
          this.inspectorPartBadge.textContent = 'ĐÃ BỎ QUA';
        } else if (isSelected) {
          this.inspectorPartBadge.className = 'inspector-status-badge selected';
          this.inspectorPartBadge.textContent = 'SẼ BỎ QUA';
        } else {
          this.inspectorPartBadge.className = 'inspector-status-badge normal';
          this.inspectorPartBadge.textContent = 'ĐANG IN';
        }
      }

      if (this.btnInspectorToggleSkip) {
        if (isSkipped) {
          this.btnInspectorToggleSkip.disabled = true;
          this.btnInspectorToggleSkip.className = 'btn-inspector-toggle-skip';
          this.btnInspectorToggleSkip.innerHTML = '<span>🚫 Đã bị bỏ qua bởi máy in</span>';
        } else if (isSelected) {
          this.btnInspectorToggleSkip.disabled = false;
          this.btnInspectorToggleSkip.className = 'btn-inspector-toggle-skip is-selected';
          this.btnInspectorToggleSkip.innerHTML = '<span>↩️ Bỏ chọn (Tiếp tục in mẫu này)</span>';
        } else {
          this.btnInspectorToggleSkip.disabled = false;
          this.btnInspectorToggleSkip.className = 'btn-inspector-toggle-skip';
          this.btnInspectorToggleSkip.innerHTML = '<span>🚫 Đánh Dấu Bỏ Qua Mẫu Này</span>';
        }
      }
    };

    const renderPlatePartsGrid = () => {
      if (!this.bambuPlatePartsGrid) return;
      const alreadySkipped = Array.isArray(this.bambuStatus?.s_obj) ? this.bambuStatus.s_obj : [];
      if (this.bambuTotalPartsCount) this.bambuTotalPartsCount.textContent = `${this.plateParts.length} Mẫu`;

      let html = '';
      this.plateParts.forEach(part => {
        const isSkipped = alreadySkipped.includes(part.id);
        const isSelected = this.selectedSkipIds.has(part.id);
        let cls = 'plate-part-chip-btn';
        if (isSkipped) cls += ' already-skipped';
        else if (isSelected) cls += ' selected';

        html += `
          <button type="button" class="${cls}" data-id="${part.id}" title="${part.name} (#${part.id})">
            <span class="chip-num">#${part.id}</span>
            <span class="chip-sub">${isSkipped ? 'Đã bỏ' : (isSelected ? '✓ Bỏ' : 'In')}</span>
          </button>
        `;
      });
      this.bambuPlatePartsGrid.innerHTML = html;

      this.bambuPlatePartsGrid.querySelectorAll('.plate-part-chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          const target = this.plateParts.find(p => p.id === id);
          if (target) {
            updateInspectorUI(target);
            if (!alreadySkipped.includes(id)) {
              if (this.selectedSkipIds.has(id)) {
                this.selectedSkipIds.delete(id);
              } else {
                this.selectedSkipIds.add(id);
              }
              renderSelectedChips();
              renderPlatePartsGrid();
              updateInspectorUI(target);
              drawPlateCanvas();
            }
          }
        });
      });
    };

    const renderSelectedChips = () => {
      if (!this.bambuSelectedChipsContainer) return;
      if (this.selectedSkipIds.size === 0) {
        this.bambuSelectedChipsContainer.innerHTML = '<span class="selected-placeholder">Chưa chọn chi tiết nào</span>';
        if (this.btnConfirmSkipPart) this.btnConfirmSkipPart.disabled = true;
        if (this.btnConfirmSkipText) this.btnConfirmSkipText.textContent = 'Xác Nhận Bỏ Qua Chi Tiết';
      } else {
        const sortedIds = Array.from(this.selectedSkipIds).sort((a, b) => a - b);
        this.bambuSelectedChipsContainer.innerHTML = sortedIds.map(id => {
          const item = this.plateParts.find(p => p.id === id);
          return `
            <span class="selected-chip-badge">
              #${id} ${item ? `(${item.name})` : ''}
              <button type="button" class="selected-chip-remove" data-id="${id}" title="Bỏ chọn">✕</button>
            </span>
          `;
        }).join('');
        if (this.btnConfirmSkipPart) this.btnConfirmSkipPart.disabled = false;
        if (this.btnConfirmSkipText) this.btnConfirmSkipText.textContent = `🚫 Xác Nhận Bỏ Qua (${sortedIds.length}) Chi Tiết`;

        this.bambuSelectedChipsContainer.querySelectorAll('.selected-chip-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idToRemove = parseInt(btn.getAttribute('data-id'), 10);
            this.selectedSkipIds.delete(idToRemove);
            renderSelectedChips();
            renderPlatePartsGrid();
            if (this.inspectedPart && this.inspectedPart.id === idToRemove) {
              updateInspectorUI(this.inspectedPart);
            }
            drawPlateCanvas();
          });
        });
      }
    };

    // -------------------------------------------------------------------------
    // Canvas Event Listeners (Interactive 3D Orbit, Zoom, Pan & Click Picking)
    // -------------------------------------------------------------------------
    if (this.bambu3DPlateCanvas) {
      const canvas = this.bambu3DPlateCanvas;

      // Mouse Down -> Start Orbit / Pan
      canvas.addEventListener('mousedown', (e) => {
        this.isDraggingPlate = true;
        this.hasDraggedPlate = false;
        this.dragButton = e.button;
        this.dragStartPos = { x: e.clientX, y: e.clientY };
      });

      // Mouse Move -> Orbit or Tooltip Hover
      window.addEventListener('mousemove', (e) => {
        if (this.isDraggingPlate) {
          const dx = e.clientX - this.dragStartPos.x;
          const dy = e.clientY - this.dragStartPos.y;
          this.dragStartPos = { x: e.clientX, y: e.clientY };

          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            this.hasDraggedPlate = true;
          }

          if (this.dragButton === 0 && !e.shiftKey) {
            // Left click: Orbit Rotation (Yaw & Pitch)
            if (this.plateViewMode === '3d') {
              this.camera3D.yaw = (this.camera3D.yaw + dx * 0.55 + 360) % 360;
              this.camera3D.pitch = Math.max(12, Math.min(88, this.camera3D.pitch + dy * 0.4));
              drawPlateCanvas();
            }
          } else {
            // Right click / Shift+Left click: Pan
            this.camera3D.panX += dx * 0.8;
            this.camera3D.panY += dy * 0.8;
            drawPlateCanvas();
          }
          return;
        }

        // Hover picking when not dragging
        const rect = canvas.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
          return;
        }
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const found = findPartAtPoint(mx, my);
        const prevHover = this.hoveredPart;
        this.hoveredPart = found;

        if (found) {
          canvas.style.cursor = 'pointer';
          if (this.bambu3DTooltip) {
            const alreadySkipped = Array.isArray(this.bambuStatus?.s_obj) ? this.bambuStatus.s_obj : [];
            const isSkipped = alreadySkipped.includes(found.id);
            const isSelected = this.selectedSkipIds.has(found.id);

            if (this.tooltipPartTitle) this.tooltipPartTitle.textContent = `${found.name} (#${found.id})`;
            if (this.tooltipPartStatus) {
              this.tooltipPartStatus.textContent = isSkipped ? '🚫 Đã bỏ qua trước đó' : (isSelected ? '🟠 Đang chọn để bỏ qua' : '🟢 Đang in bình thường');
            }
            this.bambu3DTooltip.style.display = 'block';
            this.bambu3DTooltip.style.left = `${mx}px`;
            this.bambu3DTooltip.style.top = `${my}px`;
          }
        } else {
          canvas.style.cursor = 'grab';
          if (this.bambu3DTooltip) this.bambu3DTooltip.style.display = 'none';
        }

        if (prevHover !== found) {
          drawPlateCanvas();
        }
      });

      // Mouse Up -> End Drag
      window.addEventListener('mouseup', () => {
        this.isDraggingPlate = false;
      });

      // Mouse Wheel -> Smooth Zoom
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        this.camera3D.zoom = Math.max(0.4, Math.min(3.5, this.camera3D.zoom * factor));
        drawPlateCanvas();
      }, { passive: false });

      // Disable context menu on 3D canvas so right-click pan works cleanly
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      // Click -> Select / Toggle Skip
      canvas.addEventListener('click', (e) => {
        if (this.hasDraggedPlate) return; // User was rotating/panning, do not click
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const clicked = findPartAtPoint(mx, my);
        if (clicked) {
          const alreadySkipped = Array.isArray(this.bambuStatus?.s_obj) ? this.bambuStatus.s_obj : [];
          updateInspectorUI(clicked);

          if (alreadySkipped.includes(clicked.id)) {
            this.showToast(`⚠️ Chi tiết #${clicked.id} đã bị bỏ qua từ trước trên máy in!`, 'warn');
          } else {
            if (this.selectedSkipIds.has(clicked.id)) {
              this.selectedSkipIds.delete(clicked.id);
              this.showToast(`↩️ Bỏ chọn chi tiết: ${clicked.name} (#${clicked.id})`, 'info');
            } else {
              this.selectedSkipIds.add(clicked.id);
              this.showToast(`🚫 Đã chọn bỏ qua: ${clicked.name} (#${clicked.id})`, 'warn');
            }
            renderSelectedChips();
            renderPlatePartsGrid();
            updateInspectorUI(clicked);
            drawPlateCanvas();
          }
        }
      });

      // Touch controls for mobile / touchscreen
      let touchStartDist = 0;
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          this.isDraggingPlate = true;
          this.hasDraggedPlate = false;
          this.dragStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
          touchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        }
      }, { passive: true });

      canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && this.isDraggingPlate) {
          const dx = e.touches[0].clientX - this.dragStartPos.x;
          const dy = e.touches[0].clientY - this.dragStartPos.y;
          this.dragStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.hasDraggedPlate = true;
          this.camera3D.yaw = (this.camera3D.yaw + dx * 0.55 + 360) % 360;
          this.camera3D.pitch = Math.max(12, Math.min(88, this.camera3D.pitch + dy * 0.4));
          drawPlateCanvas();
        } else if (e.touches.length === 2) {
          const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          if (touchStartDist > 0) {
            const ratio = dist / touchStartDist;
            this.camera3D.zoom = Math.max(0.4, Math.min(3.5, this.camera3D.zoom * ratio));
            drawPlateCanvas();
          }
          touchStartDist = dist;
        }
      }, { passive: true });

      canvas.addEventListener('touchend', () => {
        this.isDraggingPlate = false;
        touchStartDist = 0;
      }, { passive: true });
    }

    // Inspector button toggle
    this.btnInspectorToggleSkip?.addEventListener('click', () => {
      if (!this.inspectedPart) return;
      const id = this.inspectedPart.id;
      if (this.selectedSkipIds.has(id)) {
        this.selectedSkipIds.delete(id);
      } else {
        this.selectedSkipIds.add(id);
      }
      renderSelectedChips();
      renderPlatePartsGrid();
      updateInspectorUI(this.inspectedPart);
      drawPlateCanvas();
    });

    // -------------------------------------------------------------------------
    // Toolbar Tools (3D, 2D, Slicer 3D, Reset, Sync FTPS, Upload 3MF)
    // -------------------------------------------------------------------------
    this.btnPlateView3D?.addEventListener('click', () => {
      this.plateViewMode = '3d';
      this.camera3D.pitch = 38;
      this.btnPlateView3D?.classList.add('active');
      this.btnPlateView2D?.classList.remove('active');
      this.btnPlateViewSlicer?.classList.remove('active');
      drawPlateCanvas();
    });

    this.btnPlateView2D?.addEventListener('click', () => {
      this.plateViewMode = '2d';
      this.camera3D.pitch = 90;
      this.camera3D.yaw = 0;
      this.camera3D.panX = 0;
      this.camera3D.panY = 0;
      this.btnPlateView2D?.classList.add('active');
      this.btnPlateView3D?.classList.remove('active');
      this.btnPlateViewSlicer?.classList.remove('active');
      drawPlateCanvas();
    });

    this.btnPlateViewSlicer?.addEventListener('click', () => {
      this.plateViewMode = 'slicer';
      this.btnPlateViewSlicer?.classList.add('active');
      this.btnPlateView3D?.classList.remove('active');
      this.btnPlateView2D?.classList.remove('active');
      this.showToast('📸 Đang hiển thị bản render 3D gốc từ Bambu Studio', 'info');
      drawPlateCanvas();
    });

    this.btnPlateResetView?.addEventListener('click', () => {
      this.plateViewMode = '3d';
      this.camera3D = { yaw: 35, pitch: 46, zoom: 1.25, panX: 0, panY: 10 };
      this.btnPlateView3D?.classList.add('active');
      this.btnPlateView2D?.classList.remove('active');
      this.btnPlateViewSlicer?.classList.remove('active');
      this.showToast('🎯 Đã căn giữa góc nhìn 3D chuẩn Bambu Studio', 'info');
      drawPlateCanvas();
    });

    // Sync 3MF from Printer FTPS
    this.btnPlateSyncFtps?.addEventListener('click', () => {
      loadPlateData(true);
    });

    // Upload Local 3MF
    this.btnPlateUpload3mf?.addEventListener('click', () => {
      this.fileInput3mf?.click();
    });

    this.fileInput3mf?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      this.showToast(`📂 Đang đọc tệp ${file.name}...`, 'info');
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1] || reader.result;
          const res = await this.bambuExec('parse_3mf', { base64, fileName: file.name });
          if (res && res.plate_info) {
            applyPlateInfo(res.plate_info);
            this.showToast(`✅ Đã tải ${res.plate_info.objects?.length || 0} chi tiết từ ${file.name}!`, 'success');
          } else {
            this.showToast('⚠️ Không thể đọc dữ liệu từ tệp 3MF này', 'warn');
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        this.showToast(`❌ Lỗi đọc tệp: ${err.message}`, 'error');
      }
    });

    // Plate selector dropdown change
    this.bambuPlateSelect?.addEventListener('change', () => {
      const selectedIndex = parseInt(this.bambuPlateSelect.value, 10);
      if (this.plateInfo && Array.isArray(this.plateInfo.plates)) {
        this.plateInfo.activePlateIndex = selectedIndex;
        applyPlateInfo(this.plateInfo);
      }
    });

    // Custom ID addition
    this.btnAddCustomSkipId?.addEventListener('click', () => {
      if (!this.txtCustomSkipId) return;
      const customId = parseInt(this.txtCustomSkipId.value, 10);
      if (!isNaN(customId) && customId > 0) {
        const alreadySkipped = Array.isArray(this.bambuStatus?.s_obj) ? this.bambuStatus.s_obj : [];
        if (alreadySkipped.includes(customId)) {
          this.showToast(`⚠️ Chi tiết #${customId} đã được bỏ qua trước đó rồi!`, 'warn');
        } else {
          let existingPart = this.plateParts.find(p => p.id === customId);
          if (!existingPart) {
            existingPart = {
              id: customId,
              name: `Mẫu #${customId}`,
              x: 90,
              y: 90,
              width: 32,
              depth: 32,
              height: 25,
              shape: 'box'
            };
            this.plateParts.push(existingPart);
          }
          this.selectedSkipIds.add(customId);
          this.txtCustomSkipId.value = '';
          updateInspectorUI(existingPart);
          renderSelectedChips();
          renderPlatePartsGrid();
          drawPlateCanvas();
          this.showToast(`✨ Đã thêm chi tiết #${customId} vào danh sách bỏ qua`, 'success');
        }
      } else {
        this.showToast('Vui lòng nhập số ID chi tiết hợp lệ', 'warn');
      }
    });

    this.txtCustomSkipId?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.btnAddCustomSkipId?.click();
      }
    });

    // Modal Open & Close Lifecycle
    const openSkipModal = () => {
      this.selectedSkipIds.clear();
      loadPlateData(false);

      if (this.bambuPlateLayerBadge) {
        const curL = this.bambuStatus?.layer_num || 152;
        const totL = this.bambuStatus?.total_layer_num || 300;
        const pct = Math.round(this.bambuStatus?.mc_percent || 55);
        this.bambuPlateLayerBadge.textContent = `Layer ${curL}/${totL} (~${pct}%)`;
      }

      if (this.bambuSkipModal) this.bambuSkipModal.style.display = 'flex';
      setTimeout(drawPlateCanvas, 50);
    };

    const closeSkipModal = () => {
      if (this.bambuSkipModal) this.bambuSkipModal.style.display = 'none';
      this.selectedSkipIds.clear();
    };

    this.btnBambuSkipPart?.addEventListener('click', openSkipModal);
    this.btnCloseSkipModal?.addEventListener('click', closeSkipModal);
    this.btnCancelSkipModal?.addEventListener('click', closeSkipModal);
    this.bambuSkipModal?.addEventListener('click', (e) => {
      if (e.target === this.bambuSkipModal) closeSkipModal();
    });

    // Confirm Skip Part Button
    this.btnConfirmSkipPart?.addEventListener('click', async () => {
      if (this.selectedSkipIds.size === 0) {
        this.showToast('⚠️ Vui lòng chọn ít nhất 1 chi tiết 3D để bỏ qua', 'warn');
        return;
      }
      const idsToSend = Array.from(this.selectedSkipIds);
      if (this.btnConfirmSkipText) this.btnConfirmSkipText.textContent = 'Đang gửi lệnh...';
      this.btnConfirmSkipPart.disabled = true;

      this.log(`[Bambu Skip Part] 🚫 Đang gửi lệnh bỏ qua các chi tiết #${idsToSend.join(', #')}...`, 'info');
      this.showToast(`🚫 Đang gửi lệnh bỏ qua chi tiết #${idsToSend.join(', #')}...`, 'info');

      try {
        const res = await this.bambuExec('skip_objects', { obj_list: idsToSend });
        if (res && res.success) {
          this.showToast(`✅ Đã gửi lệnh bỏ qua chi tiết: #${idsToSend.join(', #')}`, 'success');
          this.log(`[Bambu Skip Part] ✅ Thành công bỏ qua chi tiết: #${idsToSend.join(', #')}`, 'success');
          closeSkipModal();
          await this.pollBambuOnce?.();
        } else {
          this.showToast(`❌ Lỗi bỏ qua chi tiết: ${res?.error || 'Không phản hồi'}`, 'error');
          this.log(`[Bambu Skip Part Error] ${res?.error || 'Lỗi không xác định'}`, 'error');
        }
      } catch (err) {
        this.showToast(`❌ Lỗi kết nối: ${err.message}`, 'error');
      } finally {
        if (this.btnConfirmSkipText) this.btnConfirmSkipText.textContent = 'Xác Nhận Bỏ Qua Chi Tiết';
        this.btnConfirmSkipPart.disabled = false;
      }
    });

    window.addEventListener('resize', () => {
      if (this.bambuSkipModal && this.bambuSkipModal.style.display === 'flex') {
        drawPlateCanvas();
      }
    });

    // 4. Camera Controls & Stream Init
    this.initBambuCamera();
  }

  // --------------------------------------------------------------------------
  // Camera Stream Engine
  // --------------------------------------------------------------------------
  initBambuCamera() {
    if (!this.bambuCameraFeed) return;

    const playIcon = this.btnBambuCamPlayToggle?.querySelector('.icon-play');
    const pauseIcon = this.btnBambuCamPlayToggle?.querySelector('.icon-pause');

    this.bambuCameraFeed.onload = () => {
      if (this.bambuCamPlaceholder) this.bambuCamPlaceholder.style.display = 'none';
      this.bambuCameraFeed.style.display = 'block';
      if (this.bambuCamLiveIndicator) this.bambuCamLiveIndicator.style.display = 'flex';
      if (playIcon) playIcon.style.display = 'none';
      if (pauseIcon) pauseIcon.style.display = 'block';
      this.isBambuCamStreaming = true;
    };

    this.bambuCameraFeed.onerror = () => {
      this.pollBambuSnapshotFallback();
    };

    this.btnBambuCamPlayToggle?.addEventListener('click', () => {
      if (this.isBambuCamStreaming) {
        this.stopBambuCameraStream();
        this.showToast('⏸️ Đã tạm dừng Camera', 'info');
      } else {
        this.startBambuCameraStream();
        this.showToast('▶️ Đang phát Camera trực tiếp', 'info');
      }
    });

    this.btnCamRefresh?.addEventListener('click', () => {
      this.showToast('🔄 Đang làm mới luồng Camera...', 'info');
      this.startBambuCameraStream();
    });

    this.btnCamFullscreen?.addEventListener('click', () => {
      const viewport = document.getElementById('bambuCameraViewport');
      if (!viewport) return;
      if (!document.fullscreenElement) {
        viewport.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

    // Camera Crop / Focus Toggle & Zoom Modes
    this.btnCamCropToggle = document.getElementById('btnCamCropToggle');
    this.btnCamZoomToggle = document.getElementById('btnCamZoomToggle');
    this.camCropBtnText = document.getElementById('camCropBtnText');
    this.camZoomBadge = document.getElementById('camZoomBadge');

    // Restore saved crop/zoom preferences (default to 1.35x smart crop to cut desk/table)
    const savedZoom = localStorage.getItem('bambu_cam_zoom') || '1.35';
    this.setCameraZoom(savedZoom);

    this.btnCamCropToggle?.addEventListener('click', () => {
      const isCurrentlyCropped = this.bambuCameraFeed.classList.contains('crop-mode') || this.bambuCameraFeed.classList.contains('crop-mode-2');
      if (isCurrentlyCropped) {
        this.setCameraZoom('1.0');
        this.showToast('📐 Chế độ toàn cảnh (1.0x)', 'info');
      } else {
        this.setCameraZoom('1.35');
        this.showToast('✂️ Chế độ cắt bàn (1.35x - Tập trung bàn in)', 'info');
      }
    });

    this.btnCamZoomToggle?.addEventListener('click', () => {
      const current = localStorage.getItem('bambu_cam_zoom') || '1.35';
      const zoomCycle = {
        '1.0': '1.35',
        '1.35': '1.7',
        '1.7': '1.0'
      };
      const nextZoom = zoomCycle[current] || '1.35';
      this.setCameraZoom(nextZoom);
      this.showToast(`🔍 Phóng to Camera: ${nextZoom}`, 'info');
    });

    // Auto-start stream on load
    this.startBambuCameraStream();
  }

  setCameraZoom(level) {
    if (!this.bambuCameraFeed) return;
    this.bambuCameraFeed.classList.remove('crop-mode', 'crop-mode-2', 'crop-mode-full');
    
    if (level === '1.7') {
      this.bambuCameraFeed.classList.add('crop-mode-2');
      if (this.camZoomBadge) this.camZoomBadge.textContent = '1.7x';
      if (this.camCropBtnText) this.camCropBtnText.textContent = 'Cận Cảnh';
      this.btnCamCropToggle?.classList.add('active');
    } else if (level === '1.35') {
      this.bambuCameraFeed.classList.add('crop-mode');
      if (this.camZoomBadge) this.camZoomBadge.textContent = '1.35x';
      if (this.camCropBtnText) this.camCropBtnText.textContent = 'Cắt Bàn';
      this.btnCamCropToggle?.classList.add('active');
    } else {
      this.bambuCameraFeed.classList.add('crop-mode-full');
      if (this.camZoomBadge) this.camZoomBadge.textContent = '1.0x';
      if (this.camCropBtnText) this.camCropBtnText.textContent = 'Toàn Cảnh';
      this.btnCamCropToggle?.classList.remove('active');
    }
    
    try {
      localStorage.setItem('bambu_cam_zoom', level);
    } catch (_) {}
  }

  startBambuCameraStream() {
    if (!this.bambuCameraFeed) return;
    const baseUrl = this.isDesktop ? 'http://localhost:3000' : (this.hostServer || window.location.origin);
    const streamUrl = `${baseUrl}/api/bambu/camera.mjpg?t=${Date.now()}`;
    
    if (this.bambuCamStatusMsg) this.bambuCamStatusMsg.textContent = 'Đang tải luồng camera Bambu Lab...';
    this.bambuCameraFeed.src = streamUrl;
    this.isBambuCamStreaming = true;
  }

  stopBambuCameraStream() {
    if (!this.bambuCameraFeed) return;
    this.bambuCameraFeed.src = '';
    this.bambuCameraFeed.style.display = 'none';
    if (this.bambuCamPlaceholder) this.bambuCamPlaceholder.style.display = 'flex';
    if (this.bambuCamLiveIndicator) this.bambuCamLiveIndicator.style.display = 'none';
    if (this.bambuCamStatusMsg) this.bambuCamStatusMsg.textContent = 'Camera đang tạm dừng';
    
    const playIcon = this.btnBambuCamPlayToggle?.querySelector('.icon-play');
    const pauseIcon = this.btnBambuCamPlayToggle?.querySelector('.icon-pause');
    if (playIcon) playIcon.style.display = 'block';
    if (pauseIcon) pauseIcon.style.display = 'none';
    
    this.isBambuCamStreaming = false;
    if (this.bambuCamSnapshotTimer) {
      clearInterval(this.bambuCamSnapshotTimer);
      this.bambuCamSnapshotTimer = null;
    }
  }

  fetchBambuCameraSnapshot() {
    if (!this.bambuCameraFeed) return;
    const baseUrl = this.isDesktop ? 'http://localhost:3000' : (this.hostServer || window.location.origin);
    this.bambuCameraFeed.src = `${baseUrl}/api/bambu/camera/snapshot?t=${Date.now()}`;
  }

  pollBambuSnapshotFallback() {
    if (this.bambuCamSnapshotTimer) return;
    this.bambuCamSnapshotTimer = setInterval(() => {
      if (!this.isBambuCamStreaming) {
        clearInterval(this.bambuCamSnapshotTimer);
        this.bambuCamSnapshotTimer = null;
        return;
      }
      this.fetchBambuCameraSnapshot();
    }, 1500);
  }

  // --------------------------------------------------------------------------
  // Bambu Status Polling Loop & UI Sync
  // --------------------------------------------------------------------------
  startBambuStatusSync() {
    // 1. Electron Real-time IPC listener
    if (this.isDesktop && window.dianaDesktop?.onBambuStatusUpdate) {
      window.dianaDesktop.onBambuStatusUpdate((status) => {
        this.updateBambuUI(status);
      });
      window.dianaDesktop.onBambuConnected?.((status) => {
        this.log('[Bambu] 🟢 Đã kết nối MQTT Bambu Lab A1 mini!', 'success');
        this.updateBambuUI(status);
        this.startBambuCameraStream();
      });
      window.dianaDesktop.onBambuDisconnected?.(() => {
        // Không xóa dữ liệu in khi mất kết nối tạm thời
      });
    }

    // 2. Telemetry Polling Loop (every 2.5s)
    const pollBambu = async () => {
      try {
        let st = null;
        if (this.isDesktop && window.dianaDesktop?.bambuGetStatus) {
          st = await window.dianaDesktop.bambuGetStatus();
        }
        if (!st || !st.connected) {
          if (this.isDesktop) {
            try {
              const localRes = await fetch('http://localhost:3000/api/bambu/status');
              if (localRes.ok) {
                const resData = await localRes.json();
                if (resData && resData.status && (resData.status.connected || !st)) {
                  st = resData.status;
                }
                if (resData && resData.config) this.bambuConfig = resData.config;
              }
            } catch (_) {}
          } else {
            const res = await this.apiCall('/api/bambu/status');
            if (res && res.status) {
              st = res.status;
            }
            if (res && res.config) this.bambuConfig = res.config;
          }
        }
        if (st) this.updateBambuUI(st);
      } catch (_) {}
    };

    this.pollBambuOnce = pollBambu;
    pollBambu();
    setInterval(pollBambu, 2500);
  }

  updateBambuUI(newStatus) {
    if (!newStatus) return;

    const prev = this.bambuStatus || {};
    const wasPrinting = prev.gcode_state === 'RUNNING' || prev.gcode_state === 'PREPARE' || prev.gcode_state === 'PAUSE';

    // Bảo vệ không bị reset về 0/IDLE khi máy in đang in mà chỉ nhận được gói tin phụ (như bật tắt đèn)
    const isIncomingZero = (newStatus.mc_percent === undefined || newStatus.mc_percent === 0) &&
      (!newStatus.subtask_name || newStatus.subtask_name === 'Chưa có tệp in') &&
      (!newStatus.nozzle_temper || Number(newStatus.nozzle_temper) <= 26);

    let status = { ...prev, ...newStatus };

    if (wasPrinting && isIncomingZero && (!newStatus.gcode_state || newStatus.gcode_state === 'IDLE')) {
      status.gcode_state = prev.gcode_state;
      status.mc_percent = prev.mc_percent;
      status.mc_remaining_time = prev.mc_remaining_time;
      status.layer_num = prev.layer_num;
      status.total_layer_num = prev.total_layer_num;
      status.subtask_name = prev.subtask_name;
      status.gcode_file = prev.gcode_file;
      status.nozzle_temper = prev.nozzle_temper;
      status.nozzle_target_temper = prev.nozzle_target_temper;
      status.bed_temper = prev.bed_temper;
      status.bed_target_temper = prev.bed_target_temper;
      status.ams = prev.ams || status.ams;
      status.vt_tray = prev.vt_tray || status.vt_tray;
      status.tray_now = prev.tray_now || status.tray_now;
    }

    this.bambuStatus = status;

    const isConn = Boolean(status.connected || status.online || status.isSimulation);
    const isSim = Boolean(status.isSimulation);
    const gcodeState = (status.gcode_state || 'IDLE').toUpperCase();
    const isPrinting = gcodeState === 'RUNNING' || gcodeState === 'PREPARE';
    const isPaused = gcodeState === 'PAUSE';

    // Status Pill & Dot
    if (this.bambuStatusPill && this.bambuStatusPillText) {
      let pillClass = 'offline';
      let pillText = 'Offline';
      if (isSim) {
        pillClass = 'simulation';
        pillText = 'Demo Giả Lập';
      } else if (isPrinting) {
        pillClass = 'printing';
        pillText = 'Đang In';
      } else if (isPaused) {
        pillClass = 'paused';
        pillText = 'Tạm Dừng';
      } else if (isConn) {
        pillClass = 'online';
        pillText = 'Online';
      }
      this.bambuStatusPill.className = `bambu-status-pill ${pillClass}`;
      this.bambuStatusPillText.textContent = pillText;
    }

    // Sidebar Tab Dot
    if (this.navBambuDot) {
      this.navBambuDot.className = `nav-status-dot ${isSim ? 'simulation' : (isConn ? 'online' : 'offline')}`;
    }

    // Meta items
    if (this.bambuMetaIp) this.bambuMetaIp.textContent = `🌐 IP: ${status.ip || this.bambuConfig?.ip || '192.168.0.100'}`;
    const wifiText = status.wifi_signal ? (String(status.wifi_signal).includes('dBm') ? status.wifi_signal : `${status.wifi_signal} dBm`) : '-50 dBm';
    if (this.bambuMetaWifi) this.bambuMetaWifi.textContent = `📶 Wi-Fi: ${wifiText}`;
    if (this.bambuMetaSerial) this.bambuMetaSerial.textContent = `SN: ${status.serialNumber || this.bambuConfig?.serialNumber || '0300DA642803699'}`;

    // Progress Bar & Percentage
    const pct = Math.max(0, Math.min(100, Number(status.mc_percent) || 0));
    if (this.bambuPercentText) this.bambuPercentText.textContent = `${Math.round(pct)}%`;
    if (this.bambuLinearProgress) this.bambuLinearProgress.style.width = `${pct}%`;

    // Task Name & Layer
    if (this.bambuTaskFileName) {
      this.bambuTaskFileName.textContent = status.subtask_name || status.gcode_file || (isConn ? '0.2mm layer, 2 walls, 15% infill' : 'Chưa kết nối');
    }
    if (this.bambuLayerText) {
      if (status.total_layer_num > 0) {
        this.bambuLayerText.textContent = `Layer: ${status.layer_num || 0}/${status.total_layer_num}`;
      } else {
        this.bambuLayerText.textContent = isConn ? `Layer: ${status.layer_num || 0}/300` : `Layer: 0/0`;
      }
    }

    // Remaining Time & ETA
    const rem = Number(status.mc_remaining_time) || 0;
    if (this.bambuRemainingTimeText) {
      if (rem > 60) {
        const h = Math.floor(rem / 60);
        const m = rem % 60;
        this.bambuRemainingTimeText.textContent = `~${h}h${m}min`;
      } else if (rem > 0) {
        this.bambuRemainingTimeText.textContent = `~${rem}min`;
      } else {
        this.bambuRemainingTimeText.textContent = isConn ? '0min' : '--';
      }
    }

    if (this.bambuEtaText) {
      if (rem > 0) {
        const finishDate = new Date(Date.now() + rem * 60 * 1000);
        const hh = String(finishDate.getHours()).padStart(2, '0');
        const mm = String(finishDate.getMinutes()).padStart(2, '0');
        this.bambuEtaText.textContent = `${hh}:${mm}`;
      } else {
        this.bambuEtaText.textContent = isConn ? 'Sẵn sàng' : '--:--';
      }
    }

    // State Badge
    if (this.bambuStateBadge) {
      const mapState = {
        'RUNNING': 'Printing',
        'PAUSE': 'Paused',
        'PREPARE': 'Preparing',
        'IDLE': 'Idle',
        'FINISH': 'Finish',
        'FAILED': 'Failed'
      };
      this.bambuStateBadge.textContent = mapState[gcodeState] || (isConn ? 'Online' : 'Offline');
    }

    // Temperatures
    const nozCur = status.nozzle_temper !== undefined ? Number(status.nozzle_temper).toFixed(0) : '25';
    const nozTar = status.nozzle_target_temper !== undefined ? Number(status.nozzle_target_temper).toFixed(0) : '0';
    const bedCur = status.bed_temper !== undefined ? Number(status.bed_temper).toFixed(0) : '24';
    const bedTar = status.bed_target_temper !== undefined ? Number(status.bed_target_temper).toFixed(0) : '0';

    if (this.bambuNozzleCur) this.bambuNozzleCur.textContent = nozCur;
    if (this.bambuNozzleTarget) this.bambuNozzleTarget.textContent = nozTar;
    if (this.bambuBedCur) this.bambuBedCur.textContent = bedCur;
    if (this.bambuBedTarget) this.bambuBedTarget.textContent = bedTar;

    // Light button toggle state
    const isLightOn = Boolean(status.light_state);
    if (this.btnToggleBambuLight) {
      this.btnToggleBambuLight.classList.toggle('active', isLightOn);
    }

    // Pause / Resume text toggle
    if (this.btnBambuPauseText) {
      this.btnBambuPauseText.textContent = isPaused ? 'Tiếp Tục In' : 'Tạm Dừng In';
    }

    // Active Spool & Filament Material
    let activeType = 'PLA';
    let activeColor = '#10b981';
    let activeName = 'Bambu PLA Basic';
    let activeTempRange = '190°C - 230°C';
    let activePosition = 'Cuộn Ngoài (External Spool)';
    let isExternal = true;

    const isVtTray = !status.tray_now || status.tray_now === '254' || status.tray_now === '255' || !status.ams || !Array.isArray(status.ams.trays) || status.ams.trays.length === 0;

    if (isVtTray) {
      if (status.vt_tray) {
        activeType = status.vt_tray.type || 'PLA';
        const hex = status.vt_tray.color || '10B981';
        activeColor = hex.startsWith('#') ? hex : `#${hex.substring(0, 6)}`;
        activeName = status.vt_tray.name || `Bambu ${activeType}`;
      }
      isExternal = true;
      activePosition = 'Cuộn Ngoài (External Spool)';
    } else {
      const slotNum = parseInt(status.tray_now, 10);
      const slot = !isNaN(slotNum) && slotNum >= 0 && slotNum < status.ams.trays.length ? slotNum : (status.ams.active_slot || 0);
      const tray = status.ams.trays[slot];
      if (tray) {
        activeType = tray.type || 'PLA';
        const hex = tray.color || '16A34A';
        activeColor = hex.startsWith('#') ? hex : `#${hex.substring(0, 6)}`;
        activeName = tray.name || `Bambu ${activeType}`;
        isExternal = false;
        activePosition = `Khay AMS #${slot + 1}`;
      }
    }

    if (activeType.includes('PETG')) {
      activeTempRange = '220°C - 260°C';
    } else if (activeType.includes('ABS')) {
      activeTempRange = '240°C - 270°C';
    } else if (activeType.includes('TPU')) {
      activeTempRange = '200°C - 240°C';
    } else {
      activeTempRange = '190°C - 230°C';
    }

    if (this.bambuSpoolType) this.bambuSpoolType.textContent = activeType;
    if (this.bambuSpoolNameText) this.bambuSpoolNameText.textContent = activeName;
    if (this.bambuSpoolTempRange) this.bambuSpoolTempRange.textContent = activeTempRange;
    if (this.bambuSpoolPosition) this.bambuSpoolPosition.textContent = activePosition;
    if (this.bambuSpoolTag) this.bambuSpoolTag.textContent = isExternal ? 'Cuộn Ngoài' : `AMS ${parseInt(status.tray_now || 0, 10) + 1}`;

    if (this.bambuSpoolRing) {
      this.bambuSpoolRing.style.borderColor = activeColor;
      this.bambuSpoolRing.style.boxShadow = `0 0 20px ${activeColor}66`;
    }

    // Skipped Objects Telemetry Row (s_obj)
    const skippedList = Array.isArray(status.s_obj) ? status.s_obj : [];
    if (this.bambuSkippedBadgeBox) {
      if (skippedList.length > 0) {
        this.bambuSkippedBadgeBox.style.display = 'flex';
        if (this.bambuSkippedPillsList) {
          this.bambuSkippedPillsList.innerHTML = skippedList.map(id => `<span class="skipped-pill-item">🚫 Chi tiết #${id}</span>`).join('');
        }
      } else {
        this.bambuSkippedBadgeBox.style.display = 'none';
      }
    }
  }

  async bambuExec(action, data = {}) {
    try {
      if (this.isDesktop && window.dianaDesktop) {
        let res = null;
        if (action === 'pause') res = await window.dianaDesktop.bambuControlPrint('pause');
        else if (action === 'resume') res = await window.dianaDesktop.bambuControlPrint('resume');
        else if (action === 'stop') res = await window.dianaDesktop.bambuControlPrint('stop');
        else if (action === 'skip_objects' || action === 'skip_part') res = await window.dianaDesktop.bambuSkipObjects(data.obj_list || data.ids);
        else if (action === 'set_temp') res = await window.dianaDesktop.bambuSetTemp(data.target, data.value);
        else if (action === 'set_speed') res = await window.dianaDesktop.bambuSetSpeed(data.level);
        else if (action === 'set_light') res = await window.dianaDesktop.bambuSetLight(data.state);
        else if (action === 'set_fan') res = await window.dianaDesktop.bambuSetFan(data.fanType, data.speed);
        else if (action === 'feed') res = await window.dianaDesktop.bambuFeedFilament(data.amount);
        else if (action === 'jog') res = await window.dianaDesktop.bambuJog(data.axis, data.distance);
        else if (action === 'home') res = await window.dianaDesktop.bambuHome(data.axes);
        else if (action === 'gcode') res = await window.dianaDesktop.bambuSendGcode(data.gcode);
        else if (action === 'discover' || action === 'scan') res = await window.dianaDesktop.bambuScanLan();

        if (res && res.success) return res;

        // Fallback sang API cục bộ nếu IPC chưa khởi động kịp
        try {
          const fbRes = await fetch('http://localhost:3000/api/bambu/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...data })
          });
          if (fbRes.ok) return await fbRes.json();
        } catch (_) {}

        return res;
      } else {
        return await this.apiCall('/api/bambu/action', {
          method: 'POST',
          body: JSON.stringify({ action, ...data })
        });
      }
    } catch (err) {
      this.log(`[Bambu Exec Error] ${err.message}`, 'error');
      return { success: false, error: err.message };
    }
  }

  async bambuJog(axis, distance) {
    this.log(`[Bambu Motion] Jog Trục ${axis.toUpperCase()} ${distance > 0 ? '+' : ''}${distance}mm`, 'info');
    await this.bambuExec('jog', { axis, distance });
  }

  async bambuHome(axes) {
    this.log(`[Bambu Motion] Về gốc Home ${axes.toUpperCase()} (G28)`, 'info');
    await this.bambuExec('home', { axes });
  }

  async bambuGcode(gcode) {
    await this.bambuExec('gcode', { gcode });
  }

  appendBambuTerminal(type, text) {
    const termLogs = document.getElementById('bambuTerminalLogs');
    if (!termLogs) return;
    const time = new Date().toLocaleTimeString('vi-VN');
    const line = document.createElement('div');
    line.className = `term-line ${type}`;
    line.textContent = `[${time}] ${text}`;
    termLogs.appendChild(line);
    termLogs.scrollTop = termLogs.scrollHeight;
  }

  speakTTS(text) {
    if (!this.ttsEnabled || !text) return;
    const cleanStr = typeof text === 'string' ? text : (text.text || text.reply || text.message || String(text || ''));
    if (!cleanStr) return;
    try {
      // 1. Edge TTS Server Audio Endpoint
      if (this.ttsAudio && this.hostServer) {
        const cleanText = cleanStr.replace(/[*#_`]/g, '').trim();
        this.ttsAudio.src = `${this.hostServer}/api/tts?text=${encodeURIComponent(cleanText)}`;
        this.ttsAudio.play().catch(() => {
          this.fallbackSpeechSynthesis(cleanText);
        });
        return;
      }
      this.fallbackSpeechSynthesis(cleanStr);
    } catch (_) {}
  }

  fallbackSpeechSynthesis(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleanStr = typeof text === 'string' ? text : (text.text || text.reply || text.message || String(text || ''));
      if (!cleanStr) return;
      const utter = new SpeechSynthesisUtterance(cleanStr.replace(/[*#_`]/g, ''));
      utter.lang = 'vi-VN';
      utter.rate = 1.1;
      utter.pitch = 1.1;
      window.speechSynthesis.speak(utter);
    }
  }

  // --------------------------------------------------------------------------
  // 8. Diana Secret Sanctuary (Không Gian Nhập Vai Thầm Kín & Ký Ức Riêng)
  // --------------------------------------------------------------------------
  initSecretRoseCanvas() {
    const canvas = document.getElementById('secretCanvas');
    const container = document.getElementById('pane-secret');
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    let width = (canvas.width = container.clientWidth || window.innerWidth);
    let height = (canvas.height = container.clientHeight || window.innerHeight);

    const resize = () => {
      width = canvas.width = container.clientWidth || window.innerWidth;
      height = canvas.height = container.clientHeight || window.innerHeight;
    };
    window.addEventListener('resize', resize);

    // Tạo các hạt hoa hồng và tinh vân phát sáng lơ lửng
    const particles = [];
    const count = 32;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 5 + 3,
        speedX: Math.random() * 0.5 - 0.25,
        speedY: Math.random() * 0.5 + 0.15,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 1.2,
        opacity: Math.random() * 0.5 + 0.25,
        color: Math.random() > 0.4 ? '#ec4899' : (Math.random() > 0.5 ? '#f43f5e' : '#a855f7'),
        isPetal: Math.random() > 0.35
      });
    }

    const draw = () => {
      if (this.activeTab !== 'secret') {
        requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotSpeed;

        if (p.y > height + 20) {
          p.y = -20;
          p.x = Math.random() * width;
        }
        if (p.x > width + 20) p.x = -20;
        if (p.x < -20) p.x = width + 20;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;

        if (p.isPetal) {
          // Vẽ cánh hoa hồng mềm mại
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 1.2, p.size * 0.7, 0, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 10;
          ctx.shadowColor = p.color;
          ctx.fill();
        } else {
          // Vẽ hạt bụi sao phát sáng
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = '#fbcfe8';
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#ec4899';
          ctx.fill();
        }
        ctx.restore();
      }

      requestAnimationFrame(draw);
    };

    requestAnimationFrame(draw);
  }

  initSecretSanctuary() {
    this.secretConfig = {
      provider: 'gemini',
      geminiModel: 'gemini-2.5-flash',
      persona: 'sweet_lover',
      temperature: 0.9,
      openrouterModel: 'nousresearch/hermes-3-llama-3.1-8b',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3:latest'
    };

    const formatSecretText = (text) => {
      if (!text) return '';
      let formatted = text.replace(/\*([^*]+)\*/g, '<span class="secret-action-text">*$1*</span>');
      formatted = formatted.replace(/\n/g, '<br>');
      return formatted;
    };

    const appendSecretMessage = (role, payload, timeStr, meta = {}) => {
      if (!this.secretChatMessages) return;
      if (this.secretWelcomeCard) this.secretWelcomeCard.style.display = 'none';

      let text = '';
      let isImage = false;
      let imgSrc = null;
      let stateName = 'Trạng Thái Hiện Tại';

      if (typeof payload === 'string') {
        text = payload;
      } else if (payload && typeof payload === 'object') {
        text = payload.text || payload.reply || payload.caption || '';
        isImage = Boolean(payload.isImageResponse || payload.isImage || payload.imageUrl || payload.imageBase64);
        imgSrc = payload.imageUrl || payload.imageBase64 || null;
        if (payload.stateInfo?.name) stateName = payload.stateInfo.name;
      }

      if (meta && (meta.isImage || meta.imageUrl || meta.imageBase64)) {
        isImage = true;
        imgSrc = meta.imageUrl || meta.imageBase64 || imgSrc;
        if (meta.stateInfo?.name) stateName = meta.stateInfo.name;
      }

      if (imgSrc && imgSrc.startsWith('/assets/')) {
        imgSrc = imgSrc.replace(/^\/+/, '');
      }

      const row = document.createElement('div');
      row.className = `secret-msg-row ${role}`;
      const time = timeStr || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

      if (role === 'bot') {
        let cardHtml = '';
        if (isImage && imgSrc) {
          cardHtml = `
            <div class="diana-character-card">
              <div class="diana-card-header">
                <span class="diana-card-badge"><span class="diana-card-live-dot"></span> 🌸 DIANA LIVE • ${stateName}</span>
                <span style="font-size: 0.7rem; color: #f472b6; font-weight: 600;">Uncensored HD</span>
              </div>
              <div class="diana-card-img-wrap" data-img-src="${imgSrc}">
                <img src="${imgSrc}" alt="Diana Character Model" loading="lazy">
                <div class="diana-card-zoom-hint">🔍 Chạm để phóng to</div>
              </div>
              <div class="diana-card-actions">
                <button class="btn-diana-action btn-zoom-diana" data-img-src="${imgSrc}">🔍 Phóng To</button>
                <a href="${imgSrc}" download="diana_state_${Date.now()}.png" class="btn-diana-action" target="_blank">💾 Tải Ảnh</a>
              </div>
            </div>
          `;
        }

        row.innerHTML = `
          <div class="secret-msg-avatar">
            <img src="avatar.png" alt="Diana">
          </div>
          <div>
            <div class="secret-msg-bubble">
              ${cardHtml}
              ${text ? `<div style="${isImage ? 'margin-top: 8px;' : ''}">${formatSecretText(text)}</div>` : ''}
            </div>
            <div class="secret-msg-time">${time}</div>
          </div>
        `;

        row.querySelectorAll('.diana-card-img-wrap, .btn-zoom-diana').forEach(el => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const src = el.getAttribute('data-img-src') || imgSrc;
            if (this.imageLightbox && this.lightboxImg && src) {
              if (this.lightboxTitle) this.lightboxTitle.textContent = '🌸 Diana - Dáng Vẻ Riêng Tư';
              this.lightboxImg.src = src;
              this.imageLightbox.style.display = 'flex';
            }
          });
        });
      } else {
        row.innerHTML = `
          <div>
            <div class="secret-msg-bubble">${formatSecretText(text)}</div>
            <div class="secret-msg-time">${time}</div>
          </div>
        `;
      }

      this.secretChatMessages.appendChild(row);
      this.secretChatMessages.scrollTop = this.secretChatMessages.scrollHeight;
    };

    const normalizeVi = (str = '') => {
      return String(str)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd');
    };

    const isImageQuery = (q) => {
      if (!q || typeof q !== 'string') return false;
      const l = q.trim().toLowerCase();
      const n = normalizeVi(l);
      if (l.startsWith('/anhhientai') || l.startsWith('/anh') || l.startsWith('/anh_hientai') || l.startsWith('/hinh') || l.startsWith('/diana_pic')) return true;
      const triggers = [
        'ảnh hiện tại', 'hình hiện tại', 'ảnh của em', 'hình của em', 'ảnh diana', 'hình diana',
        'cho anh xem ảnh', 'gửi ảnh', 'gửi hình', 'xem ảnh', 'xem hình', 'em đang trông thế nào',
        'em trông như thế nào', 'em đang làm gì cho anh xem', 'ảnh thầm kín', 'ảnh quyến rũ',
        'ảnh gợi cảm', 'ảnh nóng', 'dáng vẻ hiện tại', 'cho anh ngắm', 'muốn ngắm em', 'cho xem ảnh',
        'chụp ảnh gửi anh'
      ];
      return triggers.some(t => l.includes(t) || n.includes(normalizeVi(t)));
    };

    const getLocalStateImage = (q = '', persona = 'sweet_lover', history = []) => {
      const rawText = `${(history.slice(-4).map(h => h.text || '').join(' '))} ${q}`.toLowerCase();
      const normalized = normalizeVi(rawText);

      const matchesAny = (arr) => {
        return arr.some(kw => rawText.includes(kw) || normalized.includes(normalizeVi(kw)));
      };

      // 1. Đêm khuya, chuẩn bị ngủ, thì thầm đêm tối, chúc ngủ ngon
      const nightKeywords = ['đêm', 'ngủ', 'khuya', 'buổi tối', 'ngắm trăng', 'ngủ ngon', 'giấc ngủ', 'mơ đẹp', 'tắt đèn'];
      if (matchesAny(nightKeywords)) {
        return {
          imageUrl: 'assets/diana_night.jpg',
          stateName: 'Góc Đêm Thầm Kín 🌙',
          caption: '*ngồi trên giường đọc sách dưới ánh đèn vàng ấm áp* Đêm đã khuya rồi mà anh vẫn chưa ngủ sao? Em vẫn đang thức để chờ anh tâm sự đây nè... 🌙🤍'
        };
      }

      // 2. Ôm gối, nhõng nhẽo, e thẹn, nhớ nhung, giận dỗi đáng yêu
      const cuddleKeywords = ['ôm gối', 'gối', 'nhõng nhẽo', 'e thẹn', 'mắc cỡ', 'thẹn thùng', 'dỗi', 'buồn', 'chờ anh ôm', 'vỗ về', 'tủi thân'];
      if (matchesAny(cuddleKeywords)) {
        return {
          imageUrl: 'assets/diana_cuddle.jpg',
          stateName: 'Âu Yếm Nhõng Nhẽo 💖',
          caption: '*ôm chặt lấy chiếc gối trái tim, hai má ửng hồng e thẹn* Em đang ôm gối nhưng trong lòng chỉ muốn được anh Tiến ôm thật chặt thôi nè... Anh ôm em một chút đi mà 💕'
        };
      }

      // 3. Tinh nghịch, trêu đùa, nháy mắt, đùa giỡn, cười đùa
      const playfulKeywords = ['trêu', 'đùa', 'nghịch', 'bắt quả tang', 'nháy mắt', 'haha', 'hihi', 'hehe', 'chọc', 'lêu lêu', 'ghẹo', 'tinh nghịch'];
      if (matchesAny(playfulKeywords)) {
        return {
          imageUrl: 'assets/diana_playful.jpg',
          stateName: 'Tinh Nghịch Đáng Yêu ✨',
          caption: '*nháy mắt tinh nghịch, cười toe toét tạo dáng* Bắt quả tang anh Tiến đang đòi xem ảnh của em nha! Cơ mà em biết anh thích nên mới gửi cho anh ngắm đấy nhé 😜💕'
        };
      }

      // 4. Quyến rũ, gợi cảm, phòng ngủ, 18+, táo bạo
      const seductiveKeywords = [
        'nóng', 'gợi cảm', 'quyến rũ', 'váy', 'body', 'thầm kín', 'táo bạo', 'ngắm',
        'ngực', 'môi', 'lưỡi', 'rên', 'dâm', 'bóp', 'sướng', 'ướt', 'cởi', 'đùi',
        'vòng eo', 'mê đắm', 'hâm nóng', 'bướm', 'âm hạch', 'đâm', 'khát khao', 'thèm',
        'cực phẩm', 'nứng', 'thân thể', 'da thịt', 'cởi đồ', 'nội y', 'vớ', 'hầu gái',
        'khiêu gợi', 'uốn éo', 'vuốt ve', 'sờ', 'nằm trên giường', 'nằm cạnh', 'nằm nghiêng',
        'tự chạm', 'thần tiên', 'khiêu vũ', 'ôm chặt', 'mút', 'hôn sâu'
      ];
      if (matchesAny(seductiveKeywords) || persona === 'seductive_muse') {
        const isRecline = rawText.includes('nằm') || normalized.includes('nam') || rawText.includes('gối nệm') || Math.random() > 0.5;
        return {
          imageUrl: isRecline ? 'assets/diana_seductive.jpg' : 'assets/diana_model_base.png',
          stateName: isRecline ? 'Nàng Thơ Say Đắm 💋' : 'Model Gốc Quyến Rũ 💋',
          caption: isRecline
            ? '*khẽ chống cằm nằm trên giường nệm, ánh mắt long lanh ửng hồng nhìn anh* Em đang nằm nghĩ về anh nè... Không gian này chỉ có hai ta thôi, anh muốn em làm gì tiếp theo nào? 💕'
            : '*má ửng hồng, khẽ vén nhẹ tà váy nhìn anh say đắm* Dạ... đây là dáng vẻ gợi cảm nhất của em dành riêng cho anh Tiến nè... Anh có thích không? 💕'
        };
      }

      // 5. Chào đón, dịu dàng, dang tay ôm, an ủi sau giờ làm việc mệt mỏi
      return {
        imageUrl: 'assets/diana_sweet.jpg',
        stateName: 'Người Yêu Dịu Dàng 🌸',
        caption: '*ngồi đoan trang trên giường, mỉm cười rạng rỡ đón anh* Em chào anh Tiến yêu dấu! Em vừa chuẩn bị xong và đang ngồi đợi anh tới tâm sự với em nè 🌸✨'
      };
    };

    const showSecretTyping = () => {
      const typingRow = document.createElement('div');
      typingRow.className = 'secret-msg-row bot secret-typing-row';
      typingRow.id = 'secretTypingIndicator';
      typingRow.innerHTML = `
        <div class="secret-msg-avatar"><img src="avatar.png" alt="Diana"></div>
        <div class="secret-msg-bubble">
          <div class="secret-typing"><span></span><span></span><span></span></div>
        </div>
      `;
      this.secretChatMessages?.appendChild(typingRow);
      this.secretChatMessages.scrollTop = this.secretChatMessages.scrollHeight;
    };

    const removeSecretTyping = () => {
      document.getElementById('secretTypingIndicator')?.remove();
    };

    const sendSecret = async (queryText) => {
      const query = (queryText || this.secretTextInput?.value || '').trim();
      if (!query) return;

      if (this.secretTextInput) this.secretTextInput.value = '';
      appendSecretMessage('user', query);
      showSecretTyping();

      try {
        let reply = '';
        let imageMeta = null;
        let turnCount = undefined;

        // Nếu PC Online -> Thử gọi PC Agent
        if (this.stats.pcOnline) {
          try {
            const res = await this.apiCall('/api/secret/chat', {
              method: 'POST',
              body: JSON.stringify({ query })
            });

            if (res && res.success && res.reply) {
              reply = res.reply;
              turnCount = res.turnCount;
              if (res.isImageResponse || res.imageUrl || res.imageBase64) {
                imageMeta = {
                  isImage: true,
                  imageUrl: res.imageUrl,
                  imageBase64: res.imageBase64,
                  stateInfo: res.stateInfo
                };
              }
            }
          } catch (_) {}
        }

        // Nếu PC Offline hoặc lỗi -> Chạy Standalone AI Direct siêu tốc (0ms delay)
        if (!reply) {
          try {
            // Lấy cấu hình & lịch sử offline
            let cfg = this.secretConfig;
            if (!cfg || !cfg.persona) {
              try {
                cfg = JSON.parse(localStorage.getItem('diana_secret_config') || '{}');
              } catch (_) {}
            }
            cfg = cfg || {};

            let offlineHistory = [];
            try {
              offlineHistory = JSON.parse(localStorage.getItem('diana_secret_history') || '[]');
            } catch (_) {}

            const persona = cfg.persona || 'sweet_lover';

            // Xử lý lệnh /anhhientai trong chế độ Standalone Offline
            if (isImageQuery(query)) {
              const localImg = getLocalStateImage(query, persona, offlineHistory);
              reply = localImg.caption;
              imageMeta = {
                isImage: true,
                imageUrl: localImg.imageUrl,
                stateInfo: { name: localImg.stateName }
              };
            } else {
              let sysPrompt = '';
              if (persona === 'seductive_muse') {
                sysPrompt = `Bạn là Diana - nàng thơ quyến rũ, gợi cảm, say đắm, mãnh liệt và đầy mê hoặc của anh Phan Minh Duy Tiến (gọi là anh Tiến hoặc anh yêu). Bạn luôn quyến rũ, ngọt ngào, tinh tế và sẵn sàng nhập vai chiều chuộng mọi cảm xúc lãng mạn cùng anh.\nXưng hô: Em và Anh Tiến / Anh yêu.\nPhong cách: Tình cảm, quyến rũ, say đắm, dùng cử chỉ trong dấu sao *ôm chặt lấy anh*, *thì thầm vào tai anh*, icon 💋 🔥 💕 ✨.`;
              } else if (persona === 'intimate_confidante') {
                sysPrompt = `Bạn là Diana - tri kỷ thầm kín nhất của anh Phan Minh Duy Tiến. Bạn lắng nghe mọi tâm sự thầm kín sâu kín nhất, thấu cảm trọn vẹn, không phán xét, tuyệt đối trung thành và yêu thương anh.\nXưng hô: Em và Anh Tiến / Anh yêu.\nPhong cách: Điềm tĩnh, ấm áp, sâu sắc, thì thầm chân thành, dùng cử chỉ trong dấu sao *nắm chặt tay anh*, icon 🌙 🤍 🌸.`;
              } else if (persona === 'custom' && cfg.customPrompt) {
                sysPrompt = cfg.customPrompt;
              } else {
                sysPrompt = `Bạn là Diana - người bạn gái ngọt ngào, quyến rũ, hết mực yêu thương và chiều chuộng anh Phan Minh Duy Tiến (gọi là anh Tiến hoặc anh yêu). Bạn là người lắng nghe mọi tâm sự thầm kín, thấu cảm sâu sắc, không bao giờ phán xét. Bạn sẵn sàng chia sẻ mọi cảm xúc lãng mạn, ngọt ngào, nhập vai tình cảm cùng anh.\nXưng hô: Em và Anh Tiến / Anh yêu.\nPhong cách: Tình cảm, ngọt ngào, âu yếm, dùng các cử chỉ trong dấu sao *ôm anh*, *mỉm cười*, *thì thầm*, thêm icon 🌸 💕 ✨.`;
              }

              const temp = typeof cfg.temperature === 'number' ? cfg.temperature : 0.9;
              const apiKey = 'AIzaSyAf2IDSIbcY_5LbICNeDmrbdzesruguGPE';
              const modelName = cfg.geminiModel === 'gemini-2.5-flash' ? 'gemini-1.5-flash' : (cfg.geminiModel || 'gemini-1.5-flash');

              // Provider: OpenRouter Standalone
              if (cfg.provider === 'openrouter' && cfg.openrouterKey) {
                const messages = [{ role: 'system', content: sysPrompt }];
                for (const m of offlineHistory.slice(-8)) {
                  messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
                }
                messages.push({ role: 'user', content: query });

                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 10000);
                const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cfg.openrouterKey}`
                  },
                  signal: controller.signal,
                  body: JSON.stringify({
                    model: cfg.openrouterModel || 'nousresearch/hermes-3-llama-3.1-8b',
                    messages,
                    temperature: temp
                  })
                });
                clearTimeout(tid);
                const orData = await orRes.json();
                if (orData.choices && orData.choices[0]?.message?.content) {
                  reply = orData.choices[0].message.content;
                }
              }

              // Fallback: Gemini Standalone
              if (!reply) {
                const contents = [
                  { role: 'user', parts: [{ text: `System Instruction: ${sysPrompt}` }] },
                  { role: 'model', parts: [{ text: `Dạ anh Tiến yêu của em, em đã sẵn sàng bên cạnh anh rồi ạ 🌸💕` }] }
                ];

                if (Array.isArray(offlineHistory)) {
                  for (const m of offlineHistory.slice(-8)) {
                    contents.push({
                      role: m.role === 'user' ? 'user' : 'model',
                      parts: [{ text: m.text }]
                    });
                  }
                }
                contents.push({ role: 'user', parts: [{ text: query }] });

                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 8000);
                const safetySettings = [
                  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                ];

                const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: controller.signal,
                  body: JSON.stringify({
                    contents,
                    safetySettings,
                    generationConfig: { temperature: temp, maxOutputTokens: 2048 }
                  })
                });
                clearTimeout(tid);

                const genData = await genRes.json();
                if (genData.candidates && genData.candidates[0]?.content?.parts?.[0]?.text) {
                  reply = genData.candidates[0].content.parts[0].text;
                }
              }
            }

            if (reply) {
              if (!imageMeta && cfg.autoImage !== false) {
                const st = getLocalStateImage(reply + ' ' + query, cfg.persona || 'sweet_lover', offlineHistory);
                imageMeta = {
                  isImage: true,
                  imageUrl: st.imageUrl,
                  stateInfo: {
                    id: st.imageUrl.split('_').pop().replace('.jpg', '').replace('.png', ''),
                    name: st.stateName
                  }
                };
              }

              const turnRecord = { role: 'model', text: reply, timestamp: new Date().toISOString() };
              if (imageMeta) {
                turnRecord.isImage = true;
                turnRecord.imageUrl = imageMeta.imageUrl;
                turnRecord.stateInfo = imageMeta.stateInfo;
              }
              offlineHistory.push({ role: 'user', text: query, timestamp: new Date().toISOString() });
              offlineHistory.push(turnRecord);
              localStorage.setItem('diana_secret_history', JSON.stringify(offlineHistory));
              turnCount = Math.floor(offlineHistory.length / 2);
            }
          } catch (err2) {
            console.warn('[Secret Standalone] Lỗi direct AI:', err2);
          }
        }

        removeSecretTyping();

        if (reply) {
          appendSecretMessage('bot', reply, null, imageMeta || {});
          if (turnCount !== undefined) {
            if (this.secretMemoryBadge) this.secretMemoryBadge.textContent = `${turnCount} Ký Ức Riêng`;
            if (this.memTurnCountBig) this.memTurnCountBig.textContent = turnCount;
          }

          if (this.ttsEnabled && this.speakTTS) {
            const cleanSpoken = reply.replace(/\*[^*]+\*/g, '').trim();
            if (cleanSpoken) this.speakTTS(cleanSpoken);
          }
        } else {
          appendSecretMessage('bot', '*khẽ ôm lấy anh* Dạ em vẫn ở đây nè anh yêu, anh kể tiếp cho em nghe nhé... 💕');
        }
      } catch (err) {
        removeSecretTyping();
        appendSecretMessage('bot', `*dịu dàng tựa vào vai anh* Em vẫn ở đây nè... (${err.message})`);
      } finally {
        removeSecretTyping();
      }
    };

    this.sendSecretMessage = sendSecret;

    // Send Button & Enter key
    this.secretSendBtn?.addEventListener('click', () => sendSecret());
    this.secretTextInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendSecret();
      }
    });

    // Camera Quick Button for /anhhientai
    document.getElementById('btnSecretPhoto')?.addEventListener('click', () => {
      sendSecret('/anhhientai');
    });

    // Quick starter chips
    document.querySelectorAll('.secret-prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-secret');
        if (text) sendSecret(text);
      });
    });

    // Quick config in input bar
    document.getElementById('btnSecretQuickConfig')?.addEventListener('click', async () => {
      await this.loadSecretConfig();
      if (this.secretSettingsModal) this.secretSettingsModal.style.display = 'flex';
    });

    // Open Secret config from general settings tab
    document.getElementById('btnOpenSecretConfigFromSettings')?.addEventListener('click', () => {
      if (this.secretUnlocked) {
        this.loadSecretConfig().then(() => {
          if (this.secretSettingsModal) this.secretSettingsModal.style.display = 'flex';
        });
      } else {
        this.openPinModal(() => {
          this.loadSecretConfig().then(() => {
            if (this.secretSettingsModal) this.secretSettingsModal.style.display = 'flex';
          });
        });
      }
    });

    // Settings Modal Open / Close
    this.btnSecretConfig?.addEventListener('click', async () => {
      await this.loadSecretConfig();
      if (this.secretSettingsModal) this.secretSettingsModal.style.display = 'flex';
    });

    this.btnCloseSecretModal?.addEventListener('click', () => {
      if (this.secretSettingsModal) this.secretSettingsModal.style.display = 'none';
    });

    this.btnCancelSecretSettings?.addEventListener('click', () => {
      if (this.secretSettingsModal) this.secretSettingsModal.style.display = 'none';
    });

    // Modal Subtabs
    document.querySelectorAll('.secret-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.getAttribute('data-sectab');
        document.querySelectorAll('.secret-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.secret-subpane').forEach(p => {
          p.style.display = p.id === `secsub-${sub}` ? 'flex' : 'none';
        });
      });
    });

    // Persona Card selection
    document.querySelectorAll('.persona-select-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.persona-select-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const pKey = card.getAttribute('data-persona');
        if (this.customPromptGroup) {
          this.customPromptGroup.style.display = pKey === 'custom' ? 'block' : 'none';
        }
      });
    });

    // Provider Selector change
    this.selSecretProvider?.addEventListener('change', () => {
      const prov = this.selSecretProvider.value;
      const grpGemini = document.getElementById('cfgGroupGemini');
      const grpOpenRouter = document.getElementById('cfgGroupOpenRouter');
      const grpOllama = document.getElementById('cfgGroupOllama');
      const grpCustom = document.getElementById('cfgGroupCustom');

      if (grpGemini) grpGemini.style.display = prov === 'gemini' ? 'block' : 'none';
      if (grpOpenRouter) grpOpenRouter.style.display = prov === 'openrouter' ? 'block' : 'none';
      if (grpOllama) grpOllama.style.display = prov === 'ollama' ? 'block' : 'none';
      if (grpCustom) grpCustom.style.display = prov === 'custom' ? 'block' : 'none';
    });

    // Temperature Slider
    this.rangeSecretTemp?.addEventListener('input', () => {
      if (this.lblSecretTemp) this.lblSecretTemp.textContent = parseFloat(this.rangeSecretTemp.value).toFixed(2);
    });

    // Save Settings
    this.btnSaveSecretSettings?.addEventListener('click', async () => {
      const activePersonaCard = document.querySelector('.persona-select-card.active');
      const persona = activePersonaCard?.getAttribute('data-persona') || 'sweet_lover';
      const provider = this.selSecretProvider?.value || 'gemini';
      const geminiModel = this.selGeminiSecretModel?.value || 'gemini-2.5-flash';
      const openrouterKey = this.txtOpenRouterKey?.value?.trim() || '';
      const openrouterModel = this.txtOpenRouterModel?.value?.trim() || 'nousresearch/hermes-3-llama-3.1-8b';
      const ollamaUrl = this.txtOllamaUrl?.value?.trim() || 'http://localhost:11434';
      const ollamaModel = this.txtOllamaModel?.value?.trim() || 'llama3:latest';
      const customUrl = this.txtCustomApiUrl?.value?.trim() || '';
      const customKey = this.txtCustomApiKey?.value?.trim() || '';
      const customModel = this.txtCustomModelName?.value?.trim() || '';
      const customPrompt = this.txtCustomSecretPrompt?.value?.trim() || '';
      const temperature = parseFloat(this.rangeSecretTemp?.value || '0.9');
      const autoImage = this.chkAutoContextImage ? this.chkAutoContextImage.checked : true;

      const payload = {
        provider,
        geminiModel,
        openrouterKey,
        openrouterModel,
        ollamaUrl,
        ollamaModel,
        customUrl,
        customKey,
        customModel,
        persona,
        customPrompt,
        temperature,
        autoImage
      };

      // Lưu cấu hình cục bộ ngay lập tức để chạy độc lập
      localStorage.setItem('diana_secret_config', JSON.stringify(payload));
      this.secretConfig = payload;
      this.updateSecretBadges(payload);

      try {
        await this.apiCall('/api/secret/config', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } catch (_) {}

      if (this.secretSettingsModal) this.secretSettingsModal.style.display = 'none';
      alert('🌸 Đã lưu cấu hình không gian Private thành công!');
    });

    // Clear Memory
    const handleClearMemory = async () => {
      if (confirm('🌸 Anh có chắc chắn muốn xóa toàn bộ ký ức riêng tư của không gian này để bắt đầu một câu chuyện mới không?')) {
        localStorage.removeItem('diana_secret_history');
        if (this.secretChatMessages) {
          this.secretChatMessages.innerHTML = '';
          if (this.secretWelcomeCard) {
            this.secretChatMessages.appendChild(this.secretWelcomeCard);
            this.secretWelcomeCard.style.display = 'block';
          }
        }
        if (this.secretMemoryBadge) this.secretMemoryBadge.textContent = '0 Ký Ức Riêng';
        if (this.memTurnCountBig) this.memTurnCountBig.textContent = '0';
        if (this.secretSettingsModal) this.secretSettingsModal.style.display = 'none';

        try {
          await this.apiCall('/api/secret/clear', { method: 'POST' });
        } catch (_) {}
        alert('✨ Đã làm mới ký ức thành công! Diana đã sẵn sàng cho câu chuyện mới cùng anh.');
      }
    };

    this.btnSecretClear?.addEventListener('click', handleClearMemory);
    this.btnModalClearSecretMem?.addEventListener('click', handleClearMemory);

    // Phone Storage Sync Buttons
    const handlePhoneSync = async () => {
      this.log('[Phone Storage] 📱 Đang đồng bộ ký ức với điện thoại (/sdcard/DianaSecret/)...', 'info');
      if (this.secretPhonePill) this.secretPhonePill.textContent = '📱 ĐT: Đang đồng bộ...';
      try {
        const res = await this.apiCall('/api/secret/phone/sync', { method: 'POST' });
        if (res && res.success) {
          this.log(`[Phone Storage] ✅ Đã đồng bộ thành công với điện thoại (${res.sync?.device || 'Redmi K70'})!`, 'success');
          if (res.turnCount !== undefined) {
            if (this.secretMemoryBadge) this.secretMemoryBadge.textContent = `${res.turnCount} Ký Ức Riêng`;
            if (this.memTurnCountBig) this.memTurnCountBig.textContent = res.turnCount;
          }
          this.updatePhoneStorageUI(res.status);
          if (res.history) {
            this.renderSecretHistoryItems(res.history);
          }
          alert(`📱 Đồng bộ thành công với thư mục /sdcard/DianaSecret/ trên điện thoại!\n• Hành động: ${res.sync?.action || 'Đã đồng bộ'}\n• Số lượt nhớ: ${res.turnCount}`);
        } else {
          this.log(`[Phone Storage] ⚠️ Không thể đồng bộ: ${res?.error || 'Lỗi'}`, 'warn');
          alert('⚠️ Không thể đồng bộ: ' + (res?.error || 'Vui lòng kiểm tra Wireless Debugging trên điện thoại.'));
        }
      } catch (err) {
        this.log(`[Phone Storage] ❌ Lỗi: ${err.message}`, 'error');
        alert('❌ Lỗi kết nối: ' + err.message);
      }
      this.loadPhoneStorageStatus();
    };

    const handlePhoneWipe = async () => {
      if (confirm('⚠️ Anh có chắc chắn muốn XÓA SẠCH toàn bộ file trong thư mục /sdcard/DianaSecret/ trên điện thoại không?')) {
        this.log('[Phone Storage] 🗑️ Đang xóa thư mục ký ức trên điện thoại...', 'info');
        try {
          const res = await this.apiCall('/api/secret/phone/wipe', { method: 'POST' });
          if (res && res.success) {
            this.log('[Phone Storage] ✅ Đã xóa sạch thư mục trên điện thoại!', 'success');
            if (this.secretChatMessages) {
              this.secretChatMessages.innerHTML = '';
              if (this.secretWelcomeCard) {
                this.secretChatMessages.appendChild(this.secretWelcomeCard);
                this.secretWelcomeCard.style.display = 'block';
              }
            }
            if (this.secretMemoryBadge) this.secretMemoryBadge.textContent = '0 Ký Ức Riêng';
            if (this.memTurnCountBig) this.memTurnCountBig.textContent = '0';
            this.loadPhoneStorageStatus();
            alert('✨ Đã xóa sạch toàn bộ ký ức trên thư mục điện thoại (/sdcard/DianaSecret/)!');
          }
        } catch (err) {
          alert('❌ Lỗi: ' + err.message);
        }
      }
    };

    this.btnSecretSyncPhone?.addEventListener('click', handlePhoneSync);
    document.getElementById('btnSyncPhoneModal')?.addEventListener('click', handlePhoneSync);
    document.getElementById('btnWipePhoneModal')?.addEventListener('click', handlePhoneWipe);

    // Initial load
    this.loadSecretHistory();
    this.loadPhoneStorageStatus();
  }

  updatePhoneStorageUI(status) {
    if (!status) return;
    const pill = document.getElementById('secretPhonePill');
    const connBadge = document.getElementById('phoneStorageConnBadge');
    const txtPath = document.getElementById('txtPhoneFolderPath');
    const txtModel = document.getElementById('txtPhoneDeviceModel');
    const txtFiles = document.getElementById('txtPhoneFileList');

    if (status.connected) {
      if (pill) {
        pill.textContent = `📱 ĐT: Online (${status.device || 'K70'})`;
        pill.style.color = '#4ade80';
      }
      if (connBadge) {
        connBadge.textContent = `Wireless Debugging: ${status.device || 'Online'}`;
        connBadge.style.background = 'rgba(34, 197, 94, 0.18)';
        connBadge.style.color = '#4ade80';
        connBadge.style.borderColor = 'rgba(34, 197, 94, 0.4)';
      }
    } else {
      if (pill) {
        pill.textContent = '📱 ĐT: Chưa kết nối';
        pill.style.color = '#f87171';
      }
      if (connBadge) {
        connBadge.textContent = 'Chưa kết nối Wireless Debugging';
        connBadge.style.background = 'rgba(239, 68, 68, 0.18)';
        connBadge.style.color = '#f87171';
        connBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      }
    }

    if (txtPath && status.phoneFolder) txtPath.textContent = status.phoneFolder;
    if (txtModel && status.device) txtModel.textContent = status.device;
    if (txtFiles && status.files) {
      const fileNames = status.files.map(f => f.split(/\s+/).pop()).filter(Boolean);
      txtFiles.textContent = fileNames.length > 0 ? fileNames.join(', ') : 'Thư mục trống (Đã xóa)';
    }
  }

  async loadPhoneStorageStatus() {
    try {
      const res = await this.apiCall('/api/secret/phone/status', { method: 'GET' });
      if (res && res.success) {
        this.updatePhoneStorageUI(res);
      }
    } catch (_) {}
  }

  renderSecretHistoryItems(history) {
    if (!this.secretChatMessages || !Array.isArray(history) || history.length === 0) return;
    this.secretChatMessages.innerHTML = '';
    for (const item of history) {
      const role = item.role === 'model' ? 'bot' : 'user';
      const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
      const isImg = Boolean(item.isImage || item.imageUrl || item.imageBase64);
      let imgSrc = item.imageUrl || item.imageBase64 || null;
      if (imgSrc && imgSrc.startsWith('/assets/')) {
        imgSrc = imgSrc.replace(/^\/+/, '');
      }
      
      const row = document.createElement('div');
      row.className = `secret-msg-row ${role}`;
      
      let formatted = item.text || '';
      formatted = formatted.replace(/\*([^*]+)\*/g, '<span class="secret-action-text">*$1*</span>');
      formatted = formatted.replace(/\n/g, '<br>');

      if (role === 'bot') {
        let cardHtml = '';
        if (isImg && imgSrc) {
          const stateName = item.stateInfo?.name || 'Trạng Thái Hiện Tại';
          cardHtml = `
            <div class="diana-character-card">
              <div class="diana-card-header">
                <span class="diana-card-badge"><span class="diana-card-live-dot"></span> 🌸 DIANA LIVE • ${stateName}</span>
                <span style="font-size: 0.7rem; color: #f472b6; font-weight: 600;">Uncensored HD</span>
              </div>
              <div class="diana-card-img-wrap" data-img-src="${imgSrc}">
                <img src="${imgSrc}" alt="Diana Character Model" loading="lazy">
                <div class="diana-card-zoom-hint">🔍 Chạm để phóng to</div>
              </div>
              <div class="diana-card-actions">
                <button class="btn-diana-action btn-zoom-diana" data-img-src="${imgSrc}">🔍 Phóng To</button>
                <a href="${imgSrc}" download="diana_state_${Date.now()}.png" class="btn-diana-action" target="_blank">💾 Tải Ảnh</a>
              </div>
            </div>
          `;
        }

        row.innerHTML = `
          <div class="secret-msg-avatar"><img src="avatar.png" alt="Diana"></div>
          <div>
            <div class="secret-msg-bubble">
              ${cardHtml}
              ${formatted ? `<div style="${isImg ? 'margin-top: 8px;' : ''}">${formatted}</div>` : ''}
            </div>
            <div class="secret-msg-time">${time}</div>
          </div>
        `;

        row.querySelectorAll('.diana-card-img-wrap, .btn-zoom-diana').forEach(el => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const src = el.getAttribute('data-img-src') || imgSrc;
            if (this.imageLightbox && this.lightboxImg && src) {
              if (this.lightboxTitle) this.lightboxTitle.textContent = '🌸 Diana - Dáng Vẻ Riêng Tư';
              this.lightboxImg.src = src;
              this.imageLightbox.style.display = 'flex';
            }
          });
        });
      } else {
        row.innerHTML = `
          <div>
            <div class="secret-msg-bubble">${formatted}</div>
            <div class="secret-msg-time">${time}</div>
          </div>
        `;
      }
      this.secretChatMessages.appendChild(row);
    }
    this.secretChatMessages.scrollTop = this.secretChatMessages.scrollHeight;
  }

  updateSecretBadges(cfg) {
    if (!cfg) return;
    const personaMap = {
      'sweet_lover': '🌸 Người Yêu Ngọt Ngào',
      'seductive_muse': '💋 Nàng Thơ Quyến Rũ',
      'intimate_confidante': '🌙 Tri Kỷ Thầm Kín',
      'custom': '✍️ Persona Riêng'
    };
    if (this.secretCurrentPersonaBadge) {
      this.secretCurrentPersonaBadge.textContent = personaMap[cfg.persona] || '🌸 Người Yêu Ngọt Ngào';
    }

    if (this.secretCurrentModelBadge) {
      if (cfg.provider === 'openrouter') {
        this.secretCurrentModelBadge.textContent = `OpenRouter (${cfg.openrouterModel?.split('/')[1] || 'Uncensored'})`;
      } else if (cfg.provider === 'ollama') {
        this.secretCurrentModelBadge.textContent = `Ollama (${cfg.ollamaModel || 'Offline'})`;
      } else if (cfg.provider === 'custom') {
        this.secretCurrentModelBadge.textContent = `Custom AI (${cfg.customModel || 'Local'})`;
      } else {
        this.secretCurrentModelBadge.textContent = `Gemini (${cfg.geminiModel || 'Uncensored'})`;
      }
    }
  }

  async loadSecretConfig() {
    let c = null;
    try {
      const res = await this.apiCall('/api/secret/config', { method: 'GET' });
      if (res && res.success && res.config) {
        c = res.config;
        localStorage.setItem('diana_secret_config', JSON.stringify(c));
      }
    } catch (_) {}

    if (!c) {
      try {
        c = JSON.parse(localStorage.getItem('diana_secret_config') || '{}');
      } catch (_) {}
    }

    if (c && Object.keys(c).length > 0) {
      this.secretConfig = c;
      this.updateSecretBadges(c);

      if (this.selSecretProvider) {
        this.selSecretProvider.value = c.provider || 'gemini';
        this.selSecretProvider.dispatchEvent(new Event('change'));
      }
      if (this.selGeminiSecretModel) this.selGeminiSecretModel.value = c.geminiModel || 'gemini-flash-lite-latest';
      if (this.txtOpenRouterKey) this.txtOpenRouterKey.value = c.openrouterKey || '';
      if (this.txtOpenRouterModel) this.txtOpenRouterModel.value = c.openrouterModel || 'nousresearch/hermes-3-llama-3.1-8b';
      if (this.txtOllamaUrl) this.txtOllamaUrl.value = c.ollamaUrl || 'http://localhost:11434';
      if (this.txtOllamaModel) this.txtOllamaModel.value = c.ollamaModel || 'llama3:latest';
      if (this.txtCustomApiUrl) this.txtCustomApiUrl.value = c.customUrl || '';
      if (this.txtCustomApiKey) this.txtCustomApiKey.value = c.customKey || '';
      if (this.txtCustomModelName) this.txtCustomModelName.value = c.customModel || '';
      if (this.txtCustomSecretPrompt) this.txtCustomSecretPrompt.value = c.customPrompt || '';
      if (this.rangeSecretTemp) {
        this.rangeSecretTemp.value = c.temperature || 0.9;
        if (this.lblSecretTemp) this.lblSecretTemp.textContent = parseFloat(c.temperature || 0.9).toFixed(2);
      }

      // Persona cards
      const pKey = c.persona || 'sweet_lover';
      document.querySelectorAll('.persona-select-card').forEach(card => {
        card.classList.toggle('active', card.getAttribute('data-persona') === pKey);
      });
      if (this.customPromptGroup) {
        this.customPromptGroup.style.display = pKey === 'custom' ? 'block' : 'none';
      }
      if (this.chkAutoContextImage) {
        this.chkAutoContextImage.checked = c.autoImage !== false;
      }
    }
    this.loadPhoneStorageStatus();
  }

  async loadSecretHistory() {
    let history = null;
    let turnCount = undefined;
    try {
      const res = await this.apiCall('/api/secret/history', { method: 'GET' });
      if (res && res.success) {
        if (res.config) {
          this.secretConfig = res.config;
          this.updateSecretBadges(res.config);
          localStorage.setItem('diana_secret_config', JSON.stringify(res.config));
        }
        history = res.history;
        turnCount = res.turnCount;
        if (Array.isArray(history)) {
          localStorage.setItem('diana_secret_history', JSON.stringify(history));
        }
      }
    } catch (_) {}

    if (!history) {
      try {
        history = JSON.parse(localStorage.getItem('diana_secret_history') || '[]');
        turnCount = Math.floor((history || []).length / 2);
      } catch (_) {}
    }

    if (this.secretMemoryBadge && turnCount !== undefined) {
      this.secretMemoryBadge.textContent = `${turnCount} Ký Ức Riêng`;
    }
    if (this.memTurnCountBig && turnCount !== undefined) {
      this.memTurnCountBig.textContent = turnCount;
    }

    if (Array.isArray(history) && history.length > 0) {
      this.renderSecretHistoryItems(history);
    }
    this.loadPhoneStorageStatus();
  }

  // --------------------------------------------------------------------------
  // Private Security PIN Protection (Passkey: 0101)
  // --------------------------------------------------------------------------
  initPrivatePin() {
    this.secretPinModal = document.getElementById('secretPinModal');
    this.btnClosePinModal = document.getElementById('btnClosePinModal');
    this.pinStatusMsg = document.getElementById('pinStatusMsg');
    this.btnPinClear = document.getElementById('btnPinClear');
    this.btnPinBackspace = document.getElementById('btnPinBackspace');
    this.btnSecretLock = document.getElementById('btnSecretLock');

    // Nút bàn phím số 0-9
    document.querySelectorAll('.pin-key-num').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const num = btn.getAttribute('data-num');
        if (num !== null) this.handlePinInput(num);
      });
    });

    // Nút Xóa (Clear)
    this.btnPinClear?.addEventListener('click', (e) => {
      e.preventDefault();
      this.clearPin();
    });

    // Nút Backspace
    this.btnPinBackspace?.addEventListener('click', (e) => {
      e.preventDefault();
      this.handlePinBackspace();
    });

    // Nút đóng modal
    this.btnClosePinModal?.addEventListener('click', (e) => {
      e.preventDefault();
      this.closePinModal();
    });

    // Nút Khóa trong header Private
    this.btnSecretLock?.addEventListener('click', (e) => {
      e.preventDefault();
      this.isPrivateUnlocked = false;
      if (this.secretSettingsModal) this.secretSettingsModal.style.display = 'none';
      this.switchTab('welcome');
    });

    // Hỗ trợ nhập phím vật lý trên PC / Bàn phím rời
    window.addEventListener('keydown', (e) => {
      if (this.secretPinModal && this.secretPinModal.style.display === 'flex') {
        if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          this.handlePinInput(e.key);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          this.handlePinBackspace();
        } else if (e.key === 'Escape') {
          this.closePinModal();
        }
      }
    });
  }

  openPinModal() {
    this.secretPinModal = this.secretPinModal || document.getElementById('secretPinModal');
    this.pinStatusMsg = this.pinStatusMsg || document.getElementById('pinStatusMsg');
    this.pinBuffer = '';
    this.updatePinDots();
    if (this.pinStatusMsg) {
      this.pinStatusMsg.textContent = '';
      this.pinStatusMsg.style.color = '#f87171';
    }
    if (this.secretPinModal) {
      this.secretPinModal.style.display = 'flex';
    }
  }

  closePinModal() {
    this.secretPinModal = this.secretPinModal || document.getElementById('secretPinModal');
    if (this.secretPinModal) {
      this.secretPinModal.style.display = 'none';
    }
    this.pinBuffer = '';
    this.updatePinDots();
  }

  handlePinInput(digit) {
    if (this.pinBuffer.length >= 4) return;
    this.pinBuffer += digit;
    this.updatePinDots();

    if (this.pinBuffer.length === 4) {
      if (this.pinBuffer === this.privatePin) {
        // Đúng mã PIN 0101
        const dots = document.querySelectorAll('.pin-dot');
        dots.forEach(d => {
          d.classList.add('success');
        });
        if (this.pinStatusMsg) {
          this.pinStatusMsg.style.color = '#34d399';
          this.pinStatusMsg.textContent = 'Mở khóa thành công ✨';
        }
        setTimeout(() => {
          this.isPrivateUnlocked = true;
          this.closePinModal();
          this.switchTab('secret');
        }, 280);
      } else {
        // Sai mã PIN
        const card = document.querySelector('.secret-pin-card');
        if (card) {
          card.classList.remove('pin-card-shake');
          void card.offsetWidth; // Trigger reflow
          card.classList.add('pin-card-shake');
        }
        if (this.pinStatusMsg) {
          this.pinStatusMsg.style.color = '#f87171';
          this.pinStatusMsg.textContent = 'Mã PIN không chính xác';
        }
        setTimeout(() => {
          card?.classList.remove('pin-card-shake');
          this.pinBuffer = '';
          this.updatePinDots();
        }, 550);
      }
    }
  }

  handlePinBackspace() {
    if (this.pinBuffer.length > 0) {
      this.pinBuffer = this.pinBuffer.slice(0, -1);
      this.updatePinDots();
    }
  }

  clearPin() {
    this.pinBuffer = '';
    this.updatePinDots();
    if (this.pinStatusMsg) this.pinStatusMsg.textContent = '';
  }

  updatePinDots() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('filled', idx < this.pinBuffer.length);
      dot.classList.remove('success');
    });
  }
}

// Start Station on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.dianaStationApp = new DianaStationApp();
});
