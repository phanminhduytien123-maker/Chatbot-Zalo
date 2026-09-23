import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function testWithCookieJar() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    }
  }));

  console.log('1. Đang truy cập trang đăng nhập để lấy session ban đầu...');
  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');

  console.log('2. Đang gửi thông tin đăng nhập (MSSV: 42200522)...');
  const params = new URLSearchParams();
  params.append('user', '42200522');
  params.append('pass', 'DuyTienA123@');

  const signinRes = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    }
  });

  console.log('SignIn Response:', signinRes.data);

  if (signinRes.data && signinRes.data.url) {
    console.log('3. Đi theo chuỗi SSO redirect:', signinRes.data.url);
    const ssoRes = await client.get(signinRes.data.url);
    console.log('SSO Result Status:', ssoRes.status);
    console.log('Final URL reached:', ssoRes.request?.res?.responseUrl || ssoRes.config.url);

    // Truy cập trang chủ
    console.log('4. Truy cập trang chủ Portal...');
    const homeRes = await client.get('https://old-stdportal.tdtu.edu.vn/Home/Index');
    const $ = cheerio.load(homeRes.data);
    console.log('📌 Title trang chủ:', $('title').text().trim());

    // Tìm tên sinh viên
    const fullHtml = homeRes.data;
    console.log('Body length:', fullHtml.length);

    // Kiểm tra xem có chứa tên hoặc MSSV 42200522
    if (fullHtml.includes('42200522') || !fullHtml.includes('Đăng nhập')) {
      console.log('🎉 ĐĂNG NHẬP THÀNH CÔNG VÀO PORTAL THẬT!');
    }

    // In danh sách các đường link có trên trang
    console.log('\n--- 🔗 CÁC MENU TÌM THẤY ---');
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (href && text && (text.includes('Điểm') || text.includes('Đơn') || text.includes('Lịch') || text.includes('Thông báo') || text.includes('Học vụ') || text.includes('Rèn luyện'))) {
        console.log(`[${text}] -> ${href}`);
      }
    });

    // Thử truy cập trang Xem Điểm
    console.log('\n5. Đang thử vào trang Xem Điểm...');
    const gradeRes = await client.get('https://old-stdportal.tdtu.edu.vn/SinhVien/XemDiem');
    console.log('Grade page status:', gradeRes.status, 'Title:', cheerio.load(gradeRes.data)('title').text().trim());
  }
}

testWithCookieJar().catch(e => console.error('Error:', e.message));
