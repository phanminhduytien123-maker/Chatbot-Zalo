import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function checkDiemHocKyDOM() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }));

  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: '42200522', pass: 'DuyTienA123@' });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params);
  await client.get(signin.data.url);
  await client.get('https://ketquahoctap.tdtu.edu.vn/');

  const res = await client.get('https://ketquahoctap.tdtu.edu.vn/Home/DiemHocKy/');
  const $ = cheerio.load(res.data);

  console.log('--- DOM Elements on DiemHocKy ---');
  console.log('#mssv:', $('#mssv').text().trim(), 'html:', $('#mssv').html());
  console.log('#namvt:', $('#namvt').text().trim());
  console.log('#hedaotao:', $('#hedaotao').text().trim());
  console.log('#fox:', $('#fox').text().trim());
  console.log('#lop:', $('#lop').text().trim());
  console.log('#hdt:', $('#hdt').text().trim());

  $('span').each((_, el) => {
    const id = $(el).attr('id');
    const txt = $(el).text().trim();
    if (id) console.log(`span id="${id}": "${txt}"`);
  });
}

checkDiemHocKyDOM().catch(e => console.error(e));
