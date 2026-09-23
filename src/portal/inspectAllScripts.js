import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function checkAllScripts() {
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

  $('script').each((i, sc) => {
    const src = $(sc).attr('src');
    const content = $(sc).html();
    if (src) console.log(`Script src [${i}]: ${src}`);
    if (content && content.length > 0) console.log(`Script inline [${i}]:\n${content.trim()}`);
  });
}

checkAllScripts().catch(e => console.error(e));
