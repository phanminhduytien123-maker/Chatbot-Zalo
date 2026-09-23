import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function fetchRealStudentData() {
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

  console.log('2. Lấy Kết quả học vụ (/main/ketquahocvu)...');
  try {
    const hocvuRes = await client.get('https://old-stdportal.tdtu.edu.vn/main/ketquahocvu');
    const $hv = cheerio.load(hocvuRes.data);
    console.log('Học vụ Title:', $hv('title').text().trim());
    console.log('Học vụ Tables count:', $hv('table').length);
    $hv('table').each((i, table) => {
      console.log(`Table ${i}:`, $hv(table).find('tr').slice(0, 5).text().replace(/\s+/g, ' '));
    });
  } catch(e) {
    console.log('Lỗi hocvu:', e.message);
  }

  console.log('\n3. Lấy Điểm rèn luyện (/main/hoatdongphongtrao)...');
  try {
    const drlRes = await client.get('https://old-stdportal.tdtu.edu.vn/main/hoatdongphongtrao');
    const $drl = cheerio.load(drlRes.data);
    console.log('DRL Title:', $drl('title').text().trim());
    $drl('table').each((i, table) => {
      console.log(`DRL Table ${i}:`, $drl(table).find('tr').slice(0, 4).text().replace(/\s+/g, ' '));
    });
  } catch(e) {
    console.log('Lỗi drl:', e.message);
  }

  console.log('\n4. Lấy Kết quả chứng nhận / Đơn từ (/main/ketquachungnhan)...');
  try {
    const certRes = await client.get('https://old-stdportal.tdtu.edu.vn/main/ketquachungnhan');
    const $cert = cheerio.load(certRes.data);
    console.log('Đơn từ Title:', $cert('title').text().trim());
    $cert('table').each((i, table) => {
      console.log(`Đơn từ Table ${i}:`, $cert(table).find('tr').slice(0, 4).text().replace(/\s+/g, ' '));
    });
  } catch(e) {
    console.log('Lỗi đơn từ:', e.message);
  }
}

fetchRealStudentData().catch(e => console.error(e));
