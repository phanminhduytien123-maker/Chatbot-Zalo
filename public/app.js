/**
 * DIANA AI VOICE ASSISTANT - CLIENT APPLICATION
 * iPhone AssistiveTouch Floating Widget & Hybrid Realtime Speech Recognition
 */

class DianaVoiceApp {
  constructor() {
    this.isRecording = false;
    this.isSpeaking = false;
    this.ttsEnabled = localStorage.getItem('diana_tts') !== 'false';
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

    // Drag & Touch Tracking for AssistiveTouch Dot
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialLeft = 0;
    this.initialTop = 0;
    this.hasMoved = false;
    this.idleTimer = null;
    this.capsuleAutoCloseTimer = null;

    // DOM Elements
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
    this.pcStatusBadge = document.getElementById('pcStatusBadge');
    this.pcStatusText = document.getElementById('pcStatusText');
    this.ttsToggleBtn = document.getElementById('ttsToggleBtn');
    this.clearChatBtn = document.getElementById('clearChatBtn');
    this.pwaBanner = document.getElementById('pwaBanner');
    this.pwaInstallBtn = document.getElementById('pwaInstallBtn');
    this.pwaDismissBtn = document.getElementById('pwaDismissBtn');
    this.dotWaveBars = document.querySelectorAll('#dotWaveBars span');
    this.capsuleWaveBars = document.querySelectorAll('#capsuleWave span');

    this.init();
  }

  init() {
    this.initSpeechRecognition();
    this.initAssistiveDotPhysics();
    this.setupEventListeners();
    this.setupPWA();
    this.updateTTSButtonState();
    this.checkPCStatus();
    setInterval(() => this.checkPCStatus(), 8000);
  }

  /**
   * Khởi tạo Bộ nhận diện giọng nói Web Speech API (Google vi-VN)
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
          this.isRecording = true;
          this.finalTranscript = '';
          this.setDotState('listening');
          this.showCapsule('listening', 'Diana đang nghe...', 'Hãy nói yêu cầu của anh nhé!');
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
            this.capsuleTranscript.innerHTML = `<span class="interim-text">"${interimText}"</span>`;
          }

          if (finalResult) {
            this.finalTranscript = finalResult.trim();
            this.capsuleTranscript.innerHTML = `<strong>"${this.finalTranscript}"</strong>`;
          }
        };

        this.recognition.onerror = (event) => {
          console.warn('[Web Speech API Notice]:', event.error);
          if (event.error === 'no-speech') {
            this.setDotState('idle');
            this.capsuleTranscript.textContent = 'Chạm vào chấm Diana để nói lại nhé...';
            this.scheduleCapsuleClose(3000);
          } else if (event.error === 'not-allowed') {
            alert('Anh hãy bấm "Cho phép" khi trình duyệt hỏi quyền sử dụng Micro nhé!');
            this.stopRecording();
          } else if (event.error === 'network') {
            console.log('Chuyển đổi sang chế độ ghi âm dự phòng (Gemini Audio)...');
            this.useFallbackRecorder = true;
            this.startMediaRecorder();
          }
        };

        this.recognition.onend = () => {
          this.isRecording = false;

          if (this.finalTranscript && this.finalTranscript.trim().length > 0) {
            const query = this.finalTranscript.trim();
            this.finalTranscript = '';
            this.handleTextQuery(query);
          } else {
            if (!this.useFallbackRecorder) {
              this.setDotState('idle');
              this.scheduleCapsuleClose(2500);
            }
          }
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
      this.assistiveDot.style.left = `${savedX}px`;
      this.assistiveDot.style.top = `${savedY}px`;
      this.assistiveDot.style.right = 'auto';
      this.assistiveDot.style.bottom = 'auto';
    }

    const onPointerDown = (e) => {
      this.isDragging = true;
      this.hasMoved = false;
      this.dragStartX = e.clientX || (e.touches && e.touches[0].clientX);
      this.dragStartY = e.clientY || (e.touches && e.touches[0].clientY);

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

      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        this.hasMoved = true;
      }

      let newLeft = this.initialLeft + deltaX;
      let newTop = this.initialTop + deltaY;

      // Giới hạn trong khung nhìn màn hình
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      newLeft = Math.max(10, Math.min(winW - 68, newLeft));
      newTop = Math.max(60, Math.min(winH - 75, newTop));

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
        // Đây là thao tác chạm (Tap / Click)
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
        this.assistiveDot.style.transition = '';
      }, 350);
    };

    // Hỗ trợ cả Touch Mobile và Chuột Máy Tính
    this.assistiveDot.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    this.assistiveDot.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  }

  /**
   * Bật/Tắt thu âm khi chạm vào chấm Diana
   */
  async toggleRecording() {
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
    // Dừng âm thanh đọc TTS nếu đang phát
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }

    if (this.hasWebSpeech && !this.useFallbackRecorder) {
      try {
        this.recognition.start();
        return;
      } catch (err) {
        console.warn('Không thể khởi chạy Web Speech:', err);
      }
    }

