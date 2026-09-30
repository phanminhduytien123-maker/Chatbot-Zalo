// ==========================================================================
// DIANA CENTRAL COMMAND STATION - UNIFIED CLIENT APPLICATION
// Cross-Platform: Desktop Electron, Android App, Mobile & Web Dashboard
// ==========================================================================

class DianaStationApp {
  constructor() {
    this.isDesktop = Boolean(window.dianaDesktop);
    this.hostServer = localStorage.getItem('diana_pc_host') || '';
    this.ttsEnabled = localStorage.getItem('diana_tts') !== 'false';
    this.autoDiscover = localStorage.getItem('diana_auto_discover') !== 'false';
    this.activeTab = 'welcome';
    this.isListening = false;
    this.isMirroring = false;
    this.isAirGestureActive = false;
    this.mediaRecorder = null;
    this.audioChunks = [];

    // Telemetry Stats
    this.stats = {
      cpu: 12,
      ram: 45,
      fps: 60.0,
      bitrate: 8.2,
      pcOnline: false,
      deviceIp: '192.168.100.148:5555'
    };

    // Candidates for LAN Auto-Discovery
    this.candidateHosts = [
      this.hostServer,
      'http://192.168.100.221:3000',
      'https://diana-h73u.onrender.com',
      'http://192.168.100.200:3000',
      'http://localhost:3000'
    ].filter(Boolean);

    this.initElements();
    this.initNavigation();
    this.initConstellationCanvas('welcomeCanvas', 'welcomeContainer', 'welcome');
    this.initConstellationCanvas('voiceCanvas', 'pane-voice', 'voice');
    this.initBiometricAuth();
    this.initHeroParallax();
    this.initDianaMascotPet();
    this.initCharts();
    this.initEventListeners();
    this.initVoiceAssistant();
    this.startTelemetryLoop();
    this.startMirrorStatusSync();
    this.startAirGestureStatusSync();

    // Initial PC Discovery
    this.discoverHost();
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
    this.btnToggleAirGesture = document.getElementById('btnToggleAirGesture');
    this.btnAirGestureText = document.getElementById('btnAirGestureText');
    this.btnQuickLock = document.getElementById('btnQuickLock');
    this.btnQuickSleep = document.getElementById('btnQuickSleep');
    this.btnQuickShot = document.getElementById('btnQuickShot');
    this.btnSideLaunchMirror = document.getElementById('btnSideLaunchMirror');
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
    this.btnPhoneTabStop = document.getElementById('btnPhoneTabStop');
    this.btnPhoneTabScan = document.getElementById('btnPhoneTabScan');
    this.phoneConnectStatus = document.getElementById('phoneConnectStatus');

    // PC Control Tab Elements
    this.btnExecAirGesture = document.getElementById('btnExecAirGesture');
    this.btnExecLock = document.getElementById('btnExecLock');
    this.btnExecSleep = document.getElementById('btnExecSleep');
    this.btnExecScreenshot = document.getElementById('btnExecScreenshot');
    this.btnExecShutdown = document.getElementById('btnExecShutdown');

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
    this.lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

    if (this.txtHostServer) this.txtHostServer.value = this.hostServer;
    if (this.chkTTS) this.chkTTS.checked = this.ttsEnabled;
    if (this.chkAutoDiscover) this.chkAutoDiscover.checked = this.autoDiscover;
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
      'logs': 'Nhật Ký (Logs)',
      'settings': 'Cài Đặt'
    };

    const switchTab = (tabId) => {
      if (!tabId) return;
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
      } else if (tabId === 'voice' || tabId === 'welcome') {
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 60);
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
    if (!welcomeContainer || !biometricOverlay) return;

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

