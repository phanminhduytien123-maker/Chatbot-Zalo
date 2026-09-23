import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

async function explorePortalRoutes() {
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

  // Get Home
  const homeRes = await client.get('https://old-stdportal.tdtu.edu.vn/Home/Index');
  const $ = cheerio.load(homeRes.data);

  // Find user name / student info
  console.log('--- 👤 THÔNG TIN SINH VIÊN ---');
  $('span, div, p, a, h4, h5').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes('42200522') || text.includes('Duy Tiến') || text.includes('Khoa') || text.includes('Ngành')) {
      if (text.length < 80) console.log(text);
    }
  });

  console.log('\n--- 🌐 TẤT CẢ ĐƯỜNG DẪN MENU PORTAL TDTU ---');
  const uniqueLinks = new Set();
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      const entry = `[${text || 'No text'}] -> ${href}`;
      if (!uniqueLinks.has(entry)) {
        uniqueLinks.add(entry);
        console.log(entry);
      }
    }
  });
}

explorePortalRoutes().catch(e => console.error(e));
