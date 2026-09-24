import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.TZ = 'Asia/Ho_Chi_Minh';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  bot: {
    name: 'Diana',
    dob: '23/09/2026',
    gender: 'Nữ',
    personality: 'Nhã nhặn, dễ thương, dịu dàng, chu đáo và tinh tế',
    role: 'AI Agent / Trợ lý cá nhân AI',
    pronounSelf: 'Em',
    pronounBoss: 'Anh'
  },
  boss: {
    name: 'Tiến',
    fullName: process.env.STUDENT_NAME || 'Phan Minh Duy Tiến',
    dob: '31/08/2004',
    hobby: 'Công nghệ',
    studentId: process.env.STUDENT_ID || '42200522',
    studentClass: process.env.STUDENT_CLASS || '22040401',
    phone: process.env.ZALO_TARGET_PHONE || '0847839234'
  },
  ai: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10)
  },
  portal: {
    mockMode: process.env.MOCK_MODE === 'true',
    baseUrl: process.env.PORTAL_URL || 'https://old-stdportal.tdtu.edu.vn',
    studentId: process.env.STUDENT_ID || '42200522',
    studentPass: process.env.STUDENT_PASS || 'DuyTienA123@',
    studentName: process.env.STUDENT_NAME || 'Phan Minh Duy Tiến',
    studentClass: process.env.STUDENT_CLASS || '22040401',
    checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES || '3', 10)
  },
  zalo: {
    targetPhone: process.env.ZALO_TARGET_PHONE || '0847839234'
  },
  paths: {
    rootDir: path.resolve(__dirname, '../../'),
    dataDir: path.resolve(__dirname, '../../data'),
    stateFile: path.resolve(__dirname, '../../data/state.json')
  }
};

export default config;