    welcomeContainer.addEventListener('click', (e) => {
      if (this.activeTab !== 'welcome' || isAuthenticating) return;
      isAuthenticating = true;

      biometricOverlay.classList.add('active');
      welcomeHeroCard?.classList.add('scanning');

      playBiometricSound();

      setTimeout(() => {
        biometricOverlay.classList.remove('active');
        welcomeHeroCard?.classList.remove('scanning');
        this.switchTab('overview');
        isAuthenticating = false;
      }, 900);
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
  // 4. Host Discovery & API Client
  // --------------------------------------------------------------------------
  async discoverHost() {
    if (this.isDesktop) {
      this.updateStatus(true, 'PC Online');
      this.log('[System] Đang chạy trên ứng dụng Desktop Station nội bộ.', 'info');
      return 'desktop';
    }

    this.updateStatus(false, 'Đang dò tìm PC...');
    this.log('[Network] Bắt đầu tự động dò tìm máy chủ Diana...');

    for (const host of this.candidateHosts) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${host}/api/status`, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          this.hostServer = host;
          localStorage.setItem('diana_pc_host', host);
          if (this.txtHostServer) this.txtHostServer.value = host;
          if (this.tableGatewayHost) this.tableGatewayHost.textContent = host.replace('http://', '');
          this.updateStatus(true, 'PC Online');
          this.log(`[Network] ✅ Đã kết nối thành công tới máy chủ: ${host}`, 'success');
          return host;
        }
      } catch (_) {}
    }

    this.updateStatus(false, 'PC Offline');
    this.log('[Network] ⚠️ Chưa tìm thấy máy chủ PC trên mạng LAN. Bạn có thể nhập IP trong Cài Đặt.', 'warn');
    return null;
  }

  async apiCall(endpoint, options = {}) {
    if (this.isDesktop) {
      if (endpoint === '/api/phone/mirror/start' || endpoint.startsWith('/api/phone/mirror/start')) {
        let target = options.query?.target;
        if (!target && endpoint.includes('target=')) {
          const params = new URLSearchParams(endpoint.split('?')[1]);
          target = params.get('target');
        }
        return await window.dianaDesktop?.startPhoneMirror(target || '');
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
        const status = await window.dianaDesktop?.getMirrorStatus?.();
        if (status && status.mirrorActive) {
          return await window.dianaDesktop?.stopPhoneMirror();
        } else {
          return await window.dianaDesktop?.startPhoneMirror(target || '');
        }
      }
      if (endpoint === '/pc/action' || endpoint.includes('lock')) {
        return window.dianaDesktop?.lockPC();
      }
    }

    const host = this.hostServer || 'https://diana-h73u.onrender.com';
    const url = endpoint.startsWith('http') ? endpoint : `${host}${endpoint}`;
    
    const defaultHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const mergedOptions = {
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) }
    };

    try {
      const res = await fetch(url, mergedOptions);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        if (text.trim().startsWith('<')) {
          if (endpoint.includes('/mirror/toggle')) {
            const fallbackEndpoint = `/api/phone/mirror/start${endpoint.includes('?') ? '?' + endpoint.split('?')[1] : ''}`;
            const fallbackRes = await fetch(`${host}${fallbackEndpoint}`, mergedOptions);
            const fallbackText = await fallbackRes.text();
            try { return JSON.parse(fallbackText); } catch (_) {}
          }
          return { success: false, error: 'Máy chủ phản hồi trang web HTML thay vì dữ liệu JSON.' };
        }
        return { success: res.ok, message: text };
      }
    } catch (fetchErr) {
      return { success: false, error: fetchErr.message || 'Lỗi kết nối máy chủ.' };
    }
  }

  updateStatus(online, text) {
    this.stats.pcOnline = online;
    if (this.pcStatusBadge) {
      this.pcStatusBadge.className = `status-badge ${online ? 'online' : 'offline'}`;
    }
    if (this.pcStatusText) {
      this.pcStatusText.textContent = text || (online ? 'PC Online' : 'PC Offline');
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

  // --------------------------------------------------------------------------
  // 5. Hardware Telemetry & Real-Time Stats Loop
  // --------------------------------------------------------------------------
  startTelemetryLoop() {
    setInterval(async () => {
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
          const res = await this.apiCall('/api/status').catch(() => null);
          if (res) {
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
  updateMirrorUI(state, errorMsg) {
    const btnText = this.btnMirrorText;
    const headerBtn = this.btnHeaderMirror;
    const sideBtn = this.btnSideLaunchMirror;
    const connectBtn = this.btnPhoneTabConnect;
    const statusBox = this.phoneConnectStatus;
    const toolDot = this.btnToggleMirror?.querySelector('.tool-dot');

    switch (state) {
      case 'active':
        if (btnText) btnText.textContent = 'Dừng Chiếu (Đang Chạy)';
        if (headerBtn) { headerBtn.textContent = 'Dừng Chiếu'; headerBtn.classList.add('active'); }
        if (sideBtn) { sideBtn.textContent = 'Dừng Chiếu Màn Hình'; sideBtn.classList.add('active'); }
        if (connectBtn) { connectBtn.textContent = 'Dừng Chiếu Màn Hình'; connectBtn.classList.add('active'); }
        if (this.btnToggleMirror) this.btnToggleMirror.classList.add('active');
        if (statusBox) statusBox.innerHTML = `<p style="color:#84cc16;">✅ <strong>Đang chiếu trực tiếp màn hình điện thoại lên máy tính!</strong> Direct3D 11. Nhấn nút lần nữa để dừng.</p>`;
        if (toolDot) toolDot.style.background = '#4ade80';
        break;
      case 'connecting':
        if (btnText) btnText.textContent = 'Đang kết nối...';
        if (headerBtn) headerBtn.textContent = 'Đang kết nối...';
        if (connectBtn) connectBtn.textContent = 'Đang kết nối...';
        if (this.btnToggleMirror) this.btnToggleMirror.classList.remove('active');
        if (statusBox) statusBox.innerHTML = `<p style="color:#fbbf24;">⏳ <strong>Đang kết nối tới thiết bị...</strong> Vui lòng giữ màn hình điện thoại sáng.</p>`;
        if (toolDot) toolDot.style.background = '#fbbf24';
        break;
      case 'stopping':
        if (btnText) btnText.textContent = 'Đang dừng...';
        if (headerBtn) headerBtn.textContent = 'Đang dừng...';
        if (connectBtn) connectBtn.textContent = 'Đang dừng...';
        if (this.btnToggleMirror) this.btnToggleMirror.classList.remove('active');
        if (toolDot) toolDot.style.background = '#fbbf24';
        break;
      case 'error':
        if (btnText) btnText.textContent = 'Bật Chiếu Màn Hình';
        if (headerBtn) { headerBtn.textContent = 'Chiếu Màn Hình'; headerBtn.classList.remove('active'); }
        if (sideBtn) { sideBtn.textContent = 'Bật Chiếu Màn Hình Trên PC'; sideBtn.classList.remove('active'); }
        if (connectBtn) { connectBtn.textContent = 'Bật Chiếu Màn Hình'; connectBtn.classList.remove('active'); }
        if (this.btnToggleMirror) this.btnToggleMirror.classList.remove('active');
        if (statusBox) statusBox.innerHTML = `<p style="color:#ef4444;">⚠️ <strong>Lỗi kết nối:</strong> ${errorMsg || 'Vui lòng kiểm tra lại ADB'}</p>`;
        if (toolDot) toolDot.style.background = '';
        break;
      case 'idle':
      default:
        if (btnText) btnText.textContent = 'Bật Chiếu Màn Hình';
        if (headerBtn) { headerBtn.textContent = 'Chiếu Màn Hình'; headerBtn.classList.remove('active'); }
        if (sideBtn) { sideBtn.textContent = 'Bật Chiếu Màn Hình Trên PC'; sideBtn.classList.remove('active'); }
        if (connectBtn) { connectBtn.textContent = 'Bật Chiếu Màn Hình'; connectBtn.classList.remove('active'); }
        if (this.btnToggleMirror) this.btnToggleMirror.classList.remove('active');
        if (statusBox) statusBox.innerHTML = `<p>🟢 <strong>Sẵn sàng:</strong> Bấm "Bật Chiếu Màn Hình" để hiển thị cửa sổ điện thoại trên PC.</p>`;
        if (toolDot) toolDot.style.background = '';
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
        } else {
          // Web/Phone App: poll server API
          const host = this.hostServer || window.location.origin;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500);
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
        } else {
          const host = this.hostServer || window.location.origin;
          const res = await fetch(`${host}/api/air-gesture/status`);
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
    const toggleMirror = async () => {
      if (this.isMirroring) {
        // === DỪNG CHIẾU MÀN HÌNH ===
        this.log('[Scrcpy] ⏹ Đang dừng phiên chiếu màn hình...', 'info');
        this.updateMirrorUI('stopping');
        try {
          if (this.isDesktop) {
            await window.dianaDesktop?.stopPhoneMirror();
          } else {
            await this.apiCall('/api/phone/mirror/stop', { method: 'GET' });
          }
          this.isMirroring = false;
          this.updateMirrorUI('idle');
          this.log('[Scrcpy] ⏹ Đã dừng chiếu màn hình.', 'info');
        } catch (err) {
          this.isMirroring = false;
          this.updateMirrorUI('idle');
          this.log(`[Scrcpy] ❌ Lỗi dừng: ${err.message || err}`, 'error');
        }
      } else {
        // === BẬT / TOGGLE CHIẾU MÀN HÌNH ===
        const target = this.phoneTabTargetIp?.value?.trim() || localStorage.getItem('diana_phone_ip') || '';
        if (target) {
          try { localStorage.setItem('diana_phone_ip', target); } catch (_) {}
          if (this.phoneTabTargetIp && !this.phoneTabTargetIp.value) this.phoneTabTargetIp.value = target;
        }
        this.log(`[Scrcpy] 📱 Đang thao tác chiếu màn hình...`, 'info');
        this.updateMirrorUI('connecting');

        try {
          let res;
          if (this.isDesktop) {
            if (window.dianaDesktop?.togglePhoneMirror) {
              res = await window.dianaDesktop.togglePhoneMirror(target);
            } else {
              const status = await window.dianaDesktop?.getMirrorStatus?.();
              if (status && status.mirrorActive) {
                res = await window.dianaDesktop?.stopPhoneMirror();
              } else {
                res = await window.dianaDesktop?.startPhoneMirror(target);
              }
            }
          } else {
            // Trên Phone/Web: gọi API toggle thông minh (Nếu đang mở -> Tắt, Nếu tắt -> Bật)
            res = await this.apiCall(`/api/phone/mirror/toggle?target=${encodeURIComponent(target)}`, { method: 'GET' });
          }

          if (res && res.success) {
            if (res.activeDevice) {
              try { localStorage.setItem('diana_phone_ip', res.activeDevice); } catch (_) {}
              if (this.phoneTabTargetIp) this.phoneTabTargetIp.value = res.activeDevice;
            }
            if (res.isMirroring === false || res.action === 'stopped' || res.message?.includes('tắt')) {
              this.isMirroring = false;
              this.updateMirrorUI('idle');
              this.log('[Scrcpy] ⏹ Đã tắt chiếu màn hình thành công!', 'info');
            } else {
              this.isMirroring = true;
              this.updateMirrorUI('active');
              this.log(`[Scrcpy] ✅ Đã kết nối và hiển thị màn hình ${res.activeDevice || target || ''} trên PC!`, 'success');
            }
          } else {
            this.isMirroring = false;
            this.updateMirrorUI('error', res?.error);
            this.log(`[Scrcpy] ❌ Lỗi kết nối: ${res?.error || 'Thất bại'}`, 'error');
          }
        } catch (err) {
          this.isMirroring = false;
          this.updateMirrorUI('error', err.message);
          this.log(`[Scrcpy] ❌ Lỗi: ${err.message || err}`, 'error');
        }
      }
    };

    // Tất cả nút mirror đều toggle
    this.btnHeaderMirror?.addEventListener('click', toggleMirror);
    this.btnToggleMirror?.addEventListener('click', toggleMirror);
    this.btnSideLaunchMirror?.addEventListener('click', toggleMirror);
    this.btnPhoneTabConnect?.addEventListener('click', toggleMirror);
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
  }

  // --------------------------------------------------------------------------
  // 7. Voice Assistant & AI Chat
  // --------------------------------------------------------------------------
  initVoiceAssistant() {
    // Send Text Query
    const sendQuery = async () => {
      const query = this.textInput?.value?.trim();
      if (!query) return;

      this.textInput.value = '';
      this.appendMessage('user', query);

      // Hide welcome card if visible
      const welcomeCard = document.getElementById('welcomeCard');
      if (welcomeCard) welcomeCard.style.display = 'none';

      try {
        this.log(`[AI] Truy vấn: "${query}"`, 'info');
        const res = await this.apiCall('/api/voice', {
          method: 'POST',
          body: JSON.stringify({ query })
        });

        let replyPayload = res?.reply || res?.message || 'Dạ em chưa nhận được phản hồi từ máy chủ.';
        if (typeof replyPayload === 'string' && res?.screenshotBase64) {
          replyPayload = {
            text: replyPayload,
            screenshotBase64: res.screenshotBase64
          };
        }

        this.appendMessage('bot', replyPayload);
        
        const replyText = typeof replyPayload === 'string' ? replyPayload : (replyPayload.text || replyPayload.message || '');
        if (replyText) {
          this.log(`[AI] Phản hồi: "${replyText}"`, 'success');
        }

        if (this.ttsEnabled && replyText) {
          this.speakTTS(replyText);
        }
      } catch (err) {
        this.appendMessage('bot', `⚠️ Lỗi kết nối: ${err.message}`);
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
}

// Start Station on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.dianaStationApp = new DianaStationApp();
});
