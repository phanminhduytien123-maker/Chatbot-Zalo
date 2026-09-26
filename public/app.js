/**
 * DIANA AI VOICE ASSISTANT - CLIENT APPLICATION 3.0
 * Mobile-First Ultra Responsive Experience, Auto Voice Activity Detection (VAD) & Natural TTS
 */

class DianaVoiceApp {
  constructor() {
    this.isRecording = false;
    this.isSpeaking = false;
    this.ttsEnabled = localStorage.getItem('diana_tts') !== 'false';
    this.dotEnabled = localStorage.getItem('diana_dot_visible') !== 'false';
    this.autoVadEnabled = localStorage.getItem('diana_auto_vad') === 'true';
    this.vadState = 'IDLE'; // 'IDLE' | 'WAITING_VOICE' | 'LISTENING' | 'THINKING' | 'SPEAKING'
    this.deferredPrompt = null;
    
    // Speech Recognition Engines
    this.recognition = null;
    this.hasWebSpeech = false;
    this.finalTranscript = '';
    this.lastInterim = '';

    // MediaRecorder & Web Audio Context
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.animFrameId = null;
    this.silenceTimer = null;
    this.synth = window.speechSynthesis || null;
    this.currentAudio = null;
    this.currentDspSource = null;
    this.audioCtx = null;

    // VAD Tracking Parameters
    this.vadConsecutiveSpeechFrames = 0;
    this.vadSilenceStartTime = null;
    this.vadMinRecordDuration = 700; // tối thiểu 700ms để tránh tiếng click
    this.vadRecordStartTime = 0;

    // Drag & Touch Physics for AssistiveTouch Dot
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialLeft = 0;
    this.initialTop = 0;
    this.hasMoved = false;
    this.capsuleAutoCloseTimer = null;
    this.capsuleTouchStartY = 0;
    this.pendingContactSelection = null;
    this.zaloFriendsList = [];
    try {
      const savedFriends = localStorage.getItem('diana_zalo_friends');
      if (savedFriends) this.zaloFriendsList = JSON.parse(savedFriends);
    } catch (_) {}

    // DOM Elements
    this.appContainer = document.getElementById('appContainer');
    this.assistiveLayer = document.getElementById('assistiveLayer');
    this.assistiveDot = document.getElementById('assistiveDot');
    this.dynamicCapsule = document.getElementById('dynamicCapsule');
    this.capsuleStatus = document.getElementById('capsuleStatus');
    this.capsuleTranscript = document.getElementById('capsuleTranscript');
    this.capsuleWave = document.getElementById('capsuleWave');
    this.capsuleResult = document.getElementById('capsuleResult');
    this.capsuleReplyText = document.getElementById('capsuleReplyText');
    this.capsuleScreenshot = document.getElementById('capsuleScreenshot');
    this.capsuleScreenshotImg = document.getElementById('capsuleScreenshotImg');
    this.capsuleCloseBtn = document.getElementById('capsuleCloseBtn');
    
    this.chatContainer = document.getElementById('chatContainer');
    this.chatMessages = document.getElementById('chatMessages');
    this.welcomeCard = document.getElementById('welcomeCard');
    this.textInput = document.getElementById('textInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.inputMicBtn = document.getElementById('inputMicBtn');
    this.voiceRecordingBar = document.getElementById('voiceRecordingBar');
    this.recStopBtn = document.getElementById('recStopBtn');
    this.recStatusText = document.getElementById('recStatusText');
    
    this.pcStatusBadge = document.getElementById('pcStatusBadge');
    this.pcStatusText = document.getElementById('pcStatusText');
    this.headerAvatarBtn = document.getElementById('headerAvatarBtn');
    this.liveVoiceModeBtn = document.getElementById('liveVoiceModeBtn');
    this.autoVadToggleBtn = document.getElementById('autoVadToggleBtn');
    this.autoVadBadgeDot = document.getElementById('autoVadBadgeDot');
    this.screenshotHeaderBtn = document.getElementById('screenshotHeaderBtn');
    this.ttsToggleBtn = document.getElementById('ttsToggleBtn');
    this.dotToggleBtn = document.getElementById('dotToggleBtn');
    this.pipToggleBtn = document.getElementById('pipToggleBtn');
    this.clearChatBtn = document.getElementById('clearChatBtn');
    
    // Air Gesture Elements (Huawei Grab & Drop Transfer - Chạy ngầm hoàn toàn, 0 UI Camera)
    this.airGestureBtn = document.getElementById('airGestureBtn');
    this.airGestureBadgeDot = document.getElementById('airGestureBadgeDot');
    this.airGestureToast = document.getElementById('airGestureToast');
    this.airToastIcon = document.getElementById('airToastIcon');
    this.airToastTitle = document.getElementById('airToastTitle');
    this.airToastDesc = document.getElementById('airToastDesc');
    this.airToastCloseBtn = document.getElementById('airToastCloseBtn');
    this.airGestureVideo = document.getElementById('airGestureVideo');

    this.isAirGestureActive = false;
    this.airHandsDetector = null;
    this.airCameraUtils = null;
    this.airGestureStream = null;
    this.consecutiveGrabFrames = 0;
    this.chatHistory = [];
    
    // Live Voice Overlay Elements
    this.liveVoiceOverlay = document.getElementById('liveVoiceOverlay');
    this.liveVoiceCloseBtn = document.getElementById('liveVoiceCloseBtn');
    this.liveOrbContainer = document.getElementById('liveOrbContainer');
    this.liveOrbCore = document.getElementById('liveOrbCore');
    this.liveOrbWaves = document.getElementById('liveOrbWaves');
    this.liveMicToggleBtn = document.getElementById('liveMicToggleBtn');
    this.liveStatusLabel = document.getElementById('liveStatusLabel');
    this.liveTranscriptText = document.getElementById('liveTranscriptText');

    // Lightbox Elements
    this.imageLightbox = document.getElementById('imageLightbox');
    this.lightboxImg = document.getElementById('lightboxImg');
    this.lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

    // PWA Elements
    this.pwaBanner = document.getElementById('pwaBanner');
    this.pwaInstallBtn = document.getElementById('pwaInstallBtn');
    this.pwaDismissBtn = document.getElementById('pwaDismissBtn');

    // Wave bar node lists
    this.dotWaveBars = document.querySelectorAll('#dotWaveBars span');
    // Cấu hình Giọng nói chuẩn cố định cho Diana (Diana Nữ, Pitch 1.2, Speed 1.2, Volume 110%, Spatial 3D, Cadence Khoan thai)
    this.voiceSettings = {
      voicePreset: 'diana_female',
      emotionPreset: 'gentle',
      speed: 1.20,
      pitch: 1.20,
      volume: 110,
      audioFx: 'spatial',
      cadence: 'relaxed'
    };
    try {
      localStorage.setItem('diana_voice_settings', JSON.stringify(this.voiceSettings));
    } catch (_) {}

    this.liveOrbWaveBars = document.querySelectorAll('#liveOrbWaves span');

    this.init();
  }

  init() {
    this.initDynamicViewport();
    this.initSpeechRecognition();
    this.initAssistiveDotPhysics();
    this.setupEventListeners();
    this.setupQuickChips();
    this.setupPWA();
    this.updateTTSButtonState();
    this.updateDotVisibilityState();
    this.updateAutoVadButtonState();
    this.checkPCStatus();
    setInterval(() => this.checkPCStatus(), 8000);
    setTimeout(() => this.syncZaloFriends(false), 2000);
    setTimeout(() => this.checkAirSyncOnLoad(), 500);
    // Preload MediaPipe Hands ngay khi app khởi động để giảm delay camera khi dùng Air Gesture
    setTimeout(() => this.preloadAirGestureModel(), 2000);

    if (this.autoVadEnabled) {
      setTimeout(() => this.startAutoVadLoop(), 1200);
    }
  }



  /**
   * Tính toán chiều cao màn hình chuẩn xác cho trình duyệt Mobile (iOS Safari & Chrome Android)
   */
  initDynamicViewport() {
    const updateAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
      if (this.appContainer) {
        if (window.innerWidth <= 640) {
          const vvHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
          this.appContainer.style.height = `${vvHeight}px`;
        } else {
          this.appContainer.style.height = '';
        }
      }
    };

    window.addEventListener('resize', updateAppHeight);
    window.addEventListener('orientationchange', () => setTimeout(updateAppHeight, 200));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateAppHeight);
      window.visualViewport.addEventListener('scroll', updateAppHeight);
    }
    updateAppHeight();
  }

  /**
   * Rung phản hồi haptic xúc giác trên điện thoại
   */
  haptic(ms = 35) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  }

  /**
   * Khởi tạo Bộ nhận diện giọng nói Web Speech API (Google vi-VN) - Dùng làm phụ đề trực tiếp
   */
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'vi-VN';
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
          this.finalTranscript = '';
          this.lastInterim = '';
        };

        this.recognition.onresult = (event) => {
          let interimText = '';
          let finalResult = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalResult += transcript;
            } else {
              interimText += transcript;
            }
          }

          if (interimText) {
            this.lastInterim = interimText;
            this.capsuleTranscript.innerHTML = `<span class="interim-text">"${interimText}"</span>`;
            if (this.liveTranscriptText) this.liveTranscriptText.textContent = `"${interimText}"`;
          }

          if (finalResult) {
            this.finalTranscript = finalResult.trim();
            this.capsuleTranscript.innerHTML = `<strong>"${this.finalTranscript}"</strong>`;
            if (this.liveTranscriptText) this.liveTranscriptText.textContent = `"${this.finalTranscript}"`;
          }
        };

        this.recognition.onerror = () => {};
        this.recognition.onend = () => {};

        this.hasWebSpeech = true;
      } catch (err) {
        this.hasWebSpeech = false;
      }
    } else {
      this.hasWebSpeech = false;
    }
  }

  /**
   * Cài đặt cơ chế Kéo thả & Tự động bám cạnh (iOS AssistiveTouch Physics)
   */
  initAssistiveDotPhysics() {
    if (!this.assistiveDot) return;

    // Phục hồi vị trí đã lưu
    const savedX = localStorage.getItem('diana_dot_x');
    const savedY = localStorage.getItem('diana_dot_y');
    if (savedX && savedY) {
      const x = parseInt(savedX, 10);
      const y = parseInt(savedY, 10);
      if (!isNaN(x) && !isNaN(y) && x < window.innerWidth && y < window.innerHeight) {
        this.assistiveDot.style.left = `${x}px`;
        this.assistiveDot.style.top = `${y}px`;
        this.assistiveDot.style.right = 'auto';
        this.assistiveDot.style.bottom = 'auto';
      }
    }

    const onPointerDown = (e) => {
      this.isDragging = true;
      this.hasMoved = false;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      this.dragStartX = clientX;
      this.dragStartY = clientY;

      const rect = this.assistiveDot.getBoundingClientRect();
      this.initialLeft = rect.left;
      this.initialTop = rect.top;

      this.assistiveDot.classList.add('dragging');
    };

    const onPointerMove = (e) => {
      if (!this.isDragging) return;

      const currentX = e.clientX || (e.touches && e.touches[0].clientX);
      const currentY = e.clientY || (e.touches && e.touches[0].clientY);

      const deltaX = currentX - this.dragStartX;
      const deltaY = currentY - this.dragStartY;

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        this.hasMoved = true;
      }

      let newLeft = this.initialLeft + deltaX;
      let newTop = this.initialTop + deltaY;

      const winW = window.innerWidth;
      const winH = window.innerHeight;
      newLeft = Math.max(8, Math.min(winW - 66, newLeft));
      newTop = Math.max(50, Math.min(winH - 75, newTop));

      this.assistiveDot.style.left = `${newLeft}px`;
      this.assistiveDot.style.top = `${newTop}px`;
      this.assistiveDot.style.right = 'auto';
      this.assistiveDot.style.bottom = 'auto';
    };

    const onPointerUp = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.assistiveDot.classList.remove('dragging');

      if (!this.hasMoved) {
        this.haptic(40);
        this.toggleRecording();
        return;
      }

      // Snap bám dính vào cạnh gần nhất (Trái hoặc Phải)
      const rect = this.assistiveDot.getBoundingClientRect();
      const winW = window.innerWidth;
      const middleX = winW / 2;
      const snapLeft = rect.left < middleX ? 12 : (winW - 70);

      this.assistiveDot.style.transition = 'left 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      this.assistiveDot.style.left = `${snapLeft}px`;

      localStorage.setItem('diana_dot_x', snapLeft);
      localStorage.setItem('diana_dot_y', rect.top);

      setTimeout(() => {
        if (this.assistiveDot) this.assistiveDot.style.transition = '';
      }, 350);
    };

    this.assistiveDot.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    this.assistiveDot.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
  }

  /**
   * Bật/Tắt chế độ Tự động nhận diện giọng nói (Auto Voice Activity Detection - VAD)
   */
  async toggleAutoVad() {
    this.haptic(40);
    this.autoVadEnabled = !this.autoVadEnabled;
    localStorage.setItem('diana_auto_vad', this.autoVadEnabled);
    this.updateAutoVadButtonState();

    if (this.autoVadEnabled) {
      // Giữ màn hình luôn sáng khi ở chế độ đàm thoại liên tục
      if ('wakeLock' in navigator) {
        try {
          this.wakeLock = await navigator.wakeLock.request('screen');
        } catch (_) {}
      }
      this.showCapsule('listening', 'Chế độ Trò chuyện Rảnh tay', '👂 Diana đang lắng nghe... Cứ nói tự nhiên không cần bấm nút nhé!');
      this.startAutoVadLoop();
    } else {
      if (this.wakeLock) {
        try { this.wakeLock.release(); } catch (_) {}
        this.wakeLock = null;
      }
      this.stopAutoVadLoop();
      this.showCapsule('idle', 'Chế độ Rảnh tay', 'Đã tắt tự động nghe. Chạm nút Mic khi cần nói nhé!');
      this.scheduleCapsuleClose(3000);
    }
  }

  updateAutoVadButtonState() {
    if (this.autoVadToggleBtn) {
      if (this.autoVadEnabled) {
        this.autoVadToggleBtn.classList.add('auto-vad-active');
        this.autoVadToggleBtn.title = 'Chế độ Rảnh tay (Nói liên tục): ĐANG BẬT';
      } else {
        this.autoVadToggleBtn.classList.remove('auto-vad-active');
        this.autoVadToggleBtn.title = 'Chế độ Rảnh tay (Nói liên tục): ĐÃ TẮT';
      }
    }
    if (this.autoVadBadgeDot) {
      this.autoVadBadgeDot.style.display = this.autoVadEnabled ? 'block' : 'none';
    }
    if (this.autoVadChip) {
      if (this.autoVadEnabled) {
        this.autoVadChip.classList.add('chip-highlight');
        this.autoVadChip.innerHTML = '<span class="chip-icon">⚡</span> Rảnh tay: ĐANG BẬT';
      } else {
        this.autoVadChip.classList.remove('chip-highlight');
        this.autoVadChip.innerHTML = '<span class="chip-icon">✨</span> Tự động nghe (Rảnh tay)';
      }
    }
  }

  /**
   * Khởi chạy vòng lặp lắng nghe liên tục và phát hiện giọng nói
   */
  async startAutoVadLoop() {
    try {
      if (!this.audioStream) {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
        } catch (_) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        this.audioStream = stream;
      }

      this.vadState = 'WAITING_VOICE';
      this.setupContinuousVAD(this.audioStream);
    } catch (err) {
      console.warn('Lỗi bật Auto VAD:', err);
      this.autoVadEnabled = false;
      this.updateAutoVadButtonState();
    }
  }

  stopAutoVadLoop() {
    this.vadState = 'IDLE';
    if (this.isRecording) {
      this.stopRecording();
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Vòng lặp phân tích cường độ âm thanh thời gian thực (VAD Engine)
   */
  setupContinuousVAD(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.35;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const vadLoop = () => {
        if (!this.autoVadEnabled && !this.isRecording) return;

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;

        // Cập nhật sóng âm visualizer
        const heightMultiplier = Math.min(1.0, Math.max(0.2, average / 35));
        const updateBars = (nodeList) => {
          if (!nodeList || nodeList.length === 0) return;
          nodeList.forEach((bar, idx) => {
            const factor = (idx % 2 === 0 ? 0.8 : 1.25) * heightMultiplier;
            bar.style.transform = `scaleY(${Math.max(0.3, Math.min(1.9, factor * 1.6))})`;
          });
        };

        if (this.isRecording || this.vadState === 'LISTENING') {
          updateBars(this.dotWaveBars);
          updateBars(this.capsuleWaveBars);
          updateBars(this.bottomRecWaves);
          updateBars(this.liveOrbWaveBars);
        }

        // Không xử lý VAD khi Diana đang phát giọng nói trả lời hoặc đang gửi mạng (tránh tự nghe chính mình)
        if (this.isSpeaking || this.vadState === 'THINKING' || this.vadState === 'SPEAKING') {
          this.animFrameId = requestAnimationFrame(vadLoop);
          return;
        }

        // 1. TRẠNG THÁI: ĐANG CHỜ PHÁT HIỆN GIỌNG NÓI (Không nghe gì thì im lặng chờ, không làm phiền)
        if (this.autoVadEnabled && (this.vadState === 'WAITING_VOICE' || this.vadState === 'IDLE') && !this.isRecording) {
          if (average > 13) { // Ngưỡng bắt đầu nói
            this.vadConsecutiveSpeechFrames = (this.vadConsecutiveSpeechFrames || 0) + 1;
            if (this.vadConsecutiveSpeechFrames >= 2) { // Ổn định > 70ms
              this.vadConsecutiveSpeechFrames = 0;
              this.haptic(35);
              this.startListeningFromVAD();
            }
          } else {
            this.vadConsecutiveSpeechFrames = 0;
          }
        }

        // 2. TRẠNG THÁI: ĐANG THU ÂM GIỌNG NÓI (Khi dừng nói thì tự động gửi)
        else if (this.isRecording && this.vadState === 'LISTENING') {
          if (average > 10.5) {
            this.vadSilenceStartTime = null; // Vẫn đang nói, reset bộ đếm im lặng
          } else {
            if (!this.vadSilenceStartTime) {
              this.vadSilenceStartTime = Date.now();
            } else if (Date.now() - this.vadSilenceStartTime > 1150) { // Dừng nói 1.15 giây
              const recordDuration = Date.now() - this.vadRecordStartTime;
              if (recordDuration >= 450) { // Đã nói ít nhất 0.45s
                this.vadSilenceStartTime = null;
                this.stopListeningFromVADAndSend();
              }
            }
          }
        }

        this.animFrameId = requestAnimationFrame(vadLoop);
      };

      this.animFrameId = requestAnimationFrame(vadLoop);
    } catch (_) {}
  }

  /**
   * Bắt đầu ghi âm tự động khi VAD phát hiện tiếng nói
   */
  startListeningFromVAD() {
    this.vadState = 'LISTENING';
    this.vadRecordStartTime = Date.now();
    this.audioChunks = [];

    let mimeType = '';
    const preferredMimes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg',
      'audio/wav'
    ];
    for (const m of preferredMimes) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
        mimeType = m;
        break;
      }
    }

    try {
      const options = mimeType ? { mimeType } : {};
      this.mediaRecorder = new MediaRecorder(this.audioStream, options);
      const actualMime = this.mediaRecorder.mimeType || mimeType || 'audio/webm';

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecording = false;
        this.updateRecordingUI(false);
        this.setDotState('thinking');
        this.showCapsule('thinking', 'Diana đang xử lý...', '⚡ Đang lắng nghe & suy nghĩ...');
        this.updateLiveOverlayState('thinking', 'Đang xử lý...', 'Diana đang suy nghĩ và thực thi...');

        if (this.recognition) {
          try { this.recognition.stop(); } catch (_) {}
        }

        const audioBlob = new Blob(this.audioChunks, { type: actualMime });
        const webSpeechText = (this.finalTranscript || '').trim();

        if (webSpeechText.length > 5) {
          this.handleTextQuery(webSpeechText);
        } else if (audioBlob.size > 50) {
          await this.sendAudioToServer(audioBlob, actualMime);
        } else if (webSpeechText.length > 0) {
          this.handleTextQuery(webSpeechText);
        } else {
          this.setDotState('idle');
          if (this.autoVadEnabled) {
            this.vadState = 'WAITING_VOICE';
            this.showCapsule('listening', 'Chế độ Rảnh tay', '👂 Diana đang chờ câu hỏi tiếp theo...');
          } else {
            this.scheduleCapsuleClose(2000);
          }
        }
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.updateRecordingUI(true);
      this.showCapsule('listening', 'Diana đang nghe...', '🎙️ Đang nghe anh nói...');
      this.updateLiveOverlayState('listening', 'Đang nghe...', 'Em đang lắng nghe anh nói...');

      if (this.hasWebSpeech && this.recognition) {
        try {
          this.finalTranscript = '';
          this.lastInterim = '';
          this.recognition.start();
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Lỗi startListeningFromVAD:', e);
    }
  }

  /**
   * Tự động dừng thu âm và gửi yêu cầu đi
   */
  stopListeningFromVADAndSend() {
    this.haptic(30);
    this.vadState = 'THINKING';

    if (this.hasWebSpeech && this.recognition) {
      try { this.recognition.stop(); } catch (_) {}
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.requestData();
        }
        this.mediaRecorder.stop();
      } catch (_) {}
    }
  }

  /**
   * Bật/Tắt thu âm thủ công bằng nút bấm
   */
  async toggleRecording() {
    this.haptic(40);
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  /**
   * Bắt đầu nhận diện giọng nói thủ công
   */
  async startRecording() {
    this.stopAudioPlayback();

    this.vadState = 'LISTENING';
    this.vadRecordStartTime = Date.now();
    await this.startMediaRecorder();

    if (this.hasWebSpeech && this.recognition) {
      try {
        this.finalTranscript = '';
        this.lastInterim = '';
        this.recognition.start();
      } catch (_) {}
    }
  }

  /**
   * Ghi âm bằng MediaRecorder + Gemini STT
   */
  async startMediaRecorder() {
    try {
      this.audioChunks = [];
      if (!this.audioStream) {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true }
          });
        } catch (_) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        this.audioStream = stream;
      }

      let mimeType = '';
      const preferredMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg',
        'audio/wav'
      ];
      for (const m of preferredMimes) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
          mimeType = m;
          break;
        }
      }

      const options = mimeType ? { mimeType } : {};
      this.mediaRecorder = new MediaRecorder(this.audioStream, options);
      const actualMime = this.mediaRecorder.mimeType || mimeType || 'audio/webm';

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecording = false;
        this.updateRecordingUI(false);
        this.setDotState('thinking');
        this.showCapsule('thinking', 'Diana đang xử lý...', '⚡ Đang lắng nghe & suy nghĩ...');
        this.updateLiveOverlayState('thinking', 'Đang xử lý...', 'Diana đang suy nghĩ và thực thi...');

        if (this.recognition) {
          try { this.recognition.stop(); } catch (_) {}
        }

        const audioBlob = new Blob(this.audioChunks, { type: actualMime });
        const webSpeechText = (this.finalTranscript || '').trim();

        if (webSpeechText.length > 5) {
          this.handleTextQuery(webSpeechText);
        } else if (audioBlob.size > 50) {
          await this.sendAudioToServer(audioBlob, actualMime);
        } else if (webSpeechText.length > 0) {
          this.handleTextQuery(webSpeechText);
        } else {
          this.setDotState('idle');
          if (this.autoVadEnabled) {
            this.vadState = 'WAITING_VOICE';
            this.showCapsule('listening', 'Chế độ Rảnh tay', '👂 Diana đang chờ câu hỏi tiếp theo...');
          } else {
            this.capsuleTranscript.textContent = 'Chạm vào Mic để nói lại nhé...';
            this.updateLiveOverlayState('idle', 'Sẵn sàng', 'Chạm vào hình cầu để nói...');
            this.scheduleCapsuleClose(2000);
          }
        }
      };

      this.setupContinuousVAD(this.audioStream);

      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.updateRecordingUI(true);
      this.showCapsule('listening', 'Diana đang nghe...', '🎙️ Đang nghe anh nói... (Chạm lại khi nói xong)');
      this.updateLiveOverlayState('listening', 'Đang nghe...', 'Em đang lắng nghe anh nói...');

    } catch (err) {
      console.error('Lỗi truy cập Micro:', err);
      this.isRecording = false;
      this.updateRecordingUI(false);
      this.setDotState('idle');

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.showCapsule('idle', 'Quyền Micro', '⚠️ Hãy cho phép quyền truy cập Micro trên trình duyệt nhé!');
        this.scheduleCapsuleClose(4000);
      } else {
        this.showCapsule('idle', 'Lỗi Micro', `Lỗi: ${err.message}`);
        this.scheduleCapsuleClose(3000);
      }
    }
  }

  /**
   * Dừng thu âm thủ công
   */
  stopRecording() {
    this.haptic(30);
    this.vadState = 'THINKING';

    if (this.hasWebSpeech && this.recognition) {
      try { this.recognition.stop(); } catch (_) {}
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.requestData();
        }
        this.mediaRecorder.stop();
      } catch (_) {}
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Cập nhật giao diện khi bắt đầu/kết thúc thu âm
   */
  updateRecordingUI(isRecording) {
    if (isRecording) {
      this.setDotState('listening');
      if (this.inputMicBtn) this.inputMicBtn.classList.add('active');
      if (this.voiceRecordingBar) this.voiceRecordingBar.style.display = 'flex';
      if (this.liveMicToggleBtn) this.liveMicToggleBtn.classList.add('listening');
      if (this.liveOrbWaves) this.liveOrbWaves.style.display = 'flex';
      const liveOrbEmoji = document.querySelector('.orb-emoji');
      if (liveOrbEmoji) liveOrbEmoji.style.display = 'none';
    } else {
      if (this.inputMicBtn) this.inputMicBtn.classList.remove('active');
      if (this.voiceRecordingBar) this.voiceRecordingBar.style.display = 'none';
      if (this.liveMicToggleBtn) this.liveMicToggleBtn.classList.remove('listening');
      if (this.liveOrbWaves) this.liveOrbWaves.style.display = 'none';
      const liveOrbEmoji = document.querySelector('.orb-emoji');
      if (liveOrbEmoji) liveOrbEmoji.style.display = 'block';
    }
  }

  /**
   * Gửi file âm thanh lên Gemini Multimodal Endpoint
   */
  async sendAudioToServer(audioBlob, mimeType) {
    if (this.welcomeCard) {
      this.welcomeCard.style.display = 'none';
    }

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result || '').split(',')[1] || '';
        let response = null;
        let usedUrl = this.getServerUrl();
        try {
          response = await fetch(usedUrl + '/api/voice-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio: base64Audio,
              mimeType: mimeType
            })
          });
        } catch (firstErr) {
          console.warn(`[Diana Audio] Gửi tới ${usedUrl} thất bại, thử các IP dự phòng...`, firstErr);
          const fallbacks = ['http://192.168.100.221:3000', 'http://127.0.0.1:3000', 'http://100.105.204.3:3000'].filter(u => u !== usedUrl);
          for (const fb of fallbacks) {
            try {
              response = await fetch(fb + '/api/voice-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio: base64Audio, mimeType })
              });
              if (response && response.ok) {
                this.activeServerUrl = fb;
                localStorage.setItem('diana_server_url', fb);
                break;
              }
            } catch (_) {}
          }
        }

        if (!response) {
          throw new Error('Không thể kết nối đến máy tính PC.');
        }

        const data = await response.json();

        if (data && data.success) {
          const userQuery = data.query || 'Giọng nói';
          this.addMessage('user', userQuery);

          const textReply = typeof data.reply === 'string' ? data.reply : (data.reply.text || JSON.stringify(data.reply));
          const attachments = data.reply.attachments || data.attachments || [];

          this.addMessage('bot', textReply, attachments);
          this.showResultInCapsule(userQuery, textReply, attachments);
          this.updateLiveOverlayState('speaking', 'Diana đang trả lời', textReply);

          if (this.ttsEnabled) {
            this.speak(textReply);
          } else {
            this.setDotState('idle');
            this.scheduleCapsuleClose(5000);
            if (this.autoVadEnabled) {
              setTimeout(() => {
                this.vadState = 'WAITING_VOICE';
                this.showCapsule('listening', 'Chế độ Rảnh tay', '👂 Diana đang chờ câu hỏi tiếp theo...');
              }, 1000);
            }
          }
        } else {
          const errText = data.error || 'Không nhận diện được âm thanh. Anh vui lòng thử lại nhé!';
          this.setDotState('idle');
          this.showCapsule('idle', 'Lỗi nhận diện', `⚠️ ${errText}`);
          this.addMessage('bot', `⚠️ ${errText}`);
          this.updateLiveOverlayState('idle', 'Lỗi', errText);
          this.scheduleCapsuleClose(4000);

          if (this.autoVadEnabled) {
            setTimeout(() => {
              this.vadState = 'WAITING_VOICE';
              this.showCapsule('listening', 'Chế độ Rảnh tay', '👂 Diana đang chờ câu hỏi tiếp theo...');
            }, 3000);
          }
        }
      };
    } catch (err) {
      console.error('Lỗi gửi âm thanh:', err);
      this.setDotState('idle');
      this.showCapsule('idle', 'Lỗi kết nối', '⚠️ Không thể kết nối máy chủ.');
      this.scheduleCapsuleClose(3000);

      if (this.autoVadEnabled) {
        setTimeout(() => {
          this.vadState = 'WAITING_VOICE';
        }, 3000);
      }
    }
  }

  /**
   * Chuẩn hóa bỏ dấu tiếng Việt để tìm kiếm danh bạ và nhận diện số thứ tự
   */
  removeVietnameseAccents(str) {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  /**
   * Đồng bộ danh sách bạn bè Zalo chính thức từ máy chủ
   */
  async syncZaloFriends(forceRefresh = false) {
    try {
      const url = `${this.getServerUrl()}/api/zalo/friends${forceRefresh ? '/scan' : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.friends)) {
        this.zaloFriendsList = data.friends;
        localStorage.setItem('diana_zalo_friends', JSON.stringify(data.friends));
        console.log(`[Diana Friends] Đã đồng bộ ${data.friends.length} bạn bè Zalo.`);
        return this.zaloFriendsList;
      }
    } catch (err) {
      console.warn('[Diana Friends] Không thể đồng bộ bạn bè Zalo:', err);
    }
    return this.zaloFriendsList || [];
  }

  /**
   * Tìm kiếm bạn bè Zalo chính thức (Ưu tiên quét bạn bè thật, không lấy số lạ)
   */
  async searchZaloFriends(targetName) {
    if (!targetName) return [];
    
    // Nếu danh sách chưa có trong bộ nhớ, tải về ngay
    if (!this.zaloFriendsList || this.zaloFriendsList.length === 0) {
      await this.syncZaloFriends(false);
    }

    const removeAccents = (str) => {
      if (!str) return '';
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
    };

    const normQuery = removeAccents(targetName);
    const queryWords = normQuery.split(/\s+/).filter(Boolean);

    const scored = [];
    const addedKeys = new Set();

    // 1. Quét danh sách bạn bè Zalo chính thức từ máy chủ
    if (Array.isArray(this.zaloFriendsList)) {
      for (const f of this.zaloFriendsList) {
        const name = f.displayName || f.zaloName;
        const normName = removeAccents(name);
        const normZaloName = removeAccents(f.zaloName);

        let score = 0;
        if (normName === normQuery || normZaloName === normQuery) {
          score = 120;
        } else if (normName.startsWith(normQuery) || normZaloName.startsWith(normQuery)) {
          score = 100;
        } else if (normName.includes(' ' + normQuery + ' ') || normName.endsWith(' ' + normQuery) || normName.startsWith(normQuery + ' ')) {
          score = 80;
        } else if (normName.includes(normQuery) || normZaloName.includes(normQuery)) {
          score = 60;
        } else {
          let allWords = true;
          for (const w of queryWords) {
            if (!normName.includes(w) && !normZaloName.includes(w)) {
              allWords = false;
              break;
            }
          }
          if (allWords && queryWords.length > 0) score = 50;
        }

        if (score > 0) {
          const item = {
            name: name,
            zaloName: f.zaloName,
            userId: f.userId,
            phoneNumber: f.phoneNumber || '',
            photo: f.avatar || '',
            isZaloFriend: true,
            score: score
          };
          scored.push(item);
          addedKeys.add(f.userId);
        }
      }
    }

    // 2. Quét thêm từ Android Contacts Provider nếu có liên kết Zalo (zaloDataId)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.DianaNative) {
      try {
        const res = await window.Capacitor.Plugins.DianaNative.searchContacts({ name: targetName, onlyZaloFriends: true });
        if (res && res.contacts) {
          for (const c of res.contacts) {
            if (c.zaloDataId) {
              const matched = scored.find(s => s.name === c.name || (c.phoneNumber && s.phoneNumber && s.phoneNumber.includes(c.phoneNumber)));
              if (matched) {
                matched.zaloDataId = c.zaloDataId;
                if (!matched.photo && c.photo) matched.photo = c.photo;
              } else {
                scored.push({
                  name: c.name,
                  phoneNumber: c.phoneNumber,
                  photo: c.photo || '',
                  zaloDataId: c.zaloDataId,
                  isZaloFriend: true,
                  score: 75
                });
              }
            }
          }
        }
      } catch (_) {}
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /**
   * Tạo giao diện Card danh sách toàn bộ bạn bè Zalo
   */
  renderZaloFriendsListCard(friends) {
    const itemsHtml = friends.map((f, idx) => {
      const avatarHtml = f.avatar ? `<img src="${f.avatar}" class="contact-choice-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="contact-choice-avatar" style="display:none;">${(f.displayName || f.zaloName || 'Z').charAt(0).toUpperCase()}</div>` : `<div class="contact-choice-avatar">${(f.displayName || f.zaloName || 'Z').charAt(0).toUpperCase()}</div>`;
      const zaloNameSub = (f.zaloName && f.zaloName !== f.displayName) ? `<div class="contact-choice-sub">Zalo: ${this.escapeHtml(f.zaloName)}</div>` : '';
      const phoneSub = f.phoneNumber ? `<div class="contact-choice-phone">${this.escapeHtml(f.phoneNumber)}</div>` : '';

      return `
        <div class="zalo-friend-item">
          <div class="contact-choice-badge">${idx + 1}</div>
          ${avatarHtml}
          <div class="contact-choice-info">
            <div class="contact-choice-name">${this.escapeHtml(f.displayName || f.zaloName)} <span class="contact-zalo-badge">Bạn bè</span></div>
            ${zaloNameSub}
            ${phoneSub}
          </div>
          <div class="zalo-friend-actions">
            <button class="zalo-quick-action-btn" title="Nhắn tin" onclick="event.stopPropagation(); window.dianaApp.executeContactAction({ name: '${this.escapeHtml(f.displayName || f.zaloName)}', userId: '${f.userId}', phoneNumber: '${f.phoneNumber || ''}' }, 'zalo', 'chat')">💬</button>
            <button class="zalo-quick-action-btn" title="Gọi thoại" onclick="event.stopPropagation(); window.dianaApp.executeContactAction({ name: '${this.escapeHtml(f.displayName || f.zaloName)}', userId: '${f.userId}', phoneNumber: '${f.phoneNumber || ''}' }, 'zalo', 'call')">📞</button>
            <button class="zalo-quick-action-btn" title="Gọi video" onclick="event.stopPropagation(); window.dianaApp.executeContactAction({ name: '${this.escapeHtml(f.displayName || f.zaloName)}', userId: '${f.userId}', phoneNumber: '${f.phoneNumber || ''}' }, 'zalo', 'video')">📹</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="zalo-friends-card">
        <div class="contact-disambig-header">
          <div class="contact-disambig-title">👥 Danh sách bạn bè Zalo (${friends.length} người)</div>
          <div class="contact-disambig-sub">Chạm vào nút để Nhắn tin, Gọi thoại hoặc Gọi Video:</div>
        </div>
        <div class="contact-choice-list zalo-friends-scroll">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  /**
   * Tạo giao diện Card danh sách liên hệ để người dùng chọn
   */
  renderContactChoiceCard(contacts, targetName, app, action, sim) {
    let actionIcon = '📞';
    let actionTitle = 'Gọi thoại';
    if (app === 'zalo') {
      if (action === 'chat') { actionIcon = '💬'; actionTitle = 'Nhắn tin Zalo'; }
      else if (action === 'video') { actionIcon = '📹'; actionTitle = 'Gọi Video Zalo'; }
      else { actionIcon = '📞'; actionTitle = 'Gọi Zalo'; }
    } else {
      actionIcon = '📱'; actionTitle = `Gọi SIM ${sim ? sim.toUpperCase() : ''}`.trim();
    }

    const itemsHtml = contacts.map((c, idx) => {
      const avatarHtml = c.photo ? `<img src="${c.photo}" class="contact-choice-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="contact-choice-avatar" style="display:none;">${(c.name || 'U').charAt(0).toUpperCase()}</div>` : `<div class="contact-choice-avatar">${(c.name || 'U').charAt(0).toUpperCase()}</div>`;
      const zaloBadge = c.isZaloFriend ? '<span class="contact-zalo-badge">Zalo</span>' : '';
      const phoneOrId = c.phoneNumber || (c.userId ? `ID: ${c.userId}` : '');
      return `
        <div class="contact-choice-item" onclick="window.dianaApp.selectContactChoice(${idx})">
          <div class="contact-choice-badge">${idx + 1}</div>
          ${avatarHtml}
          <div class="contact-choice-info">
            <div class="contact-choice-name">${this.escapeHtml(c.name)} ${zaloBadge}</div>
            <div class="contact-choice-phone">${this.escapeHtml(phoneOrId)}</div>
          </div>
          <div class="contact-choice-action-btn">${actionIcon}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="contact-disambiguation-card">
        <div class="contact-disambig-header">
          <div class="contact-disambig-title">📋 ${actionTitle} cho "${this.escapeHtml(targetName)}"</div>
          <div class="contact-disambig-sub">Nói số thứ tự (1, 2, 3...) hoặc chạm để chọn:</div>
        </div>
        <div class="contact-choice-list">
          ${itemsHtml}
        </div>
        <button class="contact-choice-cancel-btn" onclick="window.dianaApp.cancelContactSelection()">
          ✕ Hủy bỏ
        </button>
      </div>
    `;
  }

  /**
   * Chạm vào 1 liên hệ trong danh sách lựa chọn
   */
  async selectContactChoice(index) {
    this.haptic(35);
    if (!this.pendingContactSelection || !this.pendingContactSelection.contacts[index]) return;
    const { app, action, sim } = this.pendingContactSelection;
    const contact = this.pendingContactSelection.contacts[index];
    this.pendingContactSelection = null;
    await this.executeContactAction(contact, app, action, sim);
  }

  /**
   * Hủy bỏ thao tác chọn liên hệ
   */
  cancelContactSelection() {
    this.haptic(30);
    this.pendingContactSelection = null;
    const reply = 'Dạ em đã hủy chọn liên hệ rồi ạ! ✨';
    this.addMessage('bot', reply);
    this.showResultInCapsule('Hủy', reply);
    if (this.ttsEnabled) this.speak(reply);
    this.scheduleCapsuleClose(2500);
  }

  /**
   * Thực thi hành động gọi điện thoại / nhắn tin / gọi video với liên hệ cụ thể
   */
  async executeContactAction(contact, app = 'zalo', action = 'call', sim = '') {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.DianaNative) {
      return false;
    }
    const native = window.Capacitor.Plugins.DianaNative;
    const phone = (contact.phoneNumber || '').replace(/[\s.-]/g, '');

    try {
      const res = await native.makePhoneCall({
        phoneNumber: phone,
        zaloDataId: contact.zaloDataId || '',
        userId: contact.userId || '',
        sim: sim || '',
        app: app || 'zalo',
        action: action || 'call'
      });

      let reply = res.message;
      let spokenText = '';
      if (!reply) {
        if (app === 'zalo') {
          if (action === 'chat') {
            reply = `Dạ em đã mở tin nhắn Zalo với **${contact.name}** cho anh rồi ạ! 💬`;
            spokenText = `Dạ em đã mở tin nhắn Zalo với ${contact.name} cho anh rồi ạ!`;
          } else if (action === 'video') {
            reply = `Dạ em đang mở Zalo gọi Video cho **${contact.name}** cho anh rồi ạ! 📹`;
            spokenText = `Dạ em đang mở Zalo gọi Video cho ${contact.name} cho anh rồi ạ!`;
          } else {
            reply = `Dạ em đang mở cuộc gọi Zalo cho **${contact.name}** cho anh rồi ạ! 📞`;
            spokenText = `Dạ em đang mở cuộc gọi Zalo cho ${contact.name} cho anh rồi ạ!`;
          }
        } else {
          const simNotice = sim ? ` bằng SIM ${sim.toUpperCase()}` : '';
          reply = `Dạ em đang gọi cho **${contact.name}** (${phone})${simNotice} cho anh rồi ạ! 📞`;
          spokenText = `Dạ em đang gọi cho ${contact.name}${simNotice} cho anh rồi ạ!`;
        }
      } else {
        spokenText = reply.replace(/[*_#`~]/g, '');
      }

      this.addMessage('bot', reply);
      this.showResultInCapsule(contact.name, reply);
      if (this.ttsEnabled) this.speak(spokenText);
      return true;
    } catch (err) {
      console.warn('Lỗi executeContactAction:', err);
      const errMsg = `⚠️ Lỗi khi thực hiện: ${err.message || err}`;
      this.addMessage('bot', errMsg);
      this.showResultInCapsule(contact.name, errMsg);
      if (this.ttsEnabled) this.speak('Dạ có lỗi xảy ra khi thực hiện cuộc gọi ạ.');
      return false;
    }
  }

  /**
   * Xử lý lựa chọn từ người dùng khi đang chờ chọn liên hệ (bằng giọng nói hoặc gõ text)
   */
  async handlePendingContactChoice(query) {
    if (!this.pendingContactSelection) return false;
    const { contacts, app, action, sim } = this.pendingContactSelection;
    const lower = query.toLowerCase().trim();

    // 1. Ý định hủy bỏ
    if (lower === 'hủy' || lower === 'huy' || lower === 'thôi' || lower === 'thoi' || lower === 'bỏ qua' || lower === 'cancel' || lower === 'không gọi nữa' || lower === 'dừng lại' || lower === 'không' || lower === 'khong') {
      this.cancelContactSelection();
      return true;
    }

    // 2. Nhận diện số thứ tự (1, 2, 3, một, hai, ba, người thứ nhất...)
    let selectedIdx = -1;
    const numMap = {
      '1': 0, 'một': 0, 'mot': 0, 'nhất': 0, 'nhat': 0,
      '2': 1, 'hai': 1,
      '3': 2, 'ba': 2,
      '4': 3, 'bốn': 3, 'bon': 3, 'tư': 3, 'tu': 3,
      '5': 4, 'năm': 4, 'nam': 4
    };

    const matchNum = lower.match(/(?:số|chọn|gọi|người thứ|thứ|cái|mục)?\s*([1-5]|một|hai|ba|bốn|bon|tư|tu|năm|nam|nhất|nhat)/i);
    if (matchNum && matchNum[1] && numMap[matchNum[1].toLowerCase()] !== undefined) {
      selectedIdx = numMap[matchNum[1].toLowerCase()];
    }

    // 3. Khớp theo tên liên hệ trong danh sách lựa chọn
    if (selectedIdx === -1) {
      const normQ = this.removeVietnameseAccents(lower);
      for (let i = 0; i < contacts.length; i++) {
        const normC = this.removeVietnameseAccents(contacts[i].name);
        if (normC.includes(normQ) || normQ.includes(normC)) {
          selectedIdx = i;
          break;
        }
      }
    }

    if (selectedIdx >= 0 && selectedIdx < contacts.length) {
      const selectedContact = contacts[selectedIdx];
      this.pendingContactSelection = null;
      await this.executeContactAction(selectedContact, app, action, sim);
      return true;
    }

    // Nếu người dùng ra một lệnh hoàn toàn mới (ví dụ: bật đèn pin, đặt báo thức, mở youtube)
    if (lower.includes('báo thức') || lower.includes('đèn pin') || lower.includes('mở ') || lower.includes('bật ') || lower.includes('chụp ảnh')) {
      this.pendingContactSelection = null;
      return false; // Tiếp tục xử lý lệnh mới
    }

    // Nếu là một lệnh gọi mới hoàn toàn
    if (lower.startsWith('gọi ') || lower.startsWith('nhắn ')) {
      this.pendingContactSelection = null;
      return false;
    }

    // Câu trả lời chưa rõ ràng: Nhắc người dùng chọn
    const promptText = `Dạ anh muốn chọn ai trong danh sách ạ? Anh hãy nói từ 1 đến ${contacts.length} hoặc chạm vào tên liên hệ trên màn hình nhé! 😊`;
    this.addMessage('bot', promptText);
    this.showResultInCapsule(query, promptText);
    if (this.ttsEnabled) this.speak(`Dạ anh hãy nói số thứ tự từ 1 đến ${contacts.length} hoặc chạm vào tên trên màn hình nhé!`);
    return true;
  }

  /**
   * Gửi câu hỏi dạng Text
   */
  async handleTextQuery(query) {
    if (!query || !query.trim()) return;
    const cleanQuery = query.trim();

    if (this.welcomeCard) {
      this.welcomeCard.style.display = 'none';
    }

    this.addMessage('user', cleanQuery);
    this.setDotState('thinking');
    this.showCapsule('thinking', 'Diana đang xử lý...', `"${cleanQuery}"`);
    this.updateLiveOverlayState('thinking', 'Đang xử lý...', `"${cleanQuery}"`);

    // 1. Kiểm tra xem người dùng có đang trả lời danh sách chọn liên hệ không
    if (this.pendingContactSelection) {
      if (await this.handlePendingContactChoice(cleanQuery)) {
        this.setDotState('idle');
        this.scheduleCapsuleClose(4000);
        return;
      }
    }

    // 2. Kiểm tra các lệnh Native trên thiết bị Android
    if (await this.handleNativeMobileActions(cleanQuery)) {
      this.setDotState('idle');
      this.scheduleCapsuleClose(4000);
      return;
    }

    try {
      let response = null;
      let usedUrl = this.getServerUrl();
      try {
        response = await fetch(usedUrl + '/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: cleanQuery })
        });
      } catch (firstErr) {
        console.warn(`[Diana Query] Gửi tới ${usedUrl} thất bại, đang thử các endpoint dự phòng...`, firstErr);
        const fallbacks = ['http://192.168.100.221:3000', 'http://127.0.0.1:3000', 'http://100.105.204.3:3000'].filter(u => u !== usedUrl);
        for (const fb of fallbacks) {
          try {
            response = await fetch(fb + '/api/voice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: cleanQuery })
            });
            if (response && response.ok) {
              this.activeServerUrl = fb;
              localStorage.setItem('diana_server_url', fb);
              console.log(`[Diana] Đã tự phục hồi sang máy chủ PC tại: ${fb}`);
              break;
            }
          } catch (_) {}
        }
      }

      if (!response) {
        throw new Error('Không thể kết nối tới máy chủ PC.');
      }

      const data = await response.json();

      if (data && data.reply) {
        const textReply = typeof data.reply === 'string' ? data.reply : (data.reply.text || JSON.stringify(data.reply));
        const attachments = data.reply.attachments || data.attachments || [];

        this.addMessage('bot', textReply, attachments);
        this.showResultInCapsule(cleanQuery, textReply, attachments);
        this.updateLiveOverlayState('speaking', 'Diana', textReply);

        if (this.ttsEnabled) {
          this.speak(textReply);
        } else {
          this.setDotState('idle');
          this.scheduleCapsuleClose(5000);
          if (this.autoVadEnabled) {
            setTimeout(() => {
              this.vadState = 'WAITING_VOICE';
              this.showCapsule('listening', 'Chế độ Rảnh tay', '👂 Diana đang chờ câu hỏi tiếp theo...');
            }, 1000);
          }
        }
      } else if (data && data.error) {
        const errMsg = `⚠️ Máy tính báo lỗi: ${data.error}`;
        this.addMessage('bot', errMsg);
        this.showResultInCapsule(cleanQuery, errMsg, []);
        this.updateLiveOverlayState('idle', 'Lỗi', errMsg);
        if (this.ttsEnabled) this.speak(errMsg);
      } else {
        const errMsg = '⚠️ Máy chủ PC không trả về dữ liệu.';
        this.addMessage('bot', errMsg);
        this.showResultInCapsule(cleanQuery, errMsg, []);
        this.updateLiveOverlayState('idle', 'Thông báo', errMsg);
        if (this.ttsEnabled) this.speak(errMsg);
      }
    } catch (err) {
      console.error('Lỗi khi gửi yêu cầu:', err);
      this.setDotState('idle');
      const errTxt = '⚠️ Không thể kết nối với máy tính PC. Anh kiểm tra lại xem PC đã bật server chưa nhé!';
      this.addMessage('bot', errTxt);
      this.showCapsule('idle', 'Mất kết nối PC', errTxt);
      this.updateLiveOverlayState('idle', 'Lỗi kết nối', errTxt);
      this.scheduleCapsuleClose(4000);
      this.autoDiscoverServer();
    }
  }

  /**
   * Phân tích ý định đặt báo thức đa dạng từ câu nói tự nhiên
   */
  parseAlarmIntent(query) {
    if (!query) return null;
    const lower = query.toLowerCase().trim();
    const norm = this.removeVietnameseAccents(lower);

    // Kiểm tra từ khóa báo thức / đánh thức
    const isAlarmIntent = 
      norm.includes('bao thuc') || 
      norm.includes('chuong bao') || 
      norm.includes('keu day') || 
      norm.includes('goi day') || 
      norm.includes('danh thuc') || 
      norm.includes('thuc day') ||
      norm.includes('hen gio day') ||
      norm.includes('dat gio day') ||
      norm.includes('keu toi day') ||
      norm.includes('goi toi day') ||
      norm.includes('keu anh day') ||
      norm.includes('goi anh day') ||
      ((norm.includes('dat bao') || norm.includes('cai bao') || norm.includes('hen bao')) && !norm.includes('bao cao'));

    if (!isAlarmIntent) return null;

    let hour = -1;
    let minutes = 0;
    let isRelative = false;

    // 1. Thời gian tương đối (VD: "sau 30 phút nữa", "15 phút nữa", "sau 1 tiếng 30 phút")
    const relMinMatch = lower.match(/(?:sau|trong)?\s*(\d{1,3})\s*(?:phút|p)\s*(?:nữa|nuoc)?/i);
    const relHourMatch = lower.match(/(?:sau|trong)?\s*(\d{1,2})\s*(?:tiếng|giờ|h)\s*(?:sau|nữa)?/i);

    if (lower.includes('sau') || lower.includes('nữa') || lower.includes('nuoc')) {
      let addMinutes = 0;
      if (relHourMatch) addMinutes += parseInt(relHourMatch[1], 10) * 60;
      if (relMinMatch) addMinutes += parseInt(relMinMatch[1], 10);
      if (addMinutes > 0) {
        const now = new Date();
        const targetTime = new Date(now.getTime() + addMinutes * 60000);
        hour = targetTime.getHours();
        minutes = targetTime.getMinutes();
        isRelative = true;
      }
    }

    if (!isRelative) {
      // 2. Định dạng: HH:MM hoặc HH h MM hoặc HH giờ MM phút (VD: "6:30", "06:30", "6h30", "6h 30", "6 giờ 30", "6 giờ 30 phút", "6h rưỡi", "6 giờ rưỡi")
      const timeMatch = lower.match(/(\d{1,2})\s*(?::|h| giờ| gio)\s*(\d{1,2}|rưỡi|ruoi)?/i);
      if (timeMatch) {
        hour = parseInt(timeMatch[1], 10);
        if (timeMatch[2]) {
          if (timeMatch[2] === 'rưỡi' || timeMatch[2] === 'ruoi') {
            minutes = 30;
          } else {
            minutes = parseInt(timeMatch[2], 10);
          }
        } else {
          if (lower.includes('rưỡi') || lower.includes('ruoi')) {
            minutes = 30;
          }
        }
      } else {
        // Chỉ có số giờ (VD: "lúc 6", "vào 7", "6h", "6 giờ")
        const hourOnlyMatch = lower.match(/(?:lúc|vào|đúng|tầm|luc|vao)?\s*(\d{1,2})\s*(?:h|giờ|gio)/i) ||
                              lower.match(/(?:lúc|vào|luc|vao)\s*(\d{1,2})/i);
        if (hourOnlyMatch) {
          hour = parseInt(hourOnlyMatch[1], 10);
          if (lower.includes('rưỡi') || lower.includes('ruoi')) {
            minutes = 30;
          }
        }
      }
    }

    if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59) {
      // Mặc định 7h sáng nếu người dùng chỉ nói "đặt báo thức" chung chung
      hour = 7;
      minutes = 0;
    }

    // Điều chỉnh AM/PM (sáng, trưa, chiều, tối, đêm)
    if (!isRelative) {
      if (norm.includes('chieu') || norm.includes('toi') || norm.includes('dem') || lower.includes('pm')) {
        if (hour < 12) hour += 12;
      } else if (norm.includes('sang') || lower.includes('am')) {
        if (hour === 12) hour = 0;
      } else if (norm.includes('trua')) {
        if (hour < 11 && hour > 0) hour += 12;
      }
    }

    // Trích xuất tên hoặc lý do báo thức
    let title = "Báo thức Diana";
    let cleanTitle = lower;
    cleanTitle = cleanTitle.replace(/^(?:diana\s+)?(?:làm ơn\s+|hãy\s+|giúp\s+)?(?:đặt|hẹn|bật|cài|keu|goi|danh thuc)\s+(?:báo thức|chuông báo|gio day|toi day|anh day|day)?/i, '');
    cleanTitle = cleanTitle.replace(/(?:điện thoại|cho tôi|cho anh|giùm anh|giúp anh|lúc|vào|sáng|chiều|tối|đêm|mai|ngay mai|\d{1,2}\s*(?::|h|giờ)\s*\d{0,2}|rưỡi|nhé|nha|ạ|đi)/gi, '');
    cleanTitle = cleanTitle.trim();
    if (cleanTitle.length > 2 && cleanTitle.length < 30) {
      title = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
    }

    return { hour, minutes, title };
  }

  /**
   * Xử lý các lệnh trực tiếp trên điện thoại Android qua DianaNative Plugin
   */
  async handleNativeMobileActions(query) {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.DianaNative) {
      return false;
    }
    const native = window.Capacitor.Plugins.DianaNative;
    const lower = query.toLowerCase();
    const normLower = this.removeVietnameseAccents(lower);

    // 1. Đặt báo thức điện thoại (Nhận diện mọi dạng câu lệnh báo thức tự nhiên)
    const alarmInfo = this.parseAlarmIntent(query);
    if (alarmInfo) {
      const { hour, minutes, title } = alarmInfo;
      try {
        const res = await native.setAlarm({ hour, minutes, title: title || "Báo thức Diana", skipUi: true });
        const timeStr = `${hour} giờ ${minutes < 10 ? '0' + minutes : minutes} phút`;
        const reply = res?.message || `Dạ em đã đặt chuông báo thức trên điện thoại lúc **${timeStr}** cho anh rồi nhé! ⏰`;
        this.addMessage('bot', reply);
        this.showResultInCapsule(query, reply);
        if (this.ttsEnabled) this.speak(`Dạ em đã cài báo thức điện thoại lúc ${timeStr} cho anh rồi ạ!`);
        return true;
      } catch (err) {
        console.warn('Lỗi Native setAlarm:', err);
        const timeStr = `${hour} giờ ${minutes < 10 ? '0' + minutes : minutes} phút`;
        const reply = `Dạ em đã gửi lệnh đặt báo thức lúc **${timeStr}** tới ứng dụng Đồng hồ trên điện thoại của anh rồi nhé! ⏰`;
        this.addMessage('bot', reply);
        this.showResultInCapsule(query, reply);
        if (this.ttsEnabled) this.speak(`Dạ em đã cài báo thức lúc ${timeStr} rồi ạ!`);
        return true;
      }
    }

    // 2. Gọi điện thoại / Nhắn tin Zalo / Gọi video / Gọi thường SIM
    const phoneMatch = lower.match(/(?:(?:gọi|nhắn tin|nhắn|chat|call|nháy máy|goi|nhan).{0,30}?)(\+?\d[\d\s.-]{7,15})/i) || lower.match(/(\+?\d[\d\s.-]{8,15})/i);
    
    // A. Nếu câu lệnh có chứa số điện thoại cụ thể
    if (phoneMatch && (/(?:gọi|nhắn|chat|call|zalo|sim|goi|nhan)/i.test(lower))) {
      const rawPhone = phoneMatch[1] || phoneMatch[0];
      const phone = rawPhone.replace(/[\s.-]/g, '');

      const isZalo = normLower.includes('zalo');
      const isChat = normLower.includes('nhan tin') || normLower.includes('nhan') || normLower.includes('gui tin') || normLower.includes('chat');
      const isVideo = normLower.includes('video') || normLower.includes('hinh');

      let app = isZalo ? 'zalo' : (isChat ? 'zalo' : 'phone');
      let action = 'call';
      if (isChat) action = 'chat';
      else if (isVideo) {
        action = 'video';
        app = 'zalo';
      }

      let sim = '';
      if (normLower.includes('vinaphone') || normLower.includes('vina')) {
        sim = 'vinaphone';
        app = 'phone';
      } else if (normLower.includes('viettel')) {
        sim = 'viettel';
        app = 'phone';
      } else if (normLower.includes('mobifone') || normLower.includes('mobi')) {
        sim = 'mobifone';
        app = 'phone';
      } else if (normLower.includes('sim 1') || normLower.includes('sim mot') || normLower.includes('sim một')) {
        sim = '1';
        app = 'phone';
      } else if (normLower.includes('sim 2') || normLower.includes('sim hai')) {
        sim = '2';
        app = 'phone';
      }

      try {
        const res = await native.makePhoneCall({ phoneNumber: phone, sim, app, action });
        let reply = res.message;
        if (!reply) {
          if (app === 'zalo') {
            if (action === 'chat') {
              reply = `Dạ em đã mở tin nhắn Zalo với số ${phone} cho anh rồi ạ! 💬`;
            } else if (action === 'video') {
              reply = `Dạ em đang mở Zalo để gọi Video tới số ${phone} cho anh rồi ạ! 📹`;
            } else {
              reply = `Dạ em đang mở cuộc gọi Zalo tới số ${phone} cho anh rồi ạ! 📞`;
            }
          } else {
            const simNotice = sim ? ` bằng SIM ${sim.toUpperCase()}` : '';
            reply = `Dạ em đang gọi thường tới số ${phone}${simNotice} cho anh rồi ạ! 📞`;
          }
        }
        this.addMessage('bot', reply);
        this.showResultInCapsule(query, reply);
        if (this.ttsEnabled) this.speak(reply);
        return true;
      } catch (err) {
        console.warn('Lỗi Native call/zalo:', err);
      }
    }

    // Lệnh quét / cập nhật / xem danh sách bạn bè Zalo
    if (/(?:quét|quet|cập nhật|cap nhat|làm mới|lam moi|danh sách|danh sach|xem)\s+(?:danh bạ\s+|danh ba\s+|bạn bè\s+|ban be\s+|tất cả\s+bạn\s+|tat ca\s+ban\s+)?zalo/i.test(lower) ||
        /(?:quét|quet|cập nhật|cap nhat|làm mới|lam moi)\s+(?:bạn bè|ban be|danh bạ|danh ba)/i.test(lower)) {
      const loadingMsg = '🔄 Dạ em đang quét danh sách bạn bè Zalo trực tiếp từ máy chủ Zalo, anh chờ em một chút nhé...';
      this.addMessage('bot', loadingMsg);
      this.showResultInCapsule(query, loadingMsg);
      if (this.ttsEnabled) this.speak('Dạ em đang quét danh sách bạn bè Zalo của anh ạ.');

      const friends = await this.syncZaloFriends(true);
      if (!friends || friends.length === 0) {
        const reply = 'Dạ em chưa tìm thấy danh sách bạn bè Zalo nào. Anh kiểm tra lại kết nối Zalo trên PC nhé! ⚠️';
        this.addMessage('bot', reply);
        this.showResultInCapsule(query, reply);
        if (this.ttsEnabled) this.speak(reply);
        return true;
      }

      const cardHtml = this.renderZaloFriendsListCard(friends);
      const replySpoken = `Dạ em đã quét được ${friends.length} người bạn trong tài khoản Zalo của anh rồi ạ!`;
      this.addMessage('bot', cardHtml, [], true);
      this.showResultInCapsule(query, cardHtml, [], true);
      if (this.ttsEnabled) this.speak(replySpoken);
      return true;
    }

    // B. Nếu câu lệnh gọi điện/nhắn tin bằng TÊN người trong danh bạ (ví dụ: "Gọi Zalo cho Phát", "Nhắn tin Zalo cho Phát", "Gọi video cho Phát", "Gọi thường cho Phát sim vinaphone")
    if (/(?:gọi|nhắn\s*tin|nhắn|chat|call|nháy\s*máy|gửi\s*tin|goi|nhan\s*tin|nhan|gui\s*tin|nhay\s*may)/i.test(lower)) {
      const isZalo = normLower.includes('zalo');
      const isChat = (normLower.includes('nhan tin') || normLower.includes('nhắn tin') || normLower.includes('nhan') || normLower.includes('nhắn') || normLower.includes('chat') || normLower.includes('gui tin') || normLower.includes('gửi tin'));
      const isVideo = (normLower.includes('video') || normLower.includes('mat') || normLower.includes('mặt'));
      
      let app = isZalo ? 'zalo' : 'phone';
      let action = 'call';
      if (isChat) {
        action = 'chat';
        if (!normLower.includes('thuong') && !normLower.includes('thường') && !normLower.includes('sim') && !normLower.includes('sms')) {
          app = 'zalo';
        }
      } else if (isVideo) {
        action = 'video';
        app = 'zalo';
      }

      let sim = '';
      if (normLower.includes('vinaphone') || normLower.includes('vina')) {
        sim = 'vinaphone';
        app = 'phone';
      } else if (normLower.includes('viettel')) {
        sim = 'viettel';
        app = 'phone';
      } else if (normLower.includes('mobifone') || normLower.includes('mobi')) {
        sim = 'mobifone';
        app = 'phone';
      } else if (normLower.includes('sim 1') || normLower.includes('sim mot') || normLower.includes('sim một')) {
        sim = '1';
        app = 'phone';
      } else if (normLower.includes('sim 2') || normLower.includes('sim hai')) {
        sim = '2';
        app = 'phone';
      } else if (normLower.includes('thuong') || normLower.includes('thường') || normLower.includes('dien thoai') || normLower.includes('gsm')) {
        app = 'phone';
      }

      // Trích xuất tên người cần tìm
      let nameStr = lower;
      nameStr = nameStr.replace(/^(?:diana\s+)?(?:làm ơn\s+|lam on\s+)?(?:hãy\s+|hay\s+)?(?:hãy giúp tôi\s+|hay giup toi\s+)?/i, '');
      nameStr = nameStr.replace(/^(?:gọi\s+điện\s+thoại|goi\s+dien\s+thoai|gọi\s+điện|goi\s+dien|gọi\s+thường|goi\s+thuong|gọi\s+sim|goi\s+sim|gọi\s+zalo\s+video|goi\s+zalo\s+video|gọi\s+video\s+zalo|goi\s+video\s+zalo|gọi\s+video|goi\s+video|gọi\s+zalo\s+thoại|goi\s+zalo\s+thoai|gọi\s+thoại\s+zalo|goi\s+thoai\s+zalo|gọi\s+thoại|goi\s+thoai|gọi\s+qua\s+zalo|goi\s+qua\s+zalo|gọi\s+bằng\s+zalo|goi\s+bang\s+zalo|gọi\s+zalo|goi\s+zalo|gọi|goi|nhắn\s+tin\s+zalo|nhan\s+tin\s+zalo|nhắn\s+zalo|nhan\s+zalo|nhắn\s+tin|nhan\s+tin|nhắn|nhan|gửi\s+tin\s+nhắn|gui\s+tin\s+nhan|gửi\s+tin|gui\s+tin|chat\s+zalo|chat|call|nháy\s+máy|nhay\s+may)\s+/i, '');
      nameStr = nameStr.replace(/^(?:cho|với|voi|tới|toi|đến|den)\s+/i, '');

      nameStr = nameStr.replace(/\s+(?:bằng\s+sim|bang\s+sim)\s+(?:vinaphone|vina|viettel|mobifone|mobi|1|2|một|mot|hai)$/i, '');
      nameStr = nameStr.replace(/\s+sim\s+(?:vinaphone|vina|viettel|mobifone|mobi|1|2|một|mot|hai)$/i, '');
      nameStr = nameStr.replace(/\s+(?:bằng\s+zalo|bang\s+zalo|qua\s+zalo|trong\s+zalo|zalo)$/i, '');
      nameStr = nameStr.replace(/\s+(?:đi|di|giúp|giup|với|voi|nhé|nhe|nha|ạ|a|nào|nao)$/i, '');
      nameStr = nameStr.replace(/^(?:anh|chị|chi|em|bạn|ban|chú|chu|bác|bac|cô|co|dì|di)\s+/i, '');

      const targetName = nameStr.trim();

      if (targetName && targetName.length >= 1) {
        try {
          let contacts = [];
          if (app === 'zalo') {
            // Quét chính xác trong danh sách bạn bè Zalo chính thức & Zalo linked contacts
            contacts = await this.searchZaloFriends(targetName);
          } else {
            // Quét danh bạ điện thoại chính của máy
            const res = await native.searchContacts({ name: targetName, onlyZaloFriends: false });
            contacts = (res && res.contacts) ? res.contacts : [];
          }

          // TH 1: Không tìm thấy liên hệ nào
          if (contacts.length === 0) {
            const isZaloSearch = (app === 'zalo');
            const targetLabel = isZaloSearch ? `bạn bè nào tên là **${targetName}** trong danh sách bạn bè Zalo` : `ai tên là **${targetName}** trong danh bạ máy`;
            const spokenLabel = isZaloSearch ? `bạn bè nào tên là ${targetName} trong danh sách bạn bè Zalo` : `ai tên là ${targetName} trong danh bạ máy`;
            const reply = `Dạ em không tìm thấy ${targetLabel} của anh ạ! 🔍`;
            const spokenText = `Dạ em không tìm thấy ${spokenLabel} của anh ạ!`;
            this.addMessage('bot', reply);
            this.showResultInCapsule(query, reply);
            if (this.ttsEnabled) this.speak(spokenText);
            return true;
          }

          // TH 2: Tìm thấy chính xác duy nhất 1 người -> Thực hiện ngay lập tức
          if (contacts.length === 1) {
            await this.executeContactAction(contacts[0], app, action, sim);
            return true;
          }

          // TH 3: Tìm thấy nhiều hơn 1 người (Đa nghĩa) -> Hiển thị danh sách và đọc số thứ tự để người dùng chọn
          this.pendingContactSelection = {
            targetName,
            app,
            action,
            sim,
            contacts: contacts.slice(0, 5),
            createdAt: Date.now()
          };

          const cardHtml = this.renderContactChoiceCard(this.pendingContactSelection.contacts, targetName, app, action, sim);
          const actionVerb = action === 'chat' ? 'nhắn tin' : (action === 'video' ? 'gọi video' : 'gọi');
          const appLabel = app === 'zalo' ? 'Zalo ' : '';
          
          let spokenPrompt = `Dạ anh muốn ${actionVerb} ${appLabel}cho ${targetName} nào trong danh sách ạ? `;
          const listSpoken = this.pendingContactSelection.contacts.map((c, i) => `Số ${i + 1} là ${c.name}`).join(', ');
          spokenPrompt += listSpoken + '. Anh hãy nói số thứ tự hoặc chạm vào tên nhé!';

          this.addMessage('bot', cardHtml, [], true);
          this.showResultInCapsule(query, cardHtml, [], true);
          if (this.ttsEnabled) this.speak(spokenPrompt);
          return true;
        } catch (err) {
          console.warn('Lỗi tìm kiếm danh bạ:', err);
          const reply = `⚠️ Không thể truy cập danh bạ: ${err.message || err}`;
          this.addMessage('bot', reply);
          this.showResultInCapsule(query, reply);
          if (this.ttsEnabled) this.speak('Dạ em gặp lỗi khi tìm kiếm danh bạ ạ.');
          return true;
        }
      }
    }

    // 2.6 Kích hoạt chế độ Cử chỉ không chạm Air Gesture (Huawei Grab & Drop)
    if (normLower.includes('air gesture') || normLower.includes('cu chi khong cham') || normLower.includes('truyen cu chi') || normLower.includes('bat cu chi') || (normLower.includes('truyen') && normLower.includes('may tinh')) || (normLower.includes('chum tay') && normLower.includes('may tinh'))) {
      this.toggleAirGestureMode();
      return true;
    }

    // 3. Đèn pin
    if (lower.includes('bật đèn pin') || lower.includes('mở đèn pin')) {
      try {
        await native.toggleFlashlight({ enable: true });
        const reply = 'Dạ em đã bật đèn pin điện thoại rồi ạ! 🔦';
        this.addMessage('bot', reply);
        this.showResultInCapsule(query, reply);
        if (this.ttsEnabled) this.speak(reply);
        return true;
      } catch (_) {}
    } else if (lower.includes('tắt đèn pin')) {
      try {
        await native.toggleFlashlight({ enable: false });
        const reply = 'Dạ em đã tắt đèn pin rồi ạ! ✨';
        this.addMessage('bot', reply);
        this.showResultInCapsule(query, reply);
        if (this.ttsEnabled) this.speak(reply);
        return true;
      } catch (_) {}
    }

    // 4. Mở BẤT KỲ ứng dụng, Game, Camera, Ghi chú, Cài đặt, Thư viện trên điện thoại
    const openAppRegex = /^(?:diana\s+ơi\s*,?\s*|diana\s*,?\s*|em\s+ơi\s*,?\s*)?(?:làm ơn\s+|hãy\s+|giúp\s+anh\s+|nhờ\s+em\s+|cho\s+anh\s+|lam on\s+|hay\s+|giup anh\s+|nho em\s+)?(?:mở|bật|vào|chạy|khởi\s*động|chơi|open|launch|start|mo|bat|vao|chay|khoi\s*dong|choi)\s+(?:ứng\s*dụng\s+|app\s+|phần\s*mềm\s+|trò\s*chơi\s+|game\s+|ung\s*dung\s+|phan\s*mem\s+|tro\s*choi\s+)?(.+?)$/i;

    const openAppMatch = lower.match(openAppRegex) || normLower.match(openAppRegex);
    
    const isSpecialAppAction = 
      normLower.includes('camera') || normLower.includes('may anh') || normLower.includes('chup anh') || normLower.includes('chup hinh') || normLower.includes('quay phim') || normLower.includes('quay video') ||
      normLower.includes('ghi chu') || normLower.includes('notes') || normLower.includes('note') || normLower.includes('so tay') ||
      normLower.includes('bo suu tap') || normLower.includes('thu vien anh') || normLower.includes('xem anh') || normLower.includes('gallery') || normLower.includes('photos') ||
      normLower.includes('cai dat') || normLower.includes('settings') || normLower.includes('setting') ||
      normLower.includes('choi game') || normLower.includes('lien quan') || normLower.includes('pubg') || normLower.includes('free fire') || normLower.includes('roblox') || normLower.includes('genshin') || normLower.includes('toc chien') ||
      normLower.includes('calculator') || normLower.includes('tin nhan') || normLower.includes('sms') || normLower.includes('messages') ||
      normLower.includes('dong ho') || normLower.includes('clock') || normLower.includes('ban do') || normLower.includes('maps') ||
      normLower.includes('trinh duyet') || normLower.includes('chrome') || normLower.includes('youtube') || normLower.includes('facebook') || normLower.includes('tiktok');

    const isExplicitPcCommand = normLower.includes('tren may tinh') || normLower.includes('tren pc') || normLower.includes('tren laptop');

    if ((openAppMatch || isSpecialAppAction) && !isExplicitPcCommand) {
      let rawTarget = openAppMatch ? (openAppMatch[1] || openAppMatch[0]) : lower;
      rawTarget = rawTarget.replace(/^(?:diana\s+ơi\s*,?\s*|diana\s*,?\s*|em\s+ơi\s*,?\s*)?(?:làm ơn\s+|hãy\s+|giúp\s+anh\s+|nhờ\s+em\s+|cho\s+anh\s+|lam on\s+|hay\s+|giup anh\s+|nho em\s+)?(?:mở|bật|vào|chạy|khởi\s*động|chơi|open|launch|start|mo|bat|vao|chay|khoi\s*dong|choi)\s+/i, '');
      rawTarget = rawTarget.replace(/^(?:ứng\s*dụng\s+|app\s+|phần\s*mềm\s+|trò\s*chơi\s+|game\s+|ung\s*dung\s+|phan\s*mem\s+|tro\s*choi\s+)/i, '');
      rawTarget = rawTarget.replace(/(?:điện thoại|trên máy|trên đt|dien thoai|tren may|tren dt|cho anh|cho tôi|giùm anh|giúp anh|cho toi|gium anh|giup anh|đi|nhé|nha|ạ|lên|ngay|liền|di|nhe|a|len|lien)$/gi, '');
      rawTarget = rawTarget.trim();

      if (!rawTarget && isSpecialAppAction) {
        rawTarget = lower;
      }

      if (rawTarget && rawTarget.length >= 1 && 
          !rawTarget.includes('màn hình') && !rawTarget.includes('man hinh') &&
          !rawTarget.includes('đèn pin') && !rawTarget.includes('den pin') &&
          !rawTarget.includes('báo thức') && !rawTarget.includes('bao thuc') &&
          !rawTarget.includes('âm lượng') && !rawTarget.includes('am luong')) {
        try {
          const res = await native.openApp({ appName: rawTarget });
          if (res && res.success) {
            const appDisplayName = res.appName || rawTarget;
            const reply = `Dạ em đã mở **${appDisplayName}** trên điện thoại cho anh rồi ạ! 🚀`;
            this.addMessage('bot', reply);
            this.showResultInCapsule(query, reply);
            if (this.ttsEnabled) this.speak(`Dạ em đã mở ${appDisplayName} cho anh rồi ạ!`);
            return true;
          }
        } catch (err) {
          console.warn('Lỗi native.openApp:', err);
          const found = await this.tryFuzzyOpenApp(rawTarget, query);
          if (found) return true;
        }
      }
    }

    // 5. Chỉnh âm lượng điện thoại
    const volMatch = lower.match(/(?:chỉnh|tăng|giảm|đặt)\s*âm\s*lượng\s*(?:lên|xuống|ở|mức)?\s*(\d{1,3})%/i);
    if (volMatch) {
      const pct = Math.min(100, Math.max(0, parseInt(volMatch[1], 10)));
      try {
        await native.setVolume({ percent: pct });
        const reply = `Dạ em đã chỉnh âm lượng điện thoại về ${pct}% rồi ạ! 🔊`;
        this.addMessage('bot', reply);
        this.showResultInCapsule(query, reply);
        if (this.ttsEnabled) this.speak(reply);
        return true;
      } catch (_) {}
    }

    return false;
  }

  /**
   * Quét và mở ứng dụng theo thuật toán đối sánh mờ danh sách ứng dụng đã cài đặt trên máy
   */
  async tryFuzzyOpenApp(targetName, query) {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.DianaNative) return false;
    const native = window.Capacitor.Plugins.DianaNative;
    try {
      const appsRes = await native.getInstalledApps();
      if (appsRes && Array.isArray(appsRes.apps)) {
        const normTarget = this.removeVietnameseAccents(targetName.toLowerCase().trim());
        let bestApp = null;
        let maxScore = 0;

        for (const app of appsRes.apps) {
          const normName = this.removeVietnameseAccents(app.appName.toLowerCase().trim());
          const pkg = app.packageName.toLowerCase();

          let score = 0;
          if (normName === normTarget) score = 120;
          else if (normName.startsWith(normTarget)) score = 100;
          else if (normName.includes(normTarget)) score = 80;
          else if (pkg.includes(normTarget)) score = 60;

          if (score > maxScore) {
            maxScore = score;
            bestApp = app;
          }
        }

        if (bestApp && maxScore >= 60) {
          const openRes = await native.openApp({ packageName: bestApp.packageName, appName: bestApp.appName });
          if (openRes && openRes.success) {
            const reply = `Dạ em đã mở ứng dụng **${bestApp.appName}** trên điện thoại cho anh rồi ạ! 🚀`;
            this.addMessage('bot', reply);
            this.showResultInCapsule(query, reply);
            if (this.ttsEnabled) this.speak(`Dạ em đã mở ${bestApp.appName} cho anh rồi ạ!`);
            return true;
          }
        }
      }
    } catch (_) {}
    return false;
  }

  /**
   * Dừng toàn bộ các luồng âm thanh đang phát
   */
  stopAudioPlayback() {
    if (this.currentDspSource) {
      try { this.currentDspSource.stop(); } catch (_) {}
      this.currentDspSource = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (_) {}
      this.currentAudio = null;
    }
    if (this.synth && this.synth.speaking) {
      try { this.synth.cancel(); } catch (_) {}
    }
  }

  /**
   * Phát Audio qua bộ xử lý âm thanh số DSP (Web Audio API)
   */
  async playDspAudio(audioUrl, onPlay, onEnded, onError) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      const vol = (parseFloat(this.voiceSettings?.volume) || 100) / 100;
      audio.volume = Math.min(1.0, Math.max(0.1, vol));
      audio.onplay = () => { if (onPlay) onPlay(); };
      audio.onended = () => { this.currentAudio = null; if (onEnded) onEnded(); };
      audio.onerror = (e) => { this.currentAudio = null; if (onError) onError(e); };
      return audio.play().catch(onError);
    }

    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      // 1. Tải và giải mã âm thanh
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      
      const decodedBuffer = await new Promise((resolve, reject) => {
        this.audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
      });

      this.stopAudioPlayback();

      const source = this.audioCtx.createBufferSource();
      source.buffer = decodedBuffer;
      this.currentDspSource = source;

      // 2. Thiết lập chuỗi hiệu ứng DSP Filter Chain
      const fxMode = this.voiceSettings?.audioFx || 'studio';
      const volRatio = Math.max(0.1, (parseFloat(this.voiceSettings?.volume) || 100) / 100);

      const gainNode = this.audioCtx.createGain();
      gainNode.gain.setValueAtTime(volRatio, this.audioCtx.currentTime);

      let lastNode = source;

      if (fxMode === 'studio') {
        // === STUDIO CLARITY: Tinh lọc trong trẻo, cắt ù nền, nâng sáng dải trung-cao & nén vocal broadcast ===
        const hpFilter = this.audioCtx.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.setValueAtTime(95, this.audioCtx.currentTime);

        const warmPeaking = this.audioCtx.createBiquadFilter();
        warmPeaking.type = 'peaking';
        warmPeaking.frequency.setValueAtTime(240, this.audioCtx.currentTime);
        warmPeaking.Q.setValueAtTime(1.0, this.audioCtx.currentTime);
        warmPeaking.gain.setValueAtTime(2.0, this.audioCtx.currentTime);

        const clarityPeaking = this.audioCtx.createBiquadFilter();
        clarityPeaking.type = 'peaking';
        clarityPeaking.frequency.setValueAtTime(3600, this.audioCtx.currentTime);
        clarityPeaking.Q.setValueAtTime(1.1, this.audioCtx.currentTime);
        clarityPeaking.gain.setValueAtTime(6.0, this.audioCtx.currentTime);

        const airHighShelf = this.audioCtx.createBiquadFilter();
        airHighShelf.type = 'highshelf';
        airHighShelf.frequency.setValueAtTime(8000, this.audioCtx.currentTime);
        airHighShelf.gain.setValueAtTime(4.0, this.audioCtx.currentTime);

        const compressor = this.audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-18, this.audioCtx.currentTime);
        compressor.knee.setValueAtTime(12, this.audioCtx.currentTime);
        compressor.ratio.setValueAtTime(3.5, this.audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, this.audioCtx.currentTime);

        lastNode.connect(hpFilter);
        hpFilter.connect(warmPeaking);
        warmPeaking.connect(clarityPeaking);
        clarityPeaking.connect(airHighShelf);
        airHighShelf.connect(compressor);
        lastNode = compressor;

      } else if (fxMode === 'bass') {
        // === WARM BASS: Trầm ấm, dày dặn, mượt mà và êm tai ===
        const lowShelf = this.audioCtx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.setValueAtTime(220, this.audioCtx.currentTime);
        lowShelf.gain.setValueAtTime(8.5, this.audioCtx.currentTime);

        const chestPeaking = this.audioCtx.createBiquadFilter();
        chestPeaking.type = 'peaking';
        chestPeaking.frequency.setValueAtTime(450, this.audioCtx.currentTime);
        chestPeaking.Q.setValueAtTime(1.2, this.audioCtx.currentTime);
        chestPeaking.gain.setValueAtTime(3.5, this.audioCtx.currentTime);

        const highDeHarsh = this.audioCtx.createBiquadFilter();
        highDeHarsh.type = 'lowpass';
        highDeHarsh.frequency.setValueAtTime(7500, this.audioCtx.currentTime);

        const compressor = this.audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-15, this.audioCtx.currentTime);
        compressor.ratio.setValueAtTime(4.0, this.audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.01, this.audioCtx.currentTime);
        compressor.release.setValueAtTime(0.2, this.audioCtx.currentTime);

        lastNode.connect(lowShelf);
        lowShelf.connect(chestPeaking);
        chestPeaking.connect(highDeHarsh);
        highDeHarsh.connect(compressor);
        lastNode = compressor;

      } else if (fxMode === 'spatial') {
        // === SPATIAL 3D: Âm thanh vòm không gian Studio 3D chân thực (Convolution Room Reverb cao cấp) ===
        const presenceEQ = this.audioCtx.createBiquadFilter();
        presenceEQ.type = 'peaking';
        presenceEQ.frequency.setValueAtTime(3200, this.audioCtx.currentTime);
        presenceEQ.gain.setValueAtTime(3.0, this.audioCtx.currentTime);

        const airSparkle = this.audioCtx.createBiquadFilter();
        airSparkle.type = 'highshelf';
        airSparkle.frequency.setValueAtTime(7500, this.audioCtx.currentTime);
        airSparkle.gain.setValueAtTime(2.5, this.audioCtx.currentTime);

        // Tạo xung phản xạ không gian phòng thu cao cấp (Studio Ambience Impulse)
        const convolver = this.audioCtx.createConvolver();
        const duration = 0.7; // Độ dài đuôi vang 0.7 giây
        const decay = 3.2;    // Độ suy giảm mượt mà
        const sampleRate = this.audioCtx.sampleRate;
        const length = Math.floor(sampleRate * duration);
        const impulse = this.audioCtx.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const env = Math.exp(-t * decay);
          left[i] = (Math.random() * 2 - 1) * env;
          right[i] = (Math.random() * 2 - 1) * env;
        }
        convolver.buffer = impulse;

        // Bộ lọc làm mịn và ấm đuôi vang không gian
        const reverbDamp = this.audioCtx.createBiquadFilter();
        reverbDamp.type = 'lowpass';
        reverbDamp.frequency.setValueAtTime(4200, this.audioCtx.currentTime);

        // Kênh âm thanh trực tiếp (Dry)
        const dryGain = this.audioCtx.createGain();
        dryGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

        // Kênh không gian vòm 3D (Wet) - Âm vang rõ ràng, êm ái, sang trọng
        const wetGain = this.audioCtx.createGain();
        wetGain.gain.setValueAtTime(0.35, this.audioCtx.currentTime);

        lastNode.connect(presenceEQ);
        presenceEQ.connect(airSparkle);

        // Nhánh trực tiếp
        airSparkle.connect(dryGain);

        // Nhánh không gian vòm 3D
        airSparkle.connect(convolver);
        convolver.connect(reverbDamp);
        reverbDamp.connect(wetGain);

        const merger = this.audioCtx.createGain();
        dryGain.connect(merger);
        wetGain.connect(merger);
        lastNode = merger;
      }

      // Kết nối Master Gain đến Loa ngoài
      lastNode.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      source.onended = () => {
        this.currentDspSource = null;
        if (onEnded) onEnded();
      };

      source.start(0);
      if (onPlay) onPlay();

    } catch (err) {
      console.warn('[Web Audio DSP Engine Fallback]:', err);
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      const vol = (parseFloat(this.voiceSettings?.volume) || 100) / 100;
      audio.volume = Math.min(1.0, Math.max(0.1, vol));
      audio.onplay = () => { if (onPlay) onPlay(); };
      audio.onended = () => { this.currentAudio = null; if (onEnded) onEnded(); };
      audio.onerror = (e) => { this.currentAudio = null; if (onError) onError(e); };
      return audio.play().catch(onError);
    }
  }

  /**
   * Phát âm văn bản tiếng Việt tự nhiên cho Diana (Cloud Natural Voice + Web Audio DSP + Fallback SpeechSynthesis)
   */
  speak(text) {
    if (!this.ttsEnabled) {
      if (this.autoVadEnabled) {
        this.vadState = 'WAITING_VOICE';
      }
      return;
    }

    const cleanText = text
      .replace(/[*_#`~]/g, '')
      .replace(/[\u{1F600}-\u{1F6FF}|[\u{1F300}-\u{1F5FF}|[\u{1F900}-\u{1F9FF}|[\u{2600}-\u{26FF}]/gu, '')
      .replace(/\n+/g, '. ')
      .trim();

    if (!cleanText) {
      this.setDotState('idle');
      this.scheduleCapsuleClose(4000);
      if (this.autoVadEnabled) {
        this.vadState = 'WAITING_VOICE';
      }
      return;
    }

    this.stopAudioPlayback();

    this.vadState = 'SPEAKING';
    this.isSpeaking = true;
    this.setDotState('speaking');
    this.capsuleStatus.textContent = 'Diana đang nói...';
    this.updateLiveOverlayState('speaking', 'Diana đang nói', text);

    if (this.voiceSettings && this.voiceSettings.voicePreset === 'device_system') {
      this.fallbackSpeechSynthesis(cleanText);
      return;
    }

    try {
      const voiceParam = encodeURIComponent(this.voiceSettings?.voicePreset || 'diana_female');
      const apiKeyParam = this.voiceSettings?.minimaxApiKey ? `&apiKey=${encodeURIComponent(this.voiceSettings.minimaxApiKey)}` : '';
      const pitchParam = `&pitch=${encodeURIComponent(this.voiceSettings?.pitch || 1.0)}`;
      const speedParam = `&speed=${encodeURIComponent(this.voiceSettings?.speed || 1.0)}`;
      const volRatio = ((parseFloat(this.voiceSettings?.volume) || 100) / 100).toFixed(2);
      const volParam = `&volume=${encodeURIComponent(volRatio)}`;
      const cadenceParam = `&cadence=${encodeURIComponent(this.voiceSettings?.cadence || 'normal')}`;
      const serverBase = this.getServerUrl();
      const ttsUrl = `${serverBase}/api/tts?text=${encodeURIComponent(cleanText.slice(0, 450))}&voice=${voiceParam}${pitchParam}${speedParam}${volParam}${cadenceParam}${apiKeyParam}`;

      this.playDspAudio(
        ttsUrl,
        () => {
          this.isSpeaking = true;
          this.setDotState('speaking');
          this.capsuleStatus.textContent = 'Diana đang nói...';
        },
        () => {
          this.isSpeaking = false;
          this.setDotState('idle');
          if (this.autoVadEnabled) {
            setTimeout(() => {
              this.vadState = 'WAITING_VOICE';
              this.showCapsule('listening', 'Chế độ Rảnh tay', '👂 Diana đang chờ câu hỏi tiếp theo...');
              this.updateLiveOverlayState('listening', 'Rảnh tay đang bật', 'Hãy nói câu hỏi của anh nhé...');
            }, 400);
          } else {
            this.scheduleCapsuleClose(4000);
            this.updateLiveOverlayState('idle', 'Sẵn sàng', 'Chạm vào hình cầu để nói...');
          }
        },
        (err) => {
          console.warn('[DSP Engine Fallback to SpeechSynthesis]:', err);
          this.fallbackSpeechSynthesis(cleanText);
        }
      );
    } catch (_) {
      this.fallbackSpeechSynthesis(cleanText);
    }
  }

  fallbackSpeechSynthesis(cleanText) {
    if (!this.synth) {
      this.isSpeaking = false;
      this.setDotState('idle');
      this.scheduleCapsuleClose(3000);
      if (this.autoVadEnabled) {
        this.vadState = 'WAITING_VOICE';
        this.updateLiveOverlayState('listening', 'Rảnh tay đang bật', 'Hãy nói câu hỏi của anh nhé...');
      }
      return;
    }

    try {
      this.synth.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'vi-VN';
      utterance.rate = this.voiceSettings?.speed || 1.0;
      utterance.pitch = this.voiceSettings?.pitch || 1.0;

      const voices = this.synth.getVoices();
      let selectedVoice = null;
      if (this.voiceSettings?.systemVoiceURI) {
        selectedVoice = voices.find(v => v.voiceURI === this.voiceSettings.systemVoiceURI || v.name === this.voiceSettings.systemVoiceURI);
      }
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang && (v.lang.includes('vi') || v.lang.includes('VN')));
      }
      if (selectedVoice) utterance.voice = selectedVoice;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.setDotState('speaking');
        this.capsuleStatus.textContent = 'Diana đang nói...';
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.setDotState('idle');
        if (this.autoVadEnabled) {
          setTimeout(() => {
            this.vadState = 'WAITING_VOICE';
            this.showCapsule('listening', 'Chế độ Rảnh tay', '👂 Diana đang chờ câu hỏi tiếp theo...');
            this.updateLiveOverlayState('listening', 'Rảnh tay đang bật', 'Hãy nói câu hỏi của anh nhé...');
          }, 400);
        } else {
          this.scheduleCapsuleClose(4000);
          this.updateLiveOverlayState('idle', 'Sẵn sàng', 'Chạm vào hình cầu để nói...');
        }
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.setDotState('idle');
        if (this.autoVadEnabled) this.vadState = 'WAITING_VOICE';
        this.scheduleCapsuleClose(3000);
      };

      this.synth.speak(utterance);
    } catch (_) {
      this.isSpeaking = false;
      this.setDotState('idle');
      if (this.autoVadEnabled) this.vadState = 'WAITING_VOICE';
      this.scheduleCapsuleClose(3000);
    }
  }

  setDotState(state) {
    if (!this.assistiveDot) return;
    this.assistiveDot.classList.remove('listening', 'thinking', 'speaking');
    if (state !== 'idle') {
      this.assistiveDot.classList.add(state);
    }
  }

  showCapsule(state, title, transcript) {
    if (this.capsuleAutoCloseTimer) {
      clearTimeout(this.capsuleAutoCloseTimer);
      this.capsuleAutoCloseTimer = null;
    }

    this.dynamicCapsule.classList.add('active');
    this.capsuleStatus.textContent = title;
    this.capsuleTranscript.innerHTML = transcript;
    this.capsuleResult.style.display = 'none';
    this.capsuleWave.style.display = state === 'listening' ? 'flex' : 'none';
  }

  showResultInCapsule(query, replyText, attachments = [], isHtml = false) {
    this.dynamicCapsule.classList.add('active');
    this.capsuleStatus.textContent = 'Diana';
    this.capsuleTranscript.innerHTML = `<strong>"${this.escapeHtml(query)}"</strong>`;
    this.capsuleWave.style.display = 'none';
    this.capsuleResult.style.display = 'block';
    this.capsuleReplyText.innerHTML = isHtml ? replyText : this.formatMarkdown(replyText);

    if (attachments && attachments.length > 0) {
      const fileName = attachments[0].split(/[\\/]/).pop();
      const url = `${this.getServerUrl()}/api/screenshot/${encodeURIComponent(fileName)}`;
      this.capsuleScreenshotImg.src = url;
      this.capsuleScreenshot.style.display = 'block';
      this.capsuleScreenshot.onclick = () => this.openLightbox(url);
    } else {
      this.capsuleScreenshot.style.display = 'none';
    }
  }

  hideCapsule() {
    this.dynamicCapsule.classList.remove('active');
  }

  scheduleCapsuleClose(delayMs = 4000) {
    if (this.capsuleAutoCloseTimer) {
      clearTimeout(this.capsuleAutoCloseTimer);
    }
    this.capsuleAutoCloseTimer = setTimeout(() => {
      this.hideCapsule();
    }, delayMs);
  }

  addMessage(sender, text, attachments = [], isHtml = false) {
    const item = document.createElement('div');
    item.className = `message-item ${sender}`;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    let avatarHtml = sender === 'bot' ? `<div class="msg-bot-avatar"><img src="/avatar.png" alt="Diana"></div>` : '';
    let contentHtml = isHtml ? text : this.formatMarkdown(text);
    let html = `<div class="message-row">${avatarHtml}<div class="message-bubble">${contentHtml}`;

    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        const fileName = att.split(/[\\/]/).pop();
        const url = `${this.getServerUrl()}/api/screenshot/${encodeURIComponent(fileName)}`;
        html += `
          <div class="screenshot-preview" onclick="window.dianaApp.openLightbox('${url}')">
            <img src="${url}" alt="Screenshot PC" loading="lazy" />
            <div class="screenshot-tag">🔍 Chạm để phóng to</div>
          </div>
        `;
      }
    }

    html += `</div></div><span class="message-time">${timeStr}</span>`;
    item.innerHTML = html;

    this.chatMessages.appendChild(item);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

    if (!this.chatHistory) this.chatHistory = [];
    this.chatHistory.push({
      sender,
      text,
      attachments,
      isHtml,
      timeStr,
      timestamp: Date.now()
    });
    // Giữ tối đa 50 tin nhắn gần nhất
    if (this.chatHistory.length > 50) this.chatHistory.shift();
  }


  openLightbox(url) {
    if (!this.imageLightbox || !this.lightboxImg) return;
    this.lightboxImg.src = url;
    this.imageLightbox.style.display = 'flex';
  }

  closeLightbox() {
    if (this.imageLightbox) {
      this.imageLightbox.style.display = 'none';
    }
  }

  formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  getServerUrl() {
    if (window.Capacitor) {
      return this.activeServerUrl || localStorage.getItem('diana_server_url') || 'https://diana-h73u.onrender.com';
    }
    return '';
  }

  /**
   * Tự động quét và kết nối với IP máy tính hoặc Cloud Server mà không cần người dùng nhập tay
   */
  async autoDiscoverServer() {
    if (!window.Capacitor) return;

    // Danh sách các địa chỉ IP tiềm năng của máy tính theo thứ tự ưu tiên
    const saved = localStorage.getItem('diana_server_url');
    const candidates = [
      'https://diana-h73u.onrender.com', // Cloud Render Server (Luôn online 24/7 ở mọi nơi)
      saved,
      'http://192.168.100.221:3000',     // Wi-Fi hiện tại của PC (nếu chạy server local)
      'http://127.0.0.1:3000',           // Localhost qua ADB Reverse
      'http://100.105.204.3:3000',       // Tailscale VPN (Cố định vĩnh viễn ở mọi nơi, 4G, 5G, Wi-Fi)
      'http://192.168.1.18:3000',        // Wi-Fi trước đó
      'http://10.0.2.2:3000'
    ].filter(Boolean);

    // Loại bỏ trùng lặp
    const uniqueCandidates = [...new Set(candidates)];

    const ping = (url) => new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      fetch(`${url}/api/status`, { signal: controller.signal })
        .then(res => res.json())
        .then(data => {
          clearTimeout(timeoutId);
          console.log('[Diana AutoDiscover] Connected to:', url, data);
          resolve({ url, data });
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
    });

    try {
      const result = await Promise.any(uniqueCandidates.map(ping));
      if (result && result.url) {
        this.activeServerUrl = result.url;
        localStorage.setItem('diana_server_url', result.url);
        const isPCOnline = result.data?.pcOnline !== false;
        if (this.pcStatusBadge) {
          if (isPCOnline) {
            this.pcStatusBadge.className = 'status-badge online';
            this.pcStatusText.textContent = 'PC Online';
          } else {
            this.pcStatusBadge.className = 'status-badge offline';
            this.pcStatusText.textContent = 'PC Offline';
          }
        }
        return;
      }
    } catch (_) {
      if (this.pcStatusBadge) {
        this.pcStatusBadge.className = 'status-badge offline';
        this.pcStatusText.textContent = 'Chưa kết nối';
      }
    }
  }

  async checkPCStatus() {
    if (window.Capacitor) {
      await this.autoDiscoverServer();
      return;
    }

    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data && data.pcOnline) {
        this.pcStatusBadge.className = 'status-badge online';
        this.pcStatusText.textContent = 'PC Online';
      } else {
        this.pcStatusBadge.className = 'status-badge offline';
        this.pcStatusText.textContent = 'PC Offline';
      }
    } catch (_) {
      if (this.pcStatusBadge) {
        this.pcStatusBadge.className = 'status-badge offline';
        this.pcStatusText.textContent = 'Chưa kết nối';
      }
    }
  }

  toggleTTS() {
    this.haptic(30);
    this.ttsEnabled = !this.ttsEnabled;
    localStorage.setItem('diana_tts', this.ttsEnabled);
    this.updateTTSButtonState();
    if (!this.ttsEnabled) {
      this.stopAudioPlayback();
    }
  }

  updateTTSButtonState() {
    if (this.ttsEnabled) {
      this.ttsToggleBtn.classList.remove('muted');
      this.ttsToggleBtn.classList.add('active');
      this.ttsToggleBtn.title = 'Giọng nói: ĐANG BẬT';
    } else {
      this.ttsToggleBtn.classList.remove('active');
      this.ttsToggleBtn.classList.add('muted');
      this.ttsToggleBtn.title = 'Giọng nói: ĐÃ TẮT';
    }
  }

  toggleDotVisibility() {
    this.haptic(30);
    this.dotEnabled = !this.dotEnabled;
    localStorage.setItem('diana_dot_visible', this.dotEnabled);
    this.updateDotVisibilityState();
  }

  updateDotVisibilityState() {
    if (this.dotEnabled) {
      if (this.assistiveDot) this.assistiveDot.style.display = 'block';
      if (this.dotToggleBtn) {
        this.dotToggleBtn.classList.add('active');
        this.dotToggleBtn.title = 'Chấm AssistiveTouch: ĐANG BẬT';
      }
    } else {
      if (this.assistiveDot) this.assistiveDot.style.display = 'none';
      if (this.dotToggleBtn) {
        this.dotToggleBtn.classList.remove('active');
        this.dotToggleBtn.title = 'Chấm AssistiveTouch: ĐÃ ẨN';
      }
    }
  }

  /**
   * Chế độ thoại toàn màn hình Live Voice Mode (Siri / Gemini Live)
   */
  openLiveVoiceMode() {
    this.haptic(40);
    if (this.liveVoiceOverlay) {
      this.liveVoiceOverlay.style.display = 'flex';
      if (this.autoVadEnabled) {
        this.updateLiveOverlayState('listening', 'Rảnh tay đang bật', 'Hãy nói câu hỏi của anh nhé...');
      } else {
        this.updateLiveOverlayState('idle', 'Sẵn sàng', 'Chạm vào hình cầu để nói chuyện cùng Diana nhé!');
      }
    }
  }

  closeLiveVoiceMode() {
    this.haptic(30);
    if (this.liveVoiceOverlay) {
      this.liveVoiceOverlay.style.display = 'none';
    }
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  updateLiveOverlayState(state, statusLabel, text) {
    if (!this.liveVoiceOverlay) return;
    if (this.liveStatusLabel) this.liveStatusLabel.textContent = statusLabel;
    if (this.liveTranscriptText) this.liveTranscriptText.textContent = text;

    if (this.liveOrbCore) {
      if (state === 'listening') {
        this.liveOrbCore.style.transform = 'scale(1.1)';
      } else if (state === 'thinking') {
        this.liveOrbCore.style.transform = 'scale(0.95)';
      } else {
        this.liveOrbCore.style.transform = 'scale(1)';
      }
    }
  }

  setupQuickChips() {
    const chips = document.querySelectorAll('.chip[data-query]');
    chips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        this.haptic(30);
        const query = chip.getAttribute('data-query');
        if (query) {
          this.handleTextQuery(query);
        }
      });
    });

    if (this.autoVadChip) {
      this.autoVadChip.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleAutoVad();
      });
    }
  }

  setupPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (this.pwaBanner) {
        this.pwaBanner.classList.add('show');
      }
    });

    if (this.pwaInstallBtn) {
      this.pwaInstallBtn.addEventListener('click', async () => {
        if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          const choice = await this.deferredPrompt.userChoice;
          if (choice.outcome === 'accepted') {
            this.pwaBanner.classList.remove('show');
          }
          this.deferredPrompt = null;
        }
      });
    }

    if (this.pwaDismissBtn) {
      this.pwaDismissBtn.addEventListener('click', () => {
        this.pwaBanner.classList.remove('show');
      });
    }
  }

  setupEventListeners() {
    // Dynamic Capsule close button
    if (this.capsuleCloseBtn) {
      this.capsuleCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideCapsule();
      });
    }

    // Dynamic Capsule swipe-up to dismiss on mobile touch
    if (this.dynamicCapsule) {
      this.dynamicCapsule.addEventListener('touchstart', (e) => {
        this.capsuleTouchStartY = e.touches[0].clientY;
      }, { passive: true });

      this.dynamicCapsule.addEventListener('touchend', (e) => {
        const deltaY = e.changedTouches[0].clientY - this.capsuleTouchStartY;
        if (deltaY < -30) {
          this.hideCapsule();
        }
      }, { passive: true });
    }

    // Nút Mic ở thanh chat dưới đáy
    if (this.inputMicBtn) {
      this.inputMicBtn.addEventListener('click', () => {
        this.toggleRecording();
      });
    }

    // Nút dừng thu âm trên thanh ghi âm trực tiếp
    if (this.recStopBtn) {
      this.recStopBtn.addEventListener('click', () => {
        this.stopRecording();
      });
    }

    // Nút gửi text
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => {
        const q = this.textInput.value;
        if (q.trim()) {
          this.handleTextQuery(q);
          this.textInput.value = '';
        }
      });
    }

    if (this.textInput) {
      this.textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = this.textInput.value;
          if (q.trim()) {
            this.handleTextQuery(q);
            this.textInput.value = '';
          }
        }
      });
    }

    // Auto VAD Toggle Button
    if (this.autoVadToggleBtn) {
      this.autoVadToggleBtn.addEventListener('click', () => this.toggleAutoVad());
    }

    // Live Voice Mode triggers
    if (this.liveVoiceModeBtn) {
      this.liveVoiceModeBtn.addEventListener('click', () => this.openLiveVoiceMode());
    }
    if (this.headerAvatarBtn) {
      this.headerAvatarBtn.addEventListener('click', () => this.openLiveVoiceMode());
    }
    if (this.liveVoiceCloseBtn) {
      this.liveVoiceCloseBtn.addEventListener('click', () => this.closeLiveVoiceMode());
    }
    if (this.liveOrbContainer) {
      this.liveOrbContainer.addEventListener('click', () => this.toggleRecording());
    }
    if (this.liveMicToggleBtn) {
      this.liveMicToggleBtn.addEventListener('click', () => this.toggleRecording());
    }

    // Lightbox close
    if (this.lightboxCloseBtn) {
      this.lightboxCloseBtn.addEventListener('click', () => this.closeLightbox());
    }
    if (this.imageLightbox) {
      this.imageLightbox.addEventListener('click', (e) => {
        if (e.target === this.imageLightbox) this.closeLightbox();
      });
    }

    // Header actions
    if (this.airGestureBtn) {
      this.airGestureBtn.addEventListener('click', () => this.toggleAirGestureMode());
    }
    if (this.airToastCloseBtn) {
      this.airToastCloseBtn.addEventListener('click', () => this.stopAirGestureTracking(true));
    }
    if (this.screenshotHeaderBtn) {
      this.screenshotHeaderBtn.addEventListener('click', () => {
        this.haptic(35);
        this.handleTextQuery('chụp ảnh màn hình máy tính');
      });
    }
    if (this.ttsToggleBtn) {
      this.ttsToggleBtn.addEventListener('click', () => this.toggleTTS());
    }
    if (this.dotToggleBtn) {
      this.dotToggleBtn.addEventListener('click', () => this.toggleDotVisibility());
    }
    if (this.clearChatBtn) {
      this.clearChatBtn.addEventListener('click', () => {
        this.haptic(30);
        this.chatMessages.innerHTML = '';
        if (this.welcomeCard) this.welcomeCard.style.display = 'block';
      });
    }

    // Click on PC Status badge to view or configure Server IP
    if (this.pcStatusBadge) {
      this.pcStatusBadge.style.cursor = 'pointer';
      this.pcStatusBadge.addEventListener('click', () => {
        const current = this.getServerUrl();
        const newUrl = prompt('Cấu hình địa chỉ Máy tính / Server cho Diana:\n(Nhập IP máy tính, ví dụ: http://192.168.100.221:3000)', current || 'http://192.168.100.221:3000');
        if (newUrl !== null && newUrl.trim()) {
          let url = newUrl.trim().replace(/\/+$/, '');
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
          }
          localStorage.setItem('diana_server_url', url);
          this.checkPCStatus();
          alert('✅ Đã lưu địa chỉ kết nối: ' + url);
        }
      });
    }

    // PiP Floating Dot Toggle (Desktop)
    if (this.pipToggleBtn) {
      this.pipToggleBtn.addEventListener('click', () => this.togglePiPMode());
    }
    if (this.pipChip) {
      this.pipChip.addEventListener('click', () => this.togglePiPMode());
    }
  }

  /**
   * Bật Chấm Nổi ra ngoài màn hình qua Document Picture-in-Picture API (Desktop)
   */
  async togglePiPMode() {
    this.haptic(30);
    if ('documentPictureInPicture' in window) {
      try {
        const pipWindow = await window.documentPictureInPicture.requestWindow({
          width: 240,
          height: 240,
        });

        [...document.styleSheets].forEach((styleSheet) => {
          try {
            const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
            const style = document.createElement('style');
            style.textContent = cssRules;
            pipWindow.document.head.appendChild(style);
          } catch (e) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = styleSheet.type;
            link.media = styleSheet.media;
            link.href = styleSheet.href;
            pipWindow.document.head.appendChild(link);
          }
        });

        const pipContainer = document.createElement('div');
        pipContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #060911; user-select: none;">
            <div id="pipAssistiveDot" class="assistive-dot" style="position: static; opacity: 1; transform: scale(1.15); cursor: pointer; display: block;">
              <div class="dot-aura" style="opacity: 0.8;"></div>
              <div class="dot-glass-shell">
                <div class="dot-inner-core">
                  <span class="dot-icon" id="pipDotIcon">🌸</span>
                  <div class="dot-wave-bars" id="pipDotWaveBars">
                    <span></span><span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            </div>
            <div id="pipStatusText" style="margin-top: 16px; font-size: 0.78rem; font-weight: 600; color: #00f2fe; text-align: center; font-family: 'Be Vietnam Pro', sans-serif;">
              Chạm chấm để nói
            </div>
          </div>
        `;
        pipWindow.document.body.appendChild(pipContainer);

        const pipDot = pipWindow.document.getElementById('pipAssistiveDot');
        const pipStatus = pipWindow.document.getElementById('pipStatusText');

        pipDot.addEventListener('click', async () => {
          await this.toggleRecording();
          if (this.isRecording) {
            pipDot.classList.add('listening');
            pipStatus.textContent = '🎙️ Đang nghe anh nói...';
          } else {
            pipDot.classList.remove('listening');
            pipStatus.textContent = '⚡ Diana đang xử lý...';
          }
        });

      } catch (err) {
        console.warn('Lỗi mở Picture-in-Picture:', err);
        this.showCapsule('idle', 'Ghim Màn Hình', '💡 Ghim màn hình ngoài chỉ hỗ trợ trên trình duyệt máy tính (Chrome Desktop).');
        this.scheduleCapsuleClose(5000);
      }
    } else {
      this.showCapsule('idle', 'Ghim Màn Hình', '💡 Ghim màn hình ngoài chỉ hỗ trợ trên trình duyệt máy tính (Chrome Desktop).');
      this.scheduleCapsuleClose(5000);
    }
  }

  // ==========================================================================
  // HUAWEI AIR GESTURE ENGINE (GRAB & DROP SESSION TRANSFER)
  // Chạy ngầm hoàn toàn - 0 UI Camera - Bảo mật tuyệt đối
  // ==========================================================================

  /**
   * Kiểm tra và khôi phục phiên trò chuyện khi mở trình duyệt qua Air Gesture Drop
   */
  async checkAirSyncOnLoad() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('air_sync') === '1') {
        const sessionId = urlParams.get('session_id') || '';
        console.log('[AirSync OnLoad] 🖐️ Phát hiện cờ air_sync! Đang lấy phiên chat để tiếp tục...');
        
        const candidateUrls = [
          `${this.getServerUrl()}/api/air-gesture/latest`,
          '/api/air-gesture/latest',
          'http://localhost:3000/api/air-gesture/latest',
          'http://127.0.0.1:3000/api/air-gesture/latest',
          'http://192.168.100.221:3000/api/air-gesture/latest'
        ];

        let session = null;
        for (const endpoint of candidateUrls) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(endpoint, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
              const data = await res.json();
              if (data && data.success && data.hasSession && data.session) {
                session = data.session;
                console.log('[AirSync OnLoad] ✅ Đã lấy được phiên chat từ:', endpoint);
                break;
              }
            }
          } catch (_) {}
        }
        
        if (session) {
          if (this.welcomeCard) this.welcomeCard.style.display = 'none';
          
          if (Array.isArray(session.messages) && session.messages.length > 0) {
            this.chatMessages.innerHTML = '';
            for (const msg of session.messages) {
              this.addMessage(msg.sender, msg.text, msg.attachments, msg.isHtml);
            }
          }

          // Hiển thị thông báo chào đón trên Capsule
          this.showCapsule('idle', 'Diana Air Gesture', '✨ Đã tiếp nhận và tiếp tục phiên trò chuyện từ điện thoại thành công!');
          this.playCyberChime('drop');
          
          if (this.ttsEnabled) {
            this.speak('Dạ em đã đồng bộ phiên trò chuyện từ điện thoại sang máy tính cho anh Tiến rồi ạ!');
          }
          
          this.scheduleCapsuleClose(6000);
        }

        // Xóa query param trên thanh địa chỉ một cách êm ái
        try {
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (_) {}
      }
    } catch (err) {
      console.warn('[AirSync OnLoad Error]:', err);
    }
  }

  /**
   * Bật/Tắt chế độ Air Gesture
   */
  async toggleAirGestureMode() {
    this.haptic(40);
    if (this.isAirGestureActive) {
      this.stopAirGestureTracking(true);
    } else {
      await this.startAirGestureTracking();
    }
  }

  /**
   * Khởi động bộ camera ngầm và MediaPipe nhận diện cử chỉ Chụm tay (Pinch / Fist)
   */
  async startAirGestureTracking() {
    if (this.isAirGestureActive) return;
    this.isAirGestureActive = true;
    this.consecutiveGrabFrames = 0;

    if (this.airGestureBtn) this.airGestureBtn.classList.add('active');
    if (this.airGestureBadgeDot) this.airGestureBadgeDot.style.display = 'block';

    // Hiển thị Toast hướng dẫn người dùng
    if (this.airGestureToast) {
      this.airGestureToast.classList.remove('grabbed');
      if (this.airToastIcon) this.airToastIcon.textContent = '🖐️';
      if (this.airToastTitle) this.airToastTitle.textContent = 'Diana Air Gesture';
      if (this.airToastDesc) this.airToastDesc.textContent = 'Đang kích hoạt... Hãy đưa bàn tay trước camera ĐT';
      this.airGestureToast.style.display = 'flex';
    }

    this.playCyberChime('ready');

    // Báo trước cho PC Agent qua Server để PC bật Webcam ngay lập tức
    try {
      fetch(`${this.getServerUrl()}/api/air-gesture/arm`, { method: 'POST' }).catch(() => {});
    } catch (_) {}

    // Bật vòng lặp kiểm tra trạng thái PC (để tự động tắt khi PC hoàn thành cử chỉ Thả)
    if (this.airStatusPollInterval) clearInterval(this.airStatusPollInterval);
    this.airStatusPollInterval = setInterval(async () => {
      if (!this.isAirGestureActive && !this.airGestureToast?.classList.contains('grabbed')) {
        clearInterval(this.airStatusPollInterval);
        return;
      }
      try {
        const res = await fetch(`${this.getServerUrl()}/api/air-gesture/status`);
        const data = await res.json();
        if (data && data.success && data.status === 'COMPLETED') {
          console.log('[Air Gesture] 🎉 PC đã nhận diện Mở Bàn Tay và hoàn thành truyền phiên!');
          clearInterval(this.airStatusPollInterval);
          this.playCyberChime('drop');
          this.haptic([100, 50, 150]);
          if (this.airGestureToast) {
            if (this.airToastIcon) this.airToastIcon.textContent = '✨';
            if (this.airToastTitle) this.airToastTitle.textContent = '✨ ĐÃ TRUYỀN SANG PC!';
            if (this.airToastDesc) this.airToastDesc.textContent = 'Trình duyệt máy tính đang mở và tiếp tục phiên chat!';
          }
          // Tắt UI nhanh hơn - 1.5 giây thay vì 3.5 giây
          setTimeout(() => {
            this.stopAirGestureTracking(false);
          }, 1500);
        }
      } catch (_) {}
    }, 800);

    try {
      // Dừng stream cũ trước nếu có
      this.stopCameraStreamOnly();

      // 1. Mở Camera trước ở chế độ hoàn toàn ngầm (320x240 để cực nhẹ và 60 FPS)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 320 },
          height: { ideal: 240 }
        },
        audio: false
      });
      this.airGestureStream = stream;

      const video = this.airGestureVideo || document.getElementById('airGestureVideo');
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('muted', 'true');
        await video.play().catch(() => {});
      }

      // 2. Khởi tạo MediaPipe Hands nếu chưa có (tận dụng preload nếu có)
      if (!this.airHandsDetector && window.Hands) {
        const hands = new window.Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.40,
          minTrackingConfidence: 0.40
        });
        hands.onResults((results) => this.onAirGestureHandResults(results));
        await hands.initialize().catch(() => {});
        this.airHandsDetector = hands;
      } else if (this.airHandsDetector) {
        // Cập nhật callback mới (phòng trường hợp bị ghi đè)
        this.airHandsDetector.onResults((results) => this.onAirGestureHandResults(results));
      }

      // 3. Vòng lặp quét frame trực tiếp trên video (Cực nhạy, không delay)
      this.isProcessingAirFrame = false;
      const processLoop = async () => {
        if (!this.isAirGestureActive) return;
        if (video && video.readyState >= 2 && this.airHandsDetector && !this.isProcessingAirFrame) {
          this.isProcessingAirFrame = true;
          try {
            await this.airHandsDetector.send({ image: video });
          } catch (_) {}
          this.isProcessingAirFrame = false;
        }
        if (this.isAirGestureActive) {
          if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(processLoop);
          } else {
            requestAnimationFrame(processLoop);
          }
        }
      };

      if (video) {
        if ('requestVideoFrameCallback' in video) {
          video.requestVideoFrameCallback(processLoop);
        } else {
          requestAnimationFrame(processLoop);
        }
      }

    } catch (err) {
      console.warn('Lỗi kích hoạt Air Gesture:', err);
      if (this.airGestureToast) {
        if (this.airToastDesc) this.airToastDesc.textContent = '⚠️ Cần cấp quyền truy cập Camera để dùng cử chỉ';
        setTimeout(() => this.stopAirGestureTracking(true), 3000);
      }
    }
  }

  /**
   * Xử lý kết quả nhận diện điểm mốc bàn tay từ MediaPipe (Thuật toán đối sánh mờ Scale-Invariant cực nhạy)
   */
  onAirGestureHandResults(results) {
    if (!this.isAirGestureActive) return;
    if (!results || !results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.consecutiveGrabFrames = Math.max(0, this.consecutiveGrabFrames - 1);
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const middleMcp = landmarks[9];

    // Độ dài tham chiếu của bàn tay (từ cổ tay đến khớp gốc ngón giữa)
    const handScale = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y) || 0.2;

    // 1. Khoảng cách chụm ngón cái với ngón trỏ & ngón giữa (Scale-Invariant)
    const pinchIndexDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const pinchMiddleDist = Math.hypot(thumbTip.x - middleTip.x, thumbTip.y - middleTip.y);
    const pinchRatio = Math.min(pinchIndexDist, pinchMiddleDist) / handScale;

    // 2. Độ co gập của các ngón (Nắm tay / Chụm cả bàn tay)
    const indexDist = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
    const middleDist = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
    const ringDist = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y);
    const pinkyDist = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y);
    const avgTipDist = (indexDist + middleDist + ringDist + pinkyDist) / 4;
    const avgMcpDist = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);

    const isPinch = pinchRatio < 0.60 || pinchIndexDist < 0.12 || pinchMiddleDist < 0.12;
    const isFist = avgTipDist < avgMcpDist * 1.25;

    if (isPinch || isFist) {
      this.consecutiveGrabFrames++;
      if (this.airToastDesc && !this.airGestureToast.classList.contains('grabbed')) {
        this.airToastDesc.textContent = '🤏 Đang nắm tay... Giữ yên một chút!';
      }
      if (this.consecutiveGrabFrames >= 4) {
        // ĐÃ BẮT ĐƯỢC CỬ CHỈ CHỤM TAY (GRAB)!
        this.triggerAirGrabSuccess();
      }
    } else {
      this.consecutiveGrabFrames = Math.max(0, this.consecutiveGrabFrames - 1);
      if (this.airToastDesc && !this.airGestureToast.classList.contains('grabbed')) {
        this.airToastDesc.textContent = '👀 Đã thấy bàn tay... Hãy chụm các ngón tay lại (✊)';
      }
    }
  }

  /**
   * Kích hoạt thành công cử chỉ Chụm tay (Grab) - Đóng gói phiên chat và gửi lên PC
   */
  async triggerAirGrabSuccess() {
    if (!this.isAirGestureActive) return;
    this.isAirGestureActive = false; // Ngừng quét trên điện thoại sau khi đã nắm

    this.haptic([80, 50, 80]);
    this.playCyberChime('grab');

    // Cập nhật Toast hiệu ứng đã nắm phiên
    if (this.airGestureToast) {
      this.airGestureToast.classList.add('grabbed');
      if (this.airToastIcon) this.airToastIcon.textContent = '✊';
      if (this.airToastTitle) this.airToastTitle.textContent = '✊ ĐÃ NẮM PHIÊN CHAT!';
      if (this.airToastDesc) this.airToastDesc.textContent = 'Hãy đưa tay qua Webcam máy tính và MỞ BÀN TAY (🖐️) ra để thả...';
    }

    // Đóng gói phiên chat hiện tại
    const sessionPayload = {
      id: `air_${Date.now()}`,
      messages: this.chatHistory || [],
      timestamp: Date.now()
    };

    console.log('[Air Gesture] ✊ Đã chụm tay thành công! Gói session gửi máy chủ:', sessionPayload);

    // Gửi lên Endpoint máy chủ để đánh thức Webcam PC
    try {
      await fetch(`${this.getServerUrl()}/api/air-gesture/grab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: sessionPayload })
      });
    } catch (err) {
      console.warn('[Air Gesture Grab API Error]:', err);
    }

    // Tắt camera trên điện thoại vì đã nắm xong
    this.stopCameraStreamOnly();
  }

  /**
   * Dừng toàn bộ Air Gesture Tracking (và gửi lệnh đóng Webcam PC nếu user chủ động tắt)
   */
  stopAirGestureTracking(notifyPC = true) {
    this.isAirGestureActive = false;
    this.stopCameraStreamOnly();

    if (this.airStatusPollInterval) {
      clearInterval(this.airStatusPollInterval);
      this.airStatusPollInterval = null;
    }

    if (this.airGestureBtn) this.airGestureBtn.classList.remove('active');
    if (this.airGestureBadgeDot) this.airGestureBadgeDot.style.display = 'none';
    if (this.airGestureToast) this.airGestureToast.style.display = 'none';

    if (notifyPC) {
      try {
        fetch(`${this.getServerUrl()}/api/air-gesture/stop`, { method: 'POST' }).catch(() => {});
      } catch (_) {}
    }
  }

  stopCameraStreamOnly() {
    if (this.airCameraUtils) {
      try { this.airCameraUtils.stop(); } catch (_) {}
      this.airCameraUtils = null;
    }
    if (this.airGestureStream) {
      try {
        this.airGestureStream.getTracks().forEach(track => track.stop());
      } catch (_) {}
      this.airGestureStream = null;
    }
    if (this.airGestureVideo) {
      this.airGestureVideo.srcObject = null;
    }
  }

  /**
   * Preload mô hình MediaPipe Hands trong nền khi app khởi động
   * để loại bỏ delay khi bật camera lần đầu.
   */
  async preloadAirGestureModel() {
    if (this.airHandsDetector || !window.Hands) return;
    try {
      const hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.40,
        minTrackingConfidence: 0.40
      });
      hands.onResults(() => {});
      await hands.initialize();
      this.airHandsDetector = hands;
      console.log('[Air Gesture] ✅ MediaPipe Hands đã preload xong - camera sẽ bật tức thì!');
    } catch (_) {}
  }

  /**
   * Phát hiệu ứng âm thanh viễn tưởng (Cyberpunk Chime) bằng Web Audio API
   */
  playCyberChime(type = 'grab') {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'ready') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'grab') {
        // Hợp âm gom năng lượng (Cyber Grab)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.25); // Đô cao
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'drop') {
        // Hợp âm mở bung tỏa sáng (Cyber Drop / Release)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.5, now);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.3);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch (_) {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dianaApp = new DianaVoiceApp();
});

