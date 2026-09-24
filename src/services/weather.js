import axios from 'axios';
import chalk from 'chalk';

// Tọa độ TP. Hồ Chí Minh (Khu vực Quận 7 - Trường ĐH Tôn Đức Thắng)
const HCMC_COORDS = {
  latitude: 10.7324,
  longitude: 106.6992,
  name: 'TP. Hồ Chí Minh (Khu vực Q7 - TDTU)'
};

// Bảng giải mã mã thời tiết WMO (World Meteorological Organization) sang Tiếng Việt
const WMO_CODE_MAP = {
  0: { desc: 'Trời quang đãng, nắng đẹp ☀️', isRain: false },
  1: { desc: 'Trời nắng nhẹ, ít mây 🌤️', isRain: false },
  2: { desc: 'Trời có mây từng phần ⛅', isRain: false },
  3: { desc: 'Trời nhiều mây, râm mát ☁️', isRain: false },
  45: { desc: 'Có sương mù nhẹ 🌫️', isRain: false },
  48: { desc: 'Sương mù dày đặc 🌫️', isRain: false },
  51: { desc: 'Mưa phùn nhẹ rải rác 🌦️', isRain: true },
  53: { desc: 'Mưa phùn vừa 🌦️', isRain: true },
  55: { desc: 'Mưa phùn dày hạt 🌧️', isRain: true },
  61: { desc: 'Mưa rào nhẹ 🌧️', isRain: true },
  63: { desc: 'Mưa rào vừa 🌧️', isRain: true },
  65: { desc: 'Mưa rào to 🌧️', isRain: true },
  80: { desc: 'Mưa rào rải rác từng đợt 🌦️', isRain: true },
  81: { desc: 'Mưa rào nặng hạt 🌧️', isRain: true },
  82: { desc: 'Mưa rất to xối xả ⛈️', isRain: true },
  95: { desc: 'Có dông bão kèm sấm sét ⛈️', isRain: true },
  96: { desc: 'Dông bão có mưa đá nhẹ ⛈️', isRain: true },
  99: { desc: 'Dông bão mạnh kèm mưa đá ⛈️', isRain: true }
};

