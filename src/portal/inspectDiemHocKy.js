import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function inspectDiemHocKyHtml() {
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

  const res = await client.get('https://ketquahoctap.tdtu.edu.vn/Home/DiemHocKy/');
  const $ = cheerio.load(res.data);

  console.log('--- Dropdown Selects ---');
  $('select').each((i, sel) => {
    console.log('Select id:', $(sel).attr('id'), 'name:', $(sel).attr('name'));
    $(sel).find('option').each((j, opt) => {
      console.log(` Option: val=${$(opt).attr('value')} text=${$(opt).text().trim()} selected=${$(opt).attr('selected')}`);
    });
  });

  console.log('--- Scripts on DiemHocKy ---');
  $('script').each((i, sc) => {
    const text = $(sc).html();
    if (text && (text.includes('ajax') || text.includes('Diem') || text.includes('table') || text.includes('HocKy') || text.includes('hocky'))) {
      console.log('Script block:');
      console.log(text.trim());
    }
  });
}

inspectDiemHocKyHtml().catch(e => console.error(e));
