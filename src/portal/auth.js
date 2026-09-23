import axios from 'axios';

export class TDTUAuth {
  constructor(baseUrl = 'https://old-stdportal.tdtu.edu.vn') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      }
    });
  }

  /**
   * Đăng nhập tự động vào cổng sinh viên TDTU
   * @param {string} user - Mã số sinh viên (ví dụ: 42200522)
   * @param {string} pass - Mật khẩu
   */
  async login(user, pass) {
    try {
      console.log(`[TDTU Auth] 🔐 Đang đăng nhập tài khoản sinh viên: ${user}...`);

      const params = new URLSearchParams();
      params.append('user', user);
      params.append('pass', pass);

      const res = await this.client.post('/Login/SignIn?ReturnURL=', params, {
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400
      });

      const setCookies = res.headers['set-cookie'];
      const resultData = res.data;

      console.log('[TDTU Auth] Kết quả phản hồi:', resultData);

      if (resultData && (resultData.result === 'fail' || resultData.result === 'T' || resultData.result === '*')) {
        return {
          success: false,
          message: 'Sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản bị khóa!'
        };
      }

      // Xử lý cookie nhận được
      let cookieString = '';
      if (setCookies && Array.isArray(setCookies)) {
        cookieString = setCookies.map(c => c.split(';')[0]).join('; ');
      }

      return {
        success: true,
        cookie: cookieString,
        redirectUrl: resultData.url || '/',
        message: 'Đăng nhập thành công!'
      };
    } catch (err) {
      return {
        success: false,
        message: `Lỗi kết nối khi đăng nhập: ${err.message}`
      };
    }
  }
}

export const tdtuAuth = new TDTUAuth();
export default tdtuAuth;
