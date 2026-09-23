import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function inspectMainSections() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }));

  // Login
  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: '42200522', pass: 'DuyTienA123@' });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  await client.get(signin.data.url);

  // Check /Main or /Home
  const res = await client.get('https://old-stdportal.tdtu.edu.vn/Home/Index');
  const $ = cheerio.load(res.data);

  // Print all elements with id or class related to daotao, hoctap, diem, lich
  console.log('--- Submenu Items in HTML ---');
  $('#daotao a, #hoctap a, #sinhvien a, #chiphi a, .nav a, .tab-pane a, .card a, li a').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    const href = $(el).attr('href');
    const onclick = $(el).attr('onclick');
    if (text.length > 2) {
      console.log(`- [${text}] -> href: ${href || 'none'} | onclick: ${onclick || 'none'}`);
    }
  });

  // Also check if there are AJAX API calls in the scripts
  $('script').each((_, el) => {
    const txt = $(el).html();
    if (txt && (txt.includes('url:') || txt.includes('/api') || txt.includes('/SinhVien') || txt.includes('/Diem') || txt.includes('/HocTap') || txt.includes('/DaoTao'))) {
      console.log('Script snippet:');
      console.log(txt.trim());
    }
  });
}

inspectMainSections().catch(e => console.error(e));
