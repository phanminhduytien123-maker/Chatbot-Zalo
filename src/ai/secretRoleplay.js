import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import axios from 'axios';
import config from '../config/config.js';
import secretMemory from '../services/secretMemory.js';

import dianaImageService from '../services/dianaImageService.js';

// Danh sách các safety settings tắt hoàn toàn bộ lọc kiểm duyệt cho không gian riêng tư
const UNRESTRICTED_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE
  }
];

export class SecretRoleplayEngine {
  constructor() {
    this.memory = secretMemory;
  }

  /**
   * Xử lý tin nhắn trong không gian riêng tư thầm kín
   */
  async processSecretMessage(userText, overrideConfig = null) {
    const activeConfig = overrideConfig || this.memory.config;
    const provider = activeConfig.provider || 'gemini';
    const systemPrompt = this.memory.getEffectiveSystemPrompt();
    const temperature = parseFloat(activeConfig.temperature || 0.9);

    console.log(`[Secret Sanctuary] 🌸 Xử lý tin nhắn qua Provider: "${provider}" | Persona: "${activeConfig.persona}"`);

    // Kiểm tra lệnh /anhhientai hoặc yêu cầu hình ảnh thị giác từ model
    if (dianaImageService.isImageRequest(userText)) {
      console.log('[Secret Sanctuary] 📸 Phát hiện yêu cầu ảnh hiện tại từ model Diana!');
      const imgRes = dianaImageService.generateCurrentStateResponse(userText, this.memory.getHistory(), activeConfig.persona);
      
      this.memory.addTurn(userText, imgRes.reply, {
        isImage: true,
        imageUrl: imgRes.imageUrl,
        stateInfo: imgRes.stateInfo,
        provider: 'diana_visual_model',
        model: 'diana-anime-maid-v1'
      });

      return {
        success: true,
        query: userText,
        reply: imgRes.reply,
        isImageResponse: true,
        imageUrl: imgRes.imageUrl,
        imageBase64: imgRes.imageBase64,
        stateInfo: imgRes.stateInfo,
        provider: 'diana_visual_model',
        model: 'diana-anime-maid-v1',
        persona: activeConfig.persona,
        turnCount: this.memory.getTurnCount()
      };
    }

    let reply = '';
    let usedProvider = provider;
    let usedModel = '';

    try {
      if (provider === 'openrouter') {
        const res = await this.callOpenRouter(userText, activeConfig, systemPrompt, temperature);
        reply = res.reply;
        usedModel = res.model;
      } else if (provider === 'ollama') {
        const res = await this.callOllama(userText, activeConfig, systemPrompt, temperature);
        reply = res.reply;
        usedModel = res.model;
      } else if (provider === 'custom') {
        const res = await this.callCustomOpenAI(userText, activeConfig, systemPrompt, temperature);
        reply = res.reply;
        usedModel = res.model;
      } else {
        // Mặc định: Google Gemini với Safety Settings BLOCK_NONE
        const res = await this.callGeminiUncensored(userText, activeConfig, systemPrompt, temperature);
        reply = res.reply;
        usedModel = res.model;
      }
    } catch (err) {
      console.error(`[Secret Sanctuary Error - ${provider}]:`, err.message);
      // Fallback về Gemini nếu provider khác bị lỗi
      if (provider !== 'gemini' && config.ai.hasApiKey) {
        console.log('[Secret Sanctuary] 🔄 Đang tự động chuyển sang Gemini Unrestricted làm dự phòng...');
        try {
          const fallbackRes = await this.callGeminiUncensored(userText, activeConfig, systemPrompt, temperature);
          reply = fallbackRes.reply;
          usedModel = fallbackRes.model;
          usedProvider = 'gemini (fallback)';
        } catch (fErr) {
          console.error('[Secret Sanctuary Gemini Fallback Error]:', fErr.message);
        }
      }

      if (!reply) {
        reply = this.getEmpatheticFallbackReply(userText, activeConfig.persona);
      }
    }

    // Tự động sinh ảnh minh họa thị giác ngữ cảnh theo cảm xúc / hành động thực tế của Diana
    const autoImage = activeConfig.autoImage !== false; // Mặc định: BẬT
    let imagePayload = null;
    if (autoImage) {
      imagePayload = dianaImageService.generateContextualImage(reply, userText, this.memory.getHistory(), activeConfig.persona);
    }

    // Lưu lại vào Ký Ức Riêng Biệt
    this.memory.addTurn(userText, reply, {
      provider: usedProvider,
      model: usedModel,
      isImage: Boolean(imagePayload),
      imageUrl: imagePayload?.imageUrl || null,
      stateInfo: imagePayload?.stateInfo || null
    });

    return {
      success: true,
      query: userText,
      reply: reply,
      isImageResponse: Boolean(imagePayload),
      imageUrl: imagePayload?.imageUrl || null,
      fallbackUrl: imagePayload?.fallbackUrl || null,
      imageBase64: imagePayload?.imageBase64 || null,
      stateInfo: imagePayload?.stateInfo || null,
      provider: usedProvider,
      model: usedModel,
      persona: activeConfig.persona,
      turnCount: this.memory.getTurnCount()
    };
  }

