import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

async function inspectDiemHocKyFull() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar }));
  const res = await client.get('https://ketquahoctap.tdtu.edu.vn/Scripts/views/DiemHocKy.js');
  console.log(res.data);
}

inspectDiemHocKyFull();
