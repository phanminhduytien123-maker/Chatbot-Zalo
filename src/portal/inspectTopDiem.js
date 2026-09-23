import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

async function inspectTopDiemHocKy() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar }));
  const res = await client.get('https://ketquahoctap.tdtu.edu.vn/Scripts/views/DiemHocKy.js');
  const lines = res.data.split('\n');
  console.log(lines.slice(0, 70).join('\n'));
}

inspectTopDiemHocKy();