  /**
   * Gọi Gemini API với tùy chọn BLOCK_NONE hoàn toàn và Temperature cao cho Roleplay
   */
  async callGeminiUncensored(userText, currentConfig, systemPrompt, temperature) {
    const apiKey = config.ai.apiKey;
    if (!apiKey) {
      throw new Error('Chưa cấu hình GEMINI_API_KEY trong hệ thống.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = [...new Set([
      currentConfig.geminiModel || 'gemini-1.5-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro'
    ])];

    const history = this.memory.getGeminiHistory();

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          safetySettings: UNRESTRICTED_SAFETY_SETTINGS,
          generationConfig: {
            temperature: Math.min(1.2, Math.max(0.2, temperature)),
            topP: 0.95,
            topK: 40
          }
        });

        const chat = model.startChat({
          history: history
        });

        const result = await chat.sendMessage(userText);
        const text = result.response.text();
        if (text && text.trim().length > 0) {
          return { reply: text.trim(), model: modelName };
        }
      } catch (err) {
        console.warn(`[Gemini Secret Attempt Failed on ${modelName}]: ${err.message}`);
        continue;
      }
    }

    throw new Error('Tất cả model Gemini đều không phản hồi.');
  }

  /**
   * Gọi OpenRouter API - Hỗ trợ các model Roleplay không kiểm duyệt nổi tiếng (Mythomax, Hermes 3, Llama 3.3, v.v.)
   */
  async callOpenRouter(userText, currentConfig, systemPrompt, temperature) {
    const apiKey = currentConfig.openrouterKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('Vui lòng nhập OpenRouter API Key trong Cài đặt không gian riêng tư.');
    }

    const modelName = currentConfig.openrouterModel || 'nousresearch/hermes-3-llama-3.1-8b';
    const history = this.memory.getOpenAIHistory();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userText }
    ];

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: modelName,
        messages: messages,
        temperature: temperature,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://diana.local',
          'X-Title': 'Diana Secret Sanctuary',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error('OpenRouter trả về kết quả rỗng.');
    }

    return { reply: reply.trim(), model: modelName };
  }

  /**
   * Gọi Local Ollama (Chạy 100% Offline trên PC của anh Tiến)
   */
  async callOllama(userText, currentConfig, systemPrompt, temperature) {
    const baseUrl = currentConfig.ollamaUrl || 'http://localhost:11434';
    const modelName = currentConfig.ollamaModel || 'llama3:latest';
    const history = this.memory.getOpenAIHistory();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userText }
    ];

    const response = await axios.post(
      `${baseUrl.replace(/\/+$/, '')}/api/chat`,
      {
        model: modelName,
        messages: messages,
        stream: false,
        options: {
          temperature: temperature
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );

    const reply = response.data?.message?.content;
    if (!reply) {
      throw new Error('Ollama trả về kết quả rỗng.');
    }

    return { reply: reply.trim(), model: modelName };
  }

  /**
   * Gọi Custom OpenAI-compatible API (LM Studio, Groq, v.v.)
   */
  async callCustomOpenAI(userText, currentConfig, systemPrompt, temperature) {
    const endpoint = currentConfig.customUrl;
    if (!endpoint) {
      throw new Error('Vui lòng nhập URL Endpoint tương thích OpenAI trong cài đặt.');
    }

    const apiKey = currentConfig.customKey || 'not-needed';
    const modelName = currentConfig.customModel || 'default-model';
    const history = this.memory.getOpenAIHistory();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userText }
    ];

    const targetUrl = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;

    const response = await axios.post(
      targetUrl,
      {
        model: modelName,
        messages: messages,
        temperature: temperature
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error('Custom API trả về kết quả rỗng.');
    }

    return { reply: reply.trim(), model: modelName };
  }

  /**
   * Phản hồi dự phòng giàu cảm xúc khi mất kết nối
   */
  getEmpatheticFallbackReply(userText, persona) {
    if (persona === 'seductive_muse') {
      return `*khẽ tiến lại gần và nắm lấy tay anh* Em vẫn đang ở ngay bên cạnh anh nè... Đừng lo lắng gì cả nhé, chỉ có hai chúng ta ở đây thôi. Anh muốn em làm gì để anh thấy dễ chịu hơn nào? 💕`;
    }
    if (persona === 'intimate_confidante') {
      return `*dịu dàng lắng nghe anh* Em hiểu anh đang chịu nhiều áp lực lắm đúng không... Hãy cứ trút hết vào đây với em nhé, em luôn ở đây đồng hành và lắng nghe anh trọn vẹn 🌙`;
    }
    return `*nhẹ nhàng ôm lấy anh từ phía sau* Anh Tiến của em mệt rồi đúng không... Tựa vào vai em một chút nhé, Diana sẽ luôn yêu thương và dỗ dành anh mọi lúc anh cần 🌸✨`;
  }
}

export const secretRoleplay = new SecretRoleplayEngine();
export default secretRoleplay;