export class WeatherService {
  /**
   * Lấy dữ liệu thời tiết chi tiết hôm nay từ Open-Meteo API
   */
  async getForecast() {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${HCMC_COORDS.latitude}&longitude=${HCMC_COORDS.longitude}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=Asia%2FBangkok`;
      
      const response = await axios.get(url, { timeout: 8000 });
      return response.data;
    } catch (err) {
      console.error(chalk.red('❌ Lỗi khi lấy dữ liệu thời tiết:'), err.message);
      return null;
    }
  }

  /**
   * Phân tích các khung giờ có khả năng mưa trong ngày (từ 06:00 đến 23:00)
   */
  analyzeRainHours(hourly) {
    if (!hourly || !hourly.time) return [];

    const todayStr = new Date().toISOString().slice(0, 10);
    const rainSlots = [];

    for (let i = 0; i < hourly.time.length; i++) {
      const timeStr = hourly.time[i]; // dạng "2026-09-24T14:00"
      if (!timeStr.startsWith(todayStr)) continue;

      const hour = parseInt(timeStr.split('T')[1].split(':')[0], 10);
      if (hour < 6) continue; // Chỉ xét từ 6h sáng trở đi

      const prob = hourly.precipitation_probability[i] || 0;
      const precip = hourly.precipitation[i] || 0;
      const code = hourly.weather_code[i];
      const isRainCode = WMO_CODE_MAP[code]?.isRain || false;

      // Coi là có mưa nếu xác suất >= 45% hoặc lượng mưa > 0.3mm hoặc có mã mưa WMO
      if (prob >= 45 || precip > 0.3 || isRainCode) {
        rainSlots.push({
          hour,
          timeFormatted: `${String(hour).padStart(2, '0')}h00`,
          probability: prob,
          precipitation: precip,
          code
        });
      }
    }

    // Gom các giờ liên tiếp thành các khoảng (VD: 13h00 - 17h00)
    if (rainSlots.length === 0) return [];

    const groupedRanges = [];
    let startSlot = rainSlots[0];
    let endSlot = rainSlots[0];
    let maxProb = startSlot.probability;

    for (let i = 1; i < rainSlots.length; i++) {
      const current = rainSlots[i];
      if (current.hour === endSlot.hour + 1) {
        endSlot = current;
        if (current.probability > maxProb) maxProb = current.probability;
      } else {
        const endHourFormatted = `${String(endSlot.hour + 1).padStart(2, '0')}h00`;
        groupedRanges.push({
          rangeStr: `${startSlot.timeFormatted} - ${endHourFormatted}`,
          maxProbability: maxProb
        });
        startSlot = current;
        endSlot = current;
        maxProb = current.probability;
      }
    }

    const endHourFormatted = `${String(endSlot.hour + 1).padStart(2, '0')}h00`;
    groupedRanges.push({
      rangeStr: `${startSlot.timeFormatted} - ${endHourFormatted}`,
      maxProbability: maxProb
    });

    return groupedRanges;
  }

  /**
   * Tạo bản tin thời tiết buổi sáng gửi tự động lúc 7h00
   */
  async generateMorningBriefing() {
    const data = await this.getForecast();
    if (!data || !data.daily) {
      return `🌸 Dạ em chào anh Tiến! Chúc anh một buổi sáng tốt lành và tràn đầy năng lượng ạ! ✨\n(Hiện tại hệ thống vệ tinh thời tiết đang bảo trì, anh nhớ chú ý mang theo áo mưa khi ra ngoài nhé!)`;
    }

    const daily = data.daily;
    const hourly = data.hourly;
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

    const maxTemp = Math.round(daily.temperature_2m_max[0]);
    const minTemp = Math.round(daily.temperature_2m_min[0]);
    const maxRainProb = daily.precipitation_probability_max[0] || 0;
    const totalPrecip = daily.precipitation_sum[0] || 0;
    const todayWeatherCode = daily.weather_code[0];
    const weatherStatus = WMO_CODE_MAP[todayWeatherCode]?.desc || 'Trời có mây, râm mát ⛅';

    const rainRanges = this.analyzeRainHours(hourly);
    const willRain = maxRainProb >= 40 || totalPrecip > 1.0 || rainRanges.length > 0;

    let msg = `🌸 Dạ em Diana chúc anh Tiến một buổi sáng tốt lành! 🥰✨\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⛅ BẢN TIN THỜI TIẾT HÔM NAY (${dateStr})\n`;
    msg += `📍 Khu vực: TP. Hồ Chí Minh (Q.7 - TDTU)\n\n`;
    msg += `🌡️ Nhiệt độ: ${minTemp}°C - ${maxTemp}°C\n`;
    msg += `🌈 Trạng thái: ${weatherStatus}\n`;
    msg += `🌧️ Khả năng mưa trong ngày: ${maxRainProb}%\n`;

    if (rainRanges.length > 0) {
      msg += `\n⏰ CÁC KHUNG GIỜ CÓ THỂ CÓ MƯA:\n`;
      rainRanges.forEach(r => {
        msg += `   👉 ${r.rangeStr} (Xác suất mưa: ~${r.maxProbability}%)\n`;
      });
    } else if (willRain) {
      msg += `\n⏰ Dự báo có thể có mưa rải rác vào buổi chiều/tối.\n`;
    } else {
      msg += `\n☀️ Hôm nay thời tiết tạnh ráo, thuận lợi cho việc đi lại và học tập.\n`;
    }

    msg += `\n💡 LỜI NHẮC CỦA DIANA:\n`;
    if (willRain) {
      msg += `👉 Anh Tiến nhớ **mang theo áo mưa hoặc dù** trong cốp xe trước khi ra khỏi nhà nhé! Đừng để bị ướt mưa kẻo cảm lạnh nha anh. ☔🛵\n`;
    } else {
      msg += `👉 Trời nắng đẹp, anh nhớ mang theo áo khoác và uống đủ nước nha! 🕶️🥤\n`;
    }
    msg += `🌸 Chúc anh Tiến một ngày mới tràn đầy năng lượng và đạt nhiều kết quả tốt ạ! 💖`;

    return msg.trim();
  }

  /**
   * Tóm tắt ngắn gọn thời tiết để Gemini AI hiểu và trả lời người dùng
   */
  async getWeatherSummaryForAI() {
    try {
      const data = await this.getForecast();
      if (!data || !data.daily) return 'Chưa lấy được dữ liệu thời tiết hôm nay.';

      const maxTemp = data.daily.temperature_2m_max[0];
      const minTemp = data.daily.temperature_2m_min[0];
      const maxRainProb = data.daily.precipitation_probability_max[0];
      const rainRanges = this.analyzeRainHours(data.hourly);
      const rainHoursStr = rainRanges.map(r => `${r.rangeStr} (${r.maxProbability}%)`).join(', ');

      return `Nhiệt độ TP.HCM: ${minTemp}°C - ${maxTemp}°C. Khả năng mưa: ${maxRainProb}%. Khung giờ có mưa: ${rainHoursStr || 'Không có mưa đáng kể'}.`;
    } catch (_) {
      return 'Thời tiết TP.HCM dao động 25°C - 32°C.';
    }
  }
}

export const weatherService = new WeatherService();
export default weatherService;
