import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import config from '../config/config.js';

// Tọa độ TP. Hồ Chí Minh (Khu vực Quận 7 - Trường ĐH Tôn Đức Thắng)
const HCMC_COORDS = {
  latitude: 10.7324,
  longitude: 106.6992,
  name: 'TP. Hồ Chí Minh (Q.7 - TDTU)'
};

const WEATHER_CACHE_FILE = path.resolve(config.paths.dataDir, 'weather_cache.json');

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

// Map mô tả từ wttr.in sang tiếng Việt
const WTTR_DESC_MAP = [
  { match: /thunder|storm/i, desc: 'Có dông bão kèm sấm sét ⛈️', isRain: true },
  { match: /heavy rain|torrential/i, desc: 'Mưa rào to diện rộng 🌧️', isRain: true },
  { match: /moderate rain|rain/i, desc: 'Mưa rào rải rác 🌧️', isRain: true },
  { match: /light rain|drizzle|shower|patchy/i, desc: 'Mưa nhẹ rải rác 🌦️', isRain: true },
  { match: /fog|mist/i, desc: 'Có sương mù nhẹ 🌫️', isRain: false },
  { match: /overcast|cloudy/i, desc: 'Trời nhiều mây, râm mát ☁️', isRain: false },
  { match: /partly cloudy/i, desc: 'Trời có mây từng phần ⛅', isRain: false },
  { match: /sunny|clear/i, desc: 'Trời quang đãng, nắng đẹp ☀️', isRain: false }
];

export class WeatherService {
  /**
   * Lưu dữ liệu thời tiết vào file cache cục bộ
   */
  saveCache(data) {
    try {
      if (!fs.existsSync(config.paths.dataDir)) {
        fs.mkdirSync(config.paths.dataDir, { recursive: true });
      }
      const cacheObj = {
        timestamp: Date.now(),
        data
      };
      fs.writeFileSync(WEATHER_CACHE_FILE, JSON.stringify(cacheObj, null, 2), 'utf8');
    } catch (_) {}
  }