    await this.startMediaRecorder();
  }

  /**
   * Ghi âm trực tiếp bằng MediaRecorder + Gemini 2.0 Flash STT (Dự phòng)
   */
  async startMediaRecorder() {
    try {
      this.audioChunks = [];
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 
                   MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/ogg';
      }

      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecording = false;
        this.setDotState('thinking');
        this.showCapsule('thinking', 'Diana đang xử lý...', '⚡ Đang lắng nghe & suy nghĩ...');

        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        if (audioBlob.size > 1500) {
          await this.sendAudioToServer(audioBlob, mimeType);
        } else {
          this.setDotState('idle');
          this.capsuleTranscript.textContent = 'Chạm vào chấm Diana để nói lại nhé...';
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

      this.mediaRecorder.start(250);
      this.isRecording = true;
      this.setDotState('listening');
      this.showCapsule('listening', 'Diana đang nghe...', '🎙️ Đang nghe anh nói... (Chạm lại khi nói xong)');

    } catch (err) {
      console.error('Lỗi truy cập Micro:', err);
      this.isRecording = false;
      this.setDotState('idle');

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('Anh hãy bấm "Cho phép" khi trình duyệt hỏi quyền sử dụng Micro nhé!');
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
    if (this.hasWebSpeech && this.recognition && this.isRecording) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
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
   * Phân tích âm lượng Micro & Dynamic Voice Activity Detection
   */
  setupAudioAnalyser(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
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

        // Cập nhật sóng âm visualizer
        if (this.dotWaveBars && this.dotWaveBars.length > 0) {
          const heightMultiplier = Math.min(1.0, Math.max(0.2, average / 40));
          this.dotWaveBars.forEach((bar, idx) => {
            const factor = (idx % 2 === 0 ? 0.8 : 1.2) * heightMultiplier;
            bar.style.transform = `scaleY(${Math.max(0.3, Math.min(1.8, factor * 1.5))})`;
          });
        }

        if (average > 12) {
          speakingDetected = true;
          silenceStartTime = null;
        } else if (speakingDetected) {
          if (!silenceStartTime) {
            silenceStartTime = Date.now();
          } else if (Date.now() - silenceStartTime > 2200) {
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

          // Phản hồi bằng giọng nói TTS
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
   * Gửi câu hỏi dạng Text (Nhập bàn phím / Web Speech Kết quả)
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

        // Đọc phản hồi bằng giọng nói
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
          <div class="screenshot-preview">
            <a href="${url}" target="_blank">
              <img src="${url}" alt="Screenshot PC" loading="lazy" />
            </a>
          </div>
        `;
      }
    }

    html += `</div><span class="message-time">${timeStr}</span>`;
    item.innerHTML = html;

    this.chatMessages.appendChild(item);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
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
      this.ttsToggleBtn.title = 'Giọng nói: ĐANG BẬT';
    } else {
      this.ttsToggleBtn.classList.add('muted');
      this.ttsToggleBtn.title = 'Giọng nói: ĐÃ TẮT';
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
    // Đóng Dynamic Capsule
    if (this.capsuleCloseBtn) {
      this.capsuleCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideCapsule();
      });
    }

    // Nút gửi text
    this.sendBtn.addEventListener('click', () => {
      const q = this.textInput.value;
      if (q.trim()) {
        this.handleTextQuery(q);
        this.textInput.value = '';
      }
    });

    this.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = this.textInput.value;
        if (q.trim()) {
          this.handleTextQuery(q);
          this.textInput.value = '';
        }
      }
    });

    // PiP Floating Dot Toggle
    this.pipToggleBtn = document.getElementById('pipToggleBtn');
    this.pipChip = document.getElementById('pipChip');
    if (this.pipToggleBtn) {
      this.pipToggleBtn.addEventListener('click', () => this.togglePiPMode());
    }
    if (this.pipChip) {
      this.pipChip.addEventListener('click', () => this.togglePiPMode());
    }

    // Header actions
    this.ttsToggleBtn.addEventListener('click', () => this.toggleTTS());
    this.clearChatBtn.addEventListener('click', () => {
      this.chatMessages.innerHTML = '';
      if (this.welcomeCard) this.welcomeCard.style.display = 'block';
    });
  }

  /**
   * Bật Chấm Nổi ra ngoài màn hình qua Document Picture-in-Picture API
   */
  async togglePiPMode() {
    if ('documentPictureInPicture' in window) {
      try {
        const pipWindow = await window.documentPictureInPicture.requestWindow({
          width: 240,
          height: 240,
        });

        // Copy toàn bộ CSS sang cửa sổ PiP
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

        // Gắn nút AssistiveTouch nổi bên trong PiP
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
        alert('Để mở chấm tròn nổi trên màn hình máy tính, anh hãy mở file "Chay_Diana_AssistiveTouch_Desktop.bat" nhé!');
      }
    } else {
      alert('💡 Để mở chấm tròn nổi trực tiếp trên màn hình máy tính Windows, anh hãy mở file "Chay_Diana_AssistiveTouch_Desktop.bat" trong thư mục Zalo Bot nhé! 🌸');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dianaApp = new DianaVoiceApp();
});
