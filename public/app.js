/**
 * ĐIANA AI VOICE ASSISTANT - CLIENT APPLICATION
 * Supports Direct Audio Recording (MediaRecorder + Gemini AI), Web Speech API & TTS
 */

class DianaVoiceApp {
  constructor() {
    this.isRecording = false;
    this.isSpeaking = false;
    this.ttsEnabled = localStorage.getItem('diana_tts') !== 'false';
    this.deferredPrompt = null;
    
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioStream = null;
    this.silenceTimer = null;
    this.audioContext = null;
    this.analyser = null;
    this.synth = window.speechSynthesis || null;

    // DOM Elements
    this.micButton = document.getElementById('micButton');
    this.orbWrapper = document.querySelector('.orb-wrapper');
    this.transcriptBox = document.getElementById('transcriptBox');
    this.transcriptText = document.getElementById('transcriptText');
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

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupPWA();
    this.updateTTSButtonState();
    this.checkPCStatus();
    setInterval(() => this.checkPCStatus(), 8000);
  }

  /**
   * Bật/Tắt chế độ thu âm Micro trực tiếp (MediaRecorder - Hoạt động trên mọi dòng máy Xiaomi)
   */
  async toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  /**
   * Bắt đầu thu âm giọng nói trực tiếp từ trình duyệt
   */
  async startRecording() {
    // Dừng giọng nói TTS nếu đang phát
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }

    try {
      this.audioChunks = [];
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Hỗ trợ các định dạng âm thanh web phổ biến
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 
                   MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/ogg';
      }

      this.mediaRecorder = new MediaRecorder(this.audioStream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecording = false;
        this.setOrbState('thinking');
        this.transcriptText.textContent = '⚡ Điana đang lắng nghe & suy nghĩ...';

        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        if (audioBlob.size > 1000) {
          await this.sendAudioToServer(audioBlob, mimeType);
        } else {
          this.setOrbState('idle');
          this.transcriptText.textContent = 'Chạm vào Micro để nói lại nhé...';
        }

        // Dọn dẹp stream
        if (this.audioStream) {
          this.audioStream.getTracks().forEach(track => track.stop());
          this.audioStream = null;
        }
      };

      // Thiết lập AudioContext để phân tích sóng âm & phát hiện khoảng lặng
      this.setupAudioAnalyser(this.audioStream);