  /**
   * Đọc dữ liệu từ cache nếu còn hiệu lực (< 24 giờ)
   */
  readCache() {
    try {
      if (fs.existsSync(WEATHER_CACHE_FILE)) {
        const raw = fs.readFileSync(WEATHER_CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const ageHours = (Date.now() - (parsed.timestamp || 0)) / (1000 * 60 * 60);
        if (ageHours < 24 && parsed.data) {
          return parsed.data;
        }
      }
    } catch (_) {}
    return null;
  }

  /**
   * Nguồn 1: Lấy dữ liệu từ Open-Meteo API (Có retry tự động 3 lần)
   */
  async fetchFromOpenMeteo(retries = 3) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${HCMC_COORDS.latitude}&longitude=${HCMC_COORDS.longitude}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=Asia%2FBangkok`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: 12000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DianaBot/3.0'
          }
        });
        if (response.data && response.data.daily) {
          this.saveCache(response.data);
          return response.data;
        }
      } catch (err) {
        if (attempt === retries) {
          console.warn(chalk.yellow(`⚠️ [Open-Meteo] Lần ${attempt}/${retries} thất bại (${err.message}). Đang chuyển sang nguồn dự phòng...`));
        } else {
          await new Promise(r => setTimeout(r, 1200));
        }
      }
    }
    return null;
  }

  /**
   * Nguồn 2: Dữ liệu dự phòng từ wttr.in API (chuẩn hóa sang cấu trúc Open-Meteo)
   */
  async fetchFromWttr() {
    try {
      const url = `https://wttr.in/Ho_Chi_Minh?format=j1`;
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DianaBot/3.0'
        }
      });

      const data = response.data;
      if (!data || !data.weather || data.weather.length === 0) return null;

      const today = data.weather[0];
      const hourly = today.hourly || [];
      const current = data.current_condition?.[0] || {};

      const maxTemp = parseFloat(today.maxtempC || '32');
      const minTemp = parseFloat(today.mintempC || '25');
      
      let maxProb = 0;
      let totalPrecip = 0;
      const hourlyTimes = [];
      const hourlyTemps = [];
      const hourlyProbs = [];
      const hourlyPrecip = [];
      const hourlyCodes = [];

      const todayStr = this.getVietnamTodayDateStr();

      for (const h of hourly) {
        const hourNum = Math.floor(parseInt(h.time || '0', 10) / 100);
        const timeFormatted = `${todayStr}T${String(hourNum).padStart(2, '0')}:00`;
        const prob = parseInt(h.chanceofrain || '0', 10);
        const precip = parseFloat(h.precipMM || '0');

        if (prob > maxProb) maxProb = prob;
        totalPrecip += precip;

        hourlyTimes.push(timeFormatted);
        hourlyTemps.push(parseFloat(h.tempC || '28'));
        hourlyProbs.push(prob);
        hourlyPrecip.push(precip);
        hourlyCodes.push(prob >= 50 ? 63 : (prob >= 25 ? 51 : 2));
      }

      // Xác định trạng thái thời tiết chung
      const currentDesc = current.weatherDesc?.[0]?.value || today.hourly?.[0]?.weatherDesc?.[0]?.value || '';
      let weatherStatus = 'Trời có mây, râm mát ⛅';
      for (const mapping of WTTR_DESC_MAP) {
        if (mapping.match.test(currentDesc)) {
          weatherStatus = mapping.desc;
          break;
        }
      }

      const standardizedData = {
        source: 'wttr.in',
        daily: {
          temperature_2m_max: [maxTemp],
          temperature_2m_min: [minTemp],
          precipitation_probability_max: [maxProb],
          precipitation_sum: [totalPrecip],
          weather_code: [maxProb >= 50 ? 63 : 2],
          custom_weather_status: weatherStatus
        },
        hourly: {
          time: hourlyTimes,
          temperature_2m: hourlyTemps,
          precipitation_probability: hourlyProbs,
          precipitation: hourlyPrecip,
          weather_code: hourlyCodes
        }
      };

      this.saveCache(standardizedData);
      return standardizedData;
    } catch (err) {
      console.warn(chalk.yellow(`⚠️ [wttr.in Fallback] Lỗi: ${err.message}`));
      return null;
    }
  }

  /**
   * Lấy ngày hiện tại theo chuẩn YYYY-MM-DD tại múi giờ Việt Nam (GMT+7)
   */
  getVietnamTodayDateStr() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  /**
   * Lấy dự báo thời tiết với cơ chế 3 lớp (Open-Meteo -> wttr.in -> Cache)
   */
  async getForecast() {
    // 1. Thử nguồn chính Open-Meteo
    let data = await this.fetchFromOpenMeteo(3);
    if (data && data.daily) return data;

    // 2. Thử nguồn dự phòng wttr.in
    data = await this.fetchFromWttr();
    if (data && data.daily) return data;

    // 3. Sử dụng Cache gần nhất
    data = this.readCache();
    if (data && data.daily) {
      console.log(chalk.cyan('ℹ️ [Weather] Sử dụng dữ liệu thời tiết từ bộ nhớ đệm (Cache).'));
      return data;
    }

    return null;
  }

  /**
   * Phân tích các khung giờ có khả năng mưa trong ngày (từ 06:00 đến 23:00)
   */
  analyzeRainHours(hourly) {
    if (!hourly || !hourly.time) return [];

    const todayStr = this.getVietnamTodayDateStr();
    const rainSlots = [];

    for (let i = 0; i < hourly.time.length; i++) {
      const timeStr = hourly.time[i]; // dạng "2026-09-26T14:00"
      if (!timeStr.startsWith(todayStr)) continue;

      const hour = parseInt(timeStr.split('T')[1].split(':')[0], 10);
      if (hour < 6) continue; // Chỉ xét từ 6h sáng trở đi

      const prob = hourly.precipitation_probability ? (hourly.precipitation_probability[i] || 0) : 0;
      const precip = hourly.precipitation ? (hourly.precipitation[i] || 0) : 0;
      const code = hourly.weather_code ? hourly.weather_code[i] : 0;
      const isRainCode = WMO_CODE_MAP[code]?.isRain || false;

      // Coi là có mưa nếu xác suất >= 40% hoặc lượng mưa > 0.2mm hoặc có mã mưa WMO
      if (prob >= 40 || precip > 0.2 || isRainCode) {
        rainSlots.push({
          hour,
          timeFormatted: `${String(hour).padStart(2, '0')}h00`,
          probability: prob,
          precipitation: precip,
          code
        });
      }
    }

    if (rainSlots.length === 0) return [];

    // Gom các giờ liên tiếp thành các khoảng (VD: 13h00 - 17h00)
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
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const data = await this.getForecast();

    // Fallback thông minh nếu không có kết nối mạng nào khả dụng
    if (!data || !data.daily) {
      return `🌸 Dạ em Diana chúc anh Tiến một buổi sáng tốt lành và tràn đầy năng lượng ạ! 🥰✨\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `⛅ BẢN TIN THỜI TIẾT HÔM NAY (${dateStr})\n` +
        `📍 Khu vực: TP. Hồ Chí Minh (Q.7 - TDTU)\n\n` +
        `🌡️ Nhiệt độ dự kiến: 25°C - 32°C\n` +
        `🌈 Trạng thái: Ngày nắng gián đoạn, chiều tối có thể có mưa rào ⛅🌧️\n` +
        `🌧️ Khả năng mưa: ~60% (vào buổi chiều / tan tầm)\n\n` +
        `💡 LỜI NHẮC CỦA DIANA:\n` +
        `👉 Sài Gòn đang vào mùa mưa, anh Tiến nhớ **bỏ sẵn áo mưa hoặc dù** vào cốp xe trước khi ra khỏi nhà nhé! Đừng để bị ướt mưa kẻo cảm lạnh nha anh. ☔🛵\n` +
        `🌸 Chúc anh Tiến một ngày mới học tập và làm việc thật vui vẻ, hiệu quả ạ! 💖`;
    }

    const daily = data.daily;
    const hourly = data.hourly;

    const maxTemp = Math.round(daily.temperature_2m_max[0] || 32);
    const minTemp = Math.round(daily.temperature_2m_min[0] || 25);
    const maxRainProb = daily.precipitation_probability_max?.[0] || 0;
    const totalPrecip = daily.precipitation_sum?.[0] || 0;
    const todayWeatherCode = daily.weather_code?.[0] || 0;
    const weatherStatus = daily.custom_weather_status || WMO_CODE_MAP[todayWeatherCode]?.desc || 'Trời có mây, râm mát ⛅';

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
      if (!data || !data.daily) return 'Thời tiết TP.HCM dao động 25°C - 32°C, chiều tối có thể có mưa rải rác.';

      const maxTemp = Math.round(data.daily.temperature_2m_max[0] || 32);
      const minTemp = Math.round(data.daily.temperature_2m_min[0] || 25);
      const maxRainProb = data.daily.precipitation_probability_max?.[0] || 0;
      const rainRanges = this.analyzeRainHours(data.hourly);
      const rainHoursStr = rainRanges.map(r => `${r.rangeStr} (${r.maxProbability}%)`).join(', ');

      return `Nhiệt độ TP.HCM: ${minTemp}°C - ${maxTemp}°C. Khả năng mưa: ${maxRainProb}%. Khung giờ có mưa: ${rainHoursStr || 'Không có mưa đáng kể'}.`;
    } catch (_) {
      return 'Thời tiết TP.HCM dao động 25°C - 32°C, chiều tối có thể có mưa rải rác.';
    }
  }
}

export const weatherService = new WeatherService();
export default weatherService;
