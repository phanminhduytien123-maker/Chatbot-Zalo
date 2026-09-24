/**
 * DIANA AI VOICE ASSISTANT - CLIENT APPLICATION 2.0
 * Mobile-First Ultra Responsive Experience, AssistiveTouch Physics & Live Voice UI
 */

class DianaVoiceApp {
  constructor() {
    this.isRecording = false;
    this.isSpeaking = false;
    this.ttsEnabled = localStorage.getItem('diana_tts') !== 'false';
    this.dotEnabled = localStorage.getItem('diana_dot_visible') !== 'false';
    this.deferredPrompt = null;
    
    // Speech Recognition Engines
    this.recognition = null;
    this.hasWebSpeech = false;
    this.finalTranscript = '';
    this.useFallbackRecorder = false;

    // MediaRecorder & Web Audio Context
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.animFrameId = null;
    this.silenceTimer = null;
    this.synth = window.speechSynthesis || null;

    // Drag & Touch Physics for AssistiveTouch Dot
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialLeft = 0;
    this.initialTop = 0;
    this.hasMoved = false;
    this.capsuleAutoCloseTimer = null;
    this.capsuleTouchStartY = 0;

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
    this.ttsToggleBtn = document.getElementById('ttsToggleBtn');
    this.dotToggleBtn = document.getElementById('dotToggleBtn');
    this.pipToggleBtn = document.getElementById('pipToggleBtn');
    this.pipChip = document.getElementById('pipChip');
    this.clearChatBtn = document.getElementById('clearChatBtn');
    
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
    this.capsuleWaveBars = document.querySelectorAll('#capsuleWave span');
    this.bottomRecWaves = document.querySelectorAll('#bottomRecWaves span');
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
    this.checkPCStatus();
    setInterval(() => this.checkPCStatus(), 8000);
  }

