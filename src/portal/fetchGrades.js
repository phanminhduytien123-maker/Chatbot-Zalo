import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function fetchGradesTDTU() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    }
  }));

  console.log('1. Đăng nhập hệ thống...');
  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: '42200522', pass: 'DuyTienA123@' });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params);
  await client.get(signin.data.url);

  console.log('2. Truy cập kết quả học tập (https://ketquahoctap.tdtu.edu.vn/)...');
  try {
    const res = await client.get('https://ketquahoctap.tdtu.edu.vn/');
    console.log('Status:', res.status, 'URL:', res.request?.res?.responseUrl || res.config.url);
    const $ = cheerio.load(res.data);
    console.log('Title:', $('title').text().trim());
    console.log('Tables:', $('table').length);

    $('table').each((i, tbl) => {
      console.log(`\n--- BẢNG ĐIỂM SỐ ${i} ---`);
      $(tbl).find('tr').each((j, tr) => {
        const text = $(tr).text().replace(/\s+/g, ' ').trim();
        if (text.length > 5) {
          console.log(`[Hàng ${j}] ${text}`);
        }
      });
    });
  } catch(e) {
    console.log('Lỗi ketquahoctap:', e.message);
  }
}

fetchGradesTDTU().catch(e => console.error(e));
