import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

async function fetchAllMenuItems() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    }
  }));

  // Login
  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: '42200522', pass: 'DuyTienA123@' });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params);
  await client.get(signin.data.url);

  // Call /home/LayItemMenu
  console.log('📡 Đang gọi /home/LayItemMenu...');
  const menuRes = await client.post('https://old-stdportal.tdtu.edu.vn/home/LayItemMenu');
  console.log('Tổng số chức năng trong Menu:', menuRes.data.length);
  
  menuRes.data.forEach(item => {
    console.log(`- [${item.text}] -> Link: ${item.link}`);
  });
}

fetchAllMenuItems().catch(e => console.error(e));
