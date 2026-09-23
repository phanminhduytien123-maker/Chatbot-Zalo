import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

async function fetchHocKyScript() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar }));
  const res = await client.get('https://ketquahoctap.tdtu.edu.vn/Scripts/Models/HocKy.js');
  console.log(res.data);
}

fetchHocKyScript();
