/**
 * ĐIANA AI VOICE ASSISTANT - CLIENT APPLICATION
 * Supports Vietnamese Speech Recognition, TTS Voice Synthesis, PC Control & PWA
 */

class DianaVoiceApp {
  constructor() {
    this.isListening = false;
    this.isSpeaking = false;
    this.ttsEnabled = localStorage.getItem('diana_tts') !== 'false';
    this.deferredPrompt = null;
    this.recognition = null;
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
    this.setupSpeechRecognition();
    this.setupEventListeners();
    this.setupPWA();
    this.updateTTSButtonState();
    this.checkPCStatus();
    setInterval(() => this.checkPCStatus(), 8000);
  }

  /**
   * Khởi tạo Web Speech Recognition tiếng Việt (vi-VN)
   */
  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Trình duyệt không hỗ trợ Web Speech API.');
      this.transcriptText.textContent = 'Trình duyệt không hỗ trợ Mic. Hãy nhập văn bản bên dưới!';
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'vi-VN';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.setOrbState('listening');
      this.transcriptBox.classList.add('listening');
      this.transcriptText.textContent = 'Đang lắng nghe anh nói...';
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const display = final || interim;
      if (display) {
        this.transcriptText.textContent = `"${display}"`;
      }

      if (final) {
        this.handleUserQuery(final.trim());
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Lỗi nhận dạng giọng nói:', event.error);
      this.isListening = false;
      this.setOrbState('idle');
      this.transcriptBox.classList.remove('listening');
      
      if (event.error === 'not-allowed') {
        this.transcriptText.textContent = '⚠️ Hãy cấp quyền Micro trong trình duyệt để nói chuyện với Điana!';
      } else if (event.error === 'no-speech') {
        this.transcriptText.textContent = 'Chạm vào Micro để bắt đầu nói...';
      } else {
        this.transcriptText.textContent = `Lỗi: ${event.error}. Vui lòng thử lại!`;
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (!this.isSpeaking && this.orbWrapper.classList.contains('listening')) {
        this.setOrbState('idle');
        this.transcriptBox.classList.remove('listening');
      }
    };
  }

  /**
   * Bật/Tắt Micro lắng nghe
   */
  toggleListening() {
    if (!this.recognition) {
      alert('Trình duyệt này không hỗ trợ Micro trực tiếp. Anh vui lòng dùng Google Chrome trên điện thoại để trải nghiệm đầy đủ nhé!');
      return;
    }

    if (this.isListening) {
      this.recognition.stop();
    } else {
      // Dừng âm thanh đang phát nếu có
      if (this.synth && this.synth.speaking) {
        this.synth.cancel();
      }
      try {
        this.recognition.start();
      } catch (e) {
        this.recognition.stop();
        setTimeout(() => this.recognition.start(), 200);
      }
    }
  }

  /**
   * Gửi câu hỏi / yêu cầu tới Server AI Điana
   */
  async handleUserQuery(query) {
    if (!query || !query.trim()) return;
    const cleanQuery = query.trim();

    // Ẩn welcome card sau lần chat đầu
    if (this.welcomeCard) {
      this.welcomeCard.style.display = 'none';
    }

    // Hiển thị tin nhắn người dùng
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

        // Phát giọng nói tiếng Việt nếu bật TTS
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
      this.addMessage('bot', '⚠️ Không thể kết nối tới máy chủ Điana. Anh vui lòng kiểm tra kết nối mạng nhé!');
    }
  }

  /**
   * Phát âm văn bản tiếng Việt (Text-to-Speech)
   */
  speak(text) {
    if (!this.synth || !this.ttsEnabled) return;

    // Lọc bỏ markdown, emoji và ký tự thừa để đọc mượt mà
    const cleanText = text
      .replace(/[*_#`~]/g, '')
      .replace(/[\u{1F600}-\u{1F6FF}|[\u{1F300}-\u{1F5FF}|[\u{1F900}-\u{1F9FF}|[\u{2600}-\u{26FF}]/gu, '')
      .replace(/\n+/g, '. ')
      .trim();

    if (!cleanText) return;

    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Chọn voice tiếng Việt nếu có
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
  }

  /**
   * Đổi trạng thái hiển thị của Orb (idle, listening, thinking, speaking)
   */
  setOrbState(state) {
    this.orbWrapper.classList.remove('listening', 'thinking', 'speaking');
    if (state !== 'idle') {
      this.orbWrapper.classList.add(state);
    }
  }

  /**
   * Thêm tin nhắn vào giao diện
   */
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

  /**
   * Kiểm tra tình trạng kết nối PC (Online / Offline)
   */
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

  /**
   * Đổi trạng thái đọc âm thanh
   */
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

  /**
   * Cài đặt PWA (Thêm vào màn hình chính Android)
   */
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
    // Chạm nút Mic
    this.micButton.addEventListener('click', () => this.toggleListening());

    // Nút gửi text
    this.sendBtn.addEventListener('click', () => {
      const q = this.textInput.value;
      if (q.trim()) {
        this.handleUserQuery(q);
        this.textInput.value = '';
      }
    });

    this.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = this.textInput.value;
        if (q.trim()) {
          this.handleUserQuery(q);
          this.textInput.value = '';
        }
      }
    });

    // Quick Action Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.getAttribute('data-query');
        if (query) this.handleUserQuery(query);
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

// Khởi chạy ứng dụng khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  window.dianaApp = new DianaVoiceApp();
});
