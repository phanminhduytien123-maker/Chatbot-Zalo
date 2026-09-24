import axios from 'axios';
import * as cheerio from 'cheerio';

export class SearchService {
  /**
   * Tìm kiếm thông tin trên Web theo thời gian thực (DuckDuckGo Search Engine)
   * @param {string} query Từ khóa tìm kiếm
   * @param {number} [maxResults=5] Số lượng kết quả tối đa
   * @returns {Promise<Array<{ title: string, snippet: string, link: string }>>}
   */
  static async searchWeb(query, maxResults = 5) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    // 1. Tìm kiếm qua Wikipedia Tiếng Việt API (Cực nhanh và chuẩn xác)
    try {
      const wikiUrl = `https://vi.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query.trim())}&format=json&utf8=1`;
      const wikiRes = await axios.get(wikiUrl, {
        timeout: 8000,
        headers: {
          'User-Agent': 'DianaZaloAssistantBot/1.0 (https://github.com/phanminhduytien123-maker/Chatbot-Zalo; contact@tdtu.edu.vn)'
        }
      });
      const wikiItems = wikiRes.data?.query?.search || [];

      if (wikiItems.length > 0) {
        return wikiItems.slice(0, maxResults).map(item => ({
          title: item.title,
          snippet: item.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
          link: `https://vi.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`
        }));
      }
    } catch (wikiErr) {
      console.warn('⚠️ [Wiki Search Warning]:', wikiErr.message);
    }

    // 2. Dự phòng: Tìm kiếm qua DuckDuckGo Instant API
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query.trim())}&format=json&no_html=1&skip_disambig=1`;
      const ddgRes = await axios.get(ddgUrl, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Diana-Search-Agent'
        }
      });

      const results = [];
      if (ddgRes.data?.AbstractText) {
        results.push({
          title: ddgRes.data.Heading || query,
          snippet: ddgRes.data.AbstractText,
          link: ddgRes.data.AbstractURL || 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
        });
      }

      const related = ddgRes.data?.RelatedTopics || [];
      for (const item of related) {
        if (results.length >= maxResults) break;
        if (item.Text && item.FirstURL) {
          results.push({
            title: item.Text.split(' - ')[0] || item.Text.slice(0, 40),
            snippet: item.Text,
            link: item.FirstURL
          });
        }
      }

      if (results.length > 0) return results;
    } catch (ddgErr) {
      console.warn('⚠️ [DDG API Warning]:', ddgErr.message);
    }

    return [];
  }

  /**
   * Định dạng kết quả tìm kiếm thành văn bản thân thiện
   */
  static formatSearchResults(query, results) {
    if (!results || results.length === 0) {
      return `🔍 Dạ em không tìm thấy kết quả phù hợp trên web cho từ khóa: "${query}". Anh thử diễn đạt khác nhé ạ! 🌸`;
    }

    let msg = `🔍 KẾT QUẢ TÌM KIẾM WEB REALTIME CHO: "${query}"\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    results.forEach((r, idx) => {
      msg += `📌 ${idx + 1}. ${r.title}\n`;
      msg += `📝 ${r.snippet}\n`;
      msg += `🔗 ${r.link}\n\n`;
    });

    msg += `💡 Dữ liệu được Diana tổng hợp trực tiếp từ Web thời gian thực.`;
    return msg.trim();
  }
}

export default SearchService;
