import axios from 'axios';
import * as cheerio from 'cheerio';
import { tdtuAuth } from './auth.js';

async function testSession() {
  console.log('🚀 Bắt đầu kiểm tra kết nối Cổng sinh viên TDTU thực tế...');
  
  const loginRes = await tdtuAuth.login('42200522', 'DuyTienA123@');
  if (!loginRes.success) {
    console.error('❌ Đăng nhập thất bại:', loginRes.message);
    return;
  }

  const ssoUrl = loginRes.redirectUrl;
  console.log('🔗 Đang chuyển hướng qua SSO:', ssoUrl);

  const client = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Cookie': loginRes.cookie
    },
    maxRedirects: 10
  });

  try {
    const ssoRes = await client.get(ssoUrl);
    console.log('✅ SSO phản hồi status:', ssoRes.status);

    // Ghép cookie
    let fullCookie = loginRes.cookie;
    if (ssoRes.headers['set-cookie']) {
      const newCookies = ssoRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
      fullCookie += '; ' + newCookies;
    }

    console.log('📄 Đang tải trang chủ Cổng Sinh Viên...');
    const homeRes = await axios.get('https://old-stdportal.tdtu.edu.vn/Home/Index', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': fullCookie
      }
    });

    const $ = cheerio.load(homeRes.data);
    console.log('📌 Tiêu đề trang:', $('title').text().trim());

    console.log('\n--- 🔗 CÁC MENU TRÊN WEB TRƯỜNG TDTU ---');
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (href && text && text.length > 2) {
        console.log(`[${text}] -> ${href}`);
      }
    });

    return { success: true, cookie: fullCookie };
  } catch (err) {
    console.error('❌ Lỗi session:', err.message);
  }
}

testSession();
