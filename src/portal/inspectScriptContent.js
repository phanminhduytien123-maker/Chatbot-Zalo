import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

async function fetchScripts() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }));

  const res1 = await client.get('https://ketquahoctap.tdtu.edu.vn/Scripts/views/DiemHocKy.js');
  console.log('--- /Scripts/views/DiemHocKy.js ---');
  console.log(res1.data);

  const res2 = await client.get('https://ketquahoctap.tdtu.edu.vn/Scripts/Models/KetQuaHocTap.js');
  console.log('--- /Scripts/Models/KetQuaHocTap.js ---');
  console.log(res2.data);
}

fetchScripts().catch(e => console.error(e));