      this.mediaRecorder.start(250);
      this.isRecording = true;
      this.setOrbState('listening');
      this.transcriptBox.classList.add('listening');
      this.transcriptText.textContent = '🎙️ Đang nghe anh nói... (Chạm lại khi nói xong)';

    } catch (err) {
      console.error('Lỗi truy cập Micro:', err);
      this.isRecording = false;
      this.setOrbState('idle');
      this.transcriptBox.classList.remove('listening');

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.transcriptText.textContent = '⚠️ Hãy bấm "Cho phép" Micro trên trình duyệt Chrome nhé!';
        alert('Anh hãy bấm "Cho phép" khi trình duyệt Chrome hỏi quyền sử dụng Micro nhé!');
      } else {
        this.transcriptText.textContent = `Lỗi Micro: ${err.message}.`;
      }
    }
  }

  /**
   * Dừng thu âm
   */
  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Phân tích âm lượng Micro để tự động dừng khi ngừng nói
   */
  setupAudioAnalyser(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
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

        // Nếu có tiếng nói
        if (average > 15) {
          speakingDetected = true;
          silenceStartTime = null;
        } else if (speakingDetected) {
          // Nếu đã nói xong và im lặng > 1.8 giây thì tự động hoàn tất
          if (!silenceStartTime) {
            silenceStartTime = Date.now();
          } else if (Date.now() - silenceStartTime > 1800) {
            this.stopRecording();
            return;
          }
        }

        requestAnimationFrame(checkAudioLevel);
      };

      requestAnimationFrame(checkAudioLevel);
    } catch (_) {}
  }

  /**
   * Gửi file âm thanh đã thu trực tiếp lên Gemini AI Multimodal Endpoint
   */
  async sendAudioToServer(audioBlob, mimeType) {
    // Ẩn welcome card
    if (this.welcomeCard) {
      this.welcomeCard.style.display = 'none';
    }

    try {
      // Chuyển Blob sang Base64
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
        this.setOrbState('idle');
        this.transcriptBox.classList.remove('listening');

        if (data && data.success) {
          const userQuery = data.query || 'Giọng nói';
          this.addMessage('user', userQuery);
          this.transcriptText.textContent = `"${userQuery}"`;

          const textReply = typeof data.reply === 'string' ? data.reply : (data.reply.text || JSON.stringify(data.reply));
          const attachments = data.reply.attachments || data.attachments || [];

          this.addMessage('bot', textReply, attachments);

          // Đọc phản hồi
          if (this.ttsEnabled) {
            this.speak(textReply);
          }
        } else {
          const errText = data.error || 'Không nhận diện được âm thanh. Anh vui lòng thử lại nhé!';
          this.transcriptText.textContent = errText;
          this.addMessage('bot', `⚠️ ${errText}`);
        }
      };
    } catch (err) {
      console.error('Lỗi khi gửi âm thanh:', err);
      this.setOrbState('idle');
      this.transcriptText.textContent = 'Chạm vào Micro để thử lại...';
      this.addMessage('bot', '⚠️ Lỗi kết nối máy chủ. Vui lòng kiểm tra lại mạng nhé!');
    }
  }

  /**
   * Gửi câu hỏi dạng Text (Nhập bàn phím / Chip bấm)
   */
  async handleTextQuery(query) {
    if (!query || !query.trim()) return;
    const cleanQuery = query.trim();

    if (this.welcomeCard) {
      this.welcomeCard.style.display = 'none';
    }

    this.addMessage('user', cleanQuery);
    this.transcriptText.textContent = `Đang xử lý: "${cleanQuery}"...`;
    this.setOrbState('thinking');

    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery })
      });

      const data = await response.json();
      this.setOrbState('idle');
      this.transcriptText.textContent = 'Chạm vào Micro để nói yêu cầu tiếp theo...';

      if (data && data.reply) {
        const textReply = typeof data.reply === 'string' ? data.reply : (data.reply.text || JSON.stringify(data.reply));
        const attachments = data.reply.attachments || data.attachments || [];

        this.addMessage('bot', textReply, attachments);

        if (this.ttsEnabled) {
          this.speak(textReply);
        }
      } else {
        this.addMessage('bot', 'Dạ em đã thực thi xong yêu cầu của anh rồi ạ! ✨');
      }
    } catch (err) {
      console.error('Lỗi khi gửi yêu cầu:', err);
      this.setOrbState('idle');
      this.transcriptText.textContent = 'Chạm vào Micro để thử lại...';
      this.addMessage('bot', '⚠️ Không thể kết nối tới máy chủ Điana.');
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

    if (!cleanText) return;

    try {
      this.synth.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const voices = this.synth.getVoices();
      const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VN'));
      if (viVoice) utterance.voice = viVoice;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.setOrbState('speaking');
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.setOrbState('idle');
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.setOrbState('idle');
      };

      this.synth.speak(utterance);
    } catch (_) {}
  }

  setOrbState(state) {
    this.orbWrapper.classList.remove('listening', 'thinking', 'speaking');
    if (state !== 'idle') {
      this.orbWrapper.classList.add(state);
    }
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
    // Chạm vào nút quả cầu Micro để ghi âm trực tiếp
    this.micButton.addEventListener('click', () => this.toggleRecording());

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

    // Quick Action Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.getAttribute('data-query');
        if (query) this.handleTextQuery(query);
      });
    });

    // Header actions
    this.ttsToggleBtn.addEventListener('click', () => this.toggleTTS());
    this.clearChatBtn.addEventListener('click', () => {
      this.chatMessages.innerHTML = '';
      if (this.welcomeCard) this.welcomeCard.style.display = 'block';
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dianaApp = new DianaVoiceApp();
});
