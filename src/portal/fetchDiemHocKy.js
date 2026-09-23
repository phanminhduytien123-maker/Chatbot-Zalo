import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function fetchDiemHocKy() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    }
  }));

  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: '42200522', pass: 'DuyTienA123@' });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params);
  await client.get(signin.data.url);
  await client.get('https://ketquahoctap.tdtu.edu.vn/');

  console.log('📡 Đang tải https://ketquahoctap.tdtu.edu.vn/Home/DiemHocKy/ ...');
  const res = await client.get('https://ketquahoctap.tdtu.edu.vn/Home/DiemHocKy/');
  const $ = cheerio.load(res.data);

  console.log('Title:', $('title').text().trim());
  console.log('Tables found:', $('table').length);

  $('table').each((i, tbl) => {
    console.log(`\n=== BẢNG ĐIỂM SỐ ${i + 1} ===`);
    $(tbl).find('tr').each((j, tr) => {
      const rowText = $(tr).find('th, td').map((_, cell) => $(cell).text().trim().replace(/\s+/g, ' ')).get().join(' | ');
      if (rowText.length > 3) {
        console.log(`[${j}] ${rowText}`);
      }
    });
  });
}

fetchDiemHocKy().catch(e => console.error(e));