  /**
   * Tính toán chiều cao màn hình chuẩn xác cho trình duyệt Mobile (iOS Safari & Chrome Android)
   */
  initDynamicViewport() {
    const updateAppHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
      if (window.visualViewport) {
        // Hỗ trợ khi bàn phím ảo hiển thị
        const vvHeight = window.visualViewport.height;
        if (this.appContainer && window.innerWidth <= 640) {
          this.appContainer.style.height = `${vvHeight}px`;
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

        this.recognition.onerror = (event) => {
          console.warn('[Web Speech API Notice]:', event.error);
        };

        this.recognition.onend = () => {
          // Xử lý bởi mediaRecorder.onstop
        };

        this.hasWebSpeech = true;
      } catch (err) {
        console.warn('Lỗi cấu hình Web Speech API:', err);
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
   * Bật/Tắt thu âm
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
   * Bắt đầu nhận diện giọng nói
   */
  async startRecording() {
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }

    // Luôn ghi âm trực tiếp qua MediaRecorder + Gemini 3.5 Transcribe
    await this.startMediaRecorder();

    // Chạy song song WebSpeech (nếu có) để hiển thị phụ đề thời gian thực
    if (this.hasWebSpeech && this.recognition) {
      try {
        this.finalTranscript = '';
        this.lastInterim = '';
        this.recognition.start();
      } catch (_) {}
    }
  }

  /**
   * Ghi âm bằng MediaRecorder + Gemini STT (Tương thích 100% Xiaomi HyperOS, iPhone iOS & Android)
   */
  async startMediaRecorder() {
    try {
      this.audioChunks = [];
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      this.audioStream = stream;

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
          this.capsuleTranscript.textContent = 'Chạm vào Mic để nói lại nhé...';
          this.updateLiveOverlayState('idle', 'Sẵn sàng', 'Chạm vào hình cầu để nói...');
          this.scheduleCapsuleClose(2000);
        }

        if (this.audioStream) {
          this.audioStream.getTracks().forEach(track => track.stop());
          this.audioStream = null;
        }
        if (this.animFrameId) {
          cancelAnimationFrame(this.animFrameId);
          this.animFrameId = null;
        }
      };

      this.setupAudioAnalyser(this.audioStream);

      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.updateRecordingUI(true);
      this.showCapsule('listening', 'Diana đang nghe...', '🎙️ Đang nghe anh nói... (Chạm lại khi nói xong)');
      this.updateLiveOverlayState('listening', 'Đang nghe...', 'Em đang lắng nghe...');

    } catch (err) {
      console.error('Lỗi truy cập Micro:', err);
      this.isRecording = false;
      this.updateRecordingUI(false);
      this.setDotState('idle');

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.showCapsule('idle', 'Quyền Micro', '⚠️ Hãy cho phép quyền truy cập Micro trên trình duyệt của điện thoại nhé!');
        this.scheduleCapsuleClose(4000);
      } else {
        this.showCapsule('idle', 'Lỗi Micro', `Lỗi: ${err.message}`);
        this.scheduleCapsuleClose(3000);
      }
    }
  }

  /**
   * Dừng thu âm
   */
  stopRecording() {
    this.haptic(30);
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

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
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
   * Phân tích âm lượng Micro & Dynamic Voice Activity Detection
   */
  setupAudioAnalyser(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.6;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let speakingDetected = false;
      let silenceStartTime = null;

      const checkAudioLevel = () => {
        if (!this.isRecording) return;

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;

        // Cập nhật sóng âm visualizer cho tất cả wave bars
        const heightMultiplier = Math.min(1.0, Math.max(0.2, average / 40));

        const updateBars = (nodeList) => {
          if (!nodeList || nodeList.length === 0) return;
          nodeList.forEach((bar, idx) => {
            const factor = (idx % 2 === 0 ? 0.8 : 1.25) * heightMultiplier;
            bar.style.transform = `scaleY(${Math.max(0.3, Math.min(1.9, factor * 1.6))})`;
          });
        };

        updateBars(this.dotWaveBars);
        updateBars(this.capsuleWaveBars);
        updateBars(this.bottomRecWaves);
        updateBars(this.liveOrbWaveBars);

        if (average > 12) {
          speakingDetected = true;
          silenceStartTime = null;
        } else if (speakingDetected) {
          if (!silenceStartTime) {
            silenceStartTime = Date.now();
          } else if (Date.now() - silenceStartTime > 2400) {
            this.stopRecording();
            return;
          }
        }

        this.animFrameId = requestAnimationFrame(checkAudioLevel);
      };

      this.animFrameId = requestAnimationFrame(checkAudioLevel);
    } catch (_) {}
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
        const base64Audio = reader.result.split(',')[1];

        const response = await fetch('/api/voice-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio: base64Audio,
            mimeType: mimeType
          })
        });

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
          }
        } else {
          const errText = data.error || 'Không nhận diện được âm thanh. Anh vui lòng thử lại nhé!';
          this.setDotState('idle');
          this.showCapsule('idle', 'Lỗi nhận diện', `⚠️ ${errText}`);
          this.addMessage('bot', `⚠️ ${errText}`);
          this.updateLiveOverlayState('idle', 'Lỗi', errText);
          this.scheduleCapsuleClose(4000);
        }
      };
    } catch (err) {
      console.error('Lỗi gửi âm thanh:', err);
      this.setDotState('idle');
      this.showCapsule('idle', 'Lỗi kết nối', '⚠️ Không thể kết nối máy chủ.');
      this.scheduleCapsuleClose(3000);
    }
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

    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery })
      });

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
        }
      } else {
        const defaultReply = 'Dạ em đã thực thi xong yêu cầu của anh rồi ạ! ✨';
        this.addMessage('bot', defaultReply);
        this.showResultInCapsule(cleanQuery, defaultReply, []);
        this.updateLiveOverlayState('idle', 'Diana', defaultReply);
        if (this.ttsEnabled) this.speak(defaultReply);
      }
    } catch (err) {
      console.error('Lỗi khi gửi yêu cầu:', err);
      this.setDotState('idle');
      this.showCapsule('idle', 'Lỗi kết nối', '⚠️ Không thể kết nối máy chủ.');
      this.scheduleCapsuleClose(3000);
    }
  }

  /**
   * Phát âm văn bản tiếng Việt (Text-to-Speech)
   */
  speak(text) {
    if (!this.synth || !this.ttsEnabled) return;

    const cleanText = text
      .replace(/[*_#`~]/g, '')
      .replace(/[\u{1F600}-\u{1F6FF}|[\u{1F300}-\u{1F5FF}|[\u{1F900}-\u{1F9FF}|[\u{2600}-\u{26FF}]/gu, '')
      .replace(/\n+/g, '. ')
      .trim();

    if (!cleanText) {
      this.setDotState('idle');
      this.scheduleCapsuleClose(4000);
      return;
    }

    try {
      this.synth.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const voices = this.synth.getVoices();
      const viVoice = voices.find(v => v.lang && (v.lang.includes('vi') || v.lang.includes('VN')));
      if (viVoice) utterance.voice = viVoice;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.setDotState('speaking');
        this.capsuleStatus.textContent = 'Diana đang nói...';
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.setDotState('idle');
        this.scheduleCapsuleClose(4000);
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.setDotState('idle');
        this.scheduleCapsuleClose(3000);
      };

      this.synth.speak(utterance);
    } catch (_) {
      this.setDotState('idle');
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

  showResultInCapsule(query, replyText, attachments = []) {
    this.dynamicCapsule.classList.add('active');
    this.capsuleStatus.textContent = 'Diana';
    this.capsuleTranscript.innerHTML = `<strong>"${this.escapeHtml(query)}"</strong>`;
    this.capsuleWave.style.display = 'none';
    this.capsuleResult.style.display = 'block';
    this.capsuleReplyText.innerHTML = this.formatMarkdown(replyText);

    if (attachments && attachments.length > 0) {
      const fileName = attachments[0].split(/[\\/]/).pop();
      const url = `/api/screenshot/${encodeURIComponent(fileName)}`;
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

  addMessage(sender, text, attachments = []) {
    const item = document.createElement('div');
    item.className = `message-item ${sender}`;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    let html = `<div class="message-bubble">${this.formatMarkdown(text)}`;

    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        const fileName = att.split(/[\\/]/).pop();
        const url = `/api/screenshot/${encodeURIComponent(fileName)}`;
        html += `
          <div class="screenshot-preview" onclick="window.dianaApp.openLightbox('${url}')">
            <img src="${url}" alt="Screenshot PC" loading="lazy" />
            <div class="screenshot-tag">🔍 Chạm để phóng to</div>
          </div>
        `;
      }
    }

    html += `</div><span class="message-time">${timeStr}</span>`;
    item.innerHTML = html;

    this.chatMessages.appendChild(item);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
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

  async checkPCStatus() {
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
      this.pcStatusBadge.className = 'status-badge offline';
      this.pcStatusText.textContent = 'Chưa kết nối';
    }
  }

  toggleTTS() {
    this.haptic(30);
    this.ttsEnabled = !this.ttsEnabled;
    localStorage.setItem('diana_tts', this.ttsEnabled);
    this.updateTTSButtonState();
    if (!this.ttsEnabled && this.synth) {
      this.synth.cancel();
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
      this.updateLiveOverlayState('idle', 'Sẵn sàng', 'Chạm vào hình cầu để nói chuyện cùng Diana nhé!');
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
        if (deltaY < -30) { // Vuốt lên
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
}

document.addEventListener('DOMContentLoaded', () => {
  window.dianaApp = new DianaVoiceApp();
});
