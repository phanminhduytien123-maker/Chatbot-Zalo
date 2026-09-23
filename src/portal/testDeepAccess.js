import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function testDeepAccess() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    }
  }));

  console.log('1. Đăng nhập SSO...');
  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: '42200522', pass: 'DuyTienA123@' });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params);
  await client.get(signin.data.url);

  console.log('\n2. Thử vào Lịch Thi (https://lichhoc-lichthi.tdtu.edu.vn/xemlichthi.aspx)...');
  try {
    const examRes = await client.get('https://lichhoc-lichthi.tdtu.edu.vn/xemlichthi.aspx');
    console.log('Lịch thi status:', examRes.status);
    const $e = cheerio.load(examRes.data);
    console.log('Lịch thi title:', $e('title').text().trim());
    $e('table').each((i, tbl) => {
      console.log(`Bảng lịch thi ${i}:`, $e(tbl).find('tr').slice(0, 5).text().replace(/\s+/g, ' '));
    });
  } catch(err) {
    console.log('Lỗi xem lịch thi:', err.message);
  }

  console.log('\n3. Thử vào Thời Khóa Biểu (https://lichhoc-lichthi.tdtu.edu.vn/tkb2.aspx)...');
  try {
    const tkbRes = await client.get('https://lichhoc-lichthi.tdtu.edu.vn/tkb2.aspx');
    console.log('TKB status:', tkbRes.status);
    const $t = cheerio.load(tkbRes.data);
    console.log('TKB title:', $t('title').text().trim());
    console.log('TKB tables count:', $t('table').length);
  } catch(err) {
    console.log('Lỗi xem TKB:', err.message);
  }

  console.log('\n4. Thử vào Học Phí (https://hocphilephi.tdtu.edu.vn/)...');
  try {
    const feeRes = await client.get('https://hocphilephi.tdtu.edu.vn/');
    console.log('Học phí status:', feeRes.status);
    const $f = cheerio.load(feeRes.data);
    console.log('Học phí title:', $f('title').text().trim());
    console.log('Học phí body snippet:', $f('body').text().replace(/\s+/g, ' ').substring(0, 300));
  } catch(err) {
    console.log('Lỗi xem học phí:', err.message);
  }
}

testDeepAccess().catch(e => console.error(e));
