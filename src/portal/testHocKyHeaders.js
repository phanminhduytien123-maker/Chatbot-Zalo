import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

async function testFetchHocKyWithHeaders() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://ketquahoctap.tdtu.edu.vn/Home/DiemHocKy/',
      'Accept': 'application/json, text/javascript, */*; q=0.01'
    }
  }));

  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: '42200522', pass: 'DuyTienA123@' });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params);
  await client.get(signin.data.url);
  await client.get('https://ketquahoctap.tdtu.edu.vn/');
  await client.get('https://ketquahoctap.tdtu.edu.vn/Home/DiemHocKy/');

  console.log('1. Thử GET với Referer và headers...');
  try {
    const resGet = await client.get(`https://ketquahoctap.tdtu.edu.vn/Home/LayHocKy_KetQuaHocTap?mssv=42200522&namvt=2022&hedaotao=0&time=${Date.now()}`);
    console.log('GET Result Data:', resGet.data);
  } catch(e) {
    console.log('GET Error:', e.response?.status, e.message);
  }

  console.log('\n2. Thử POST với FormData...');
  try {
    const postParams = new URLSearchParams({ mssv: '42200522', namvt: '2022', hedaotao: '0' });
    const resPost = await client.post(`https://ketquahoctap.tdtu.edu.vn/Home/LayHocKy_KetQuaHocTap?time=${Date.now()}`, postParams);
    console.log('POST Result Data:', resPost.data);
  } catch(e) {
    console.log('POST Error:', e.response?.status, e.message);
  }

  console.log('\n3. Thử GET DiemTongHop...');
  try {
    const resTH = await client.get(`https://ketquahoctap.tdtu.edu.vn/Home/LayDiemTongHop?mssv=42200522&time=${Date.now()}`);
    console.log('DiemTongHop Result:', resTH.data);
  } catch(e) {
    console.log('DiemTongHop Error:', e.response?.status, e.message);
  }
}

testFetchHocKyWithHeaders().catch(e => console.error(e));
