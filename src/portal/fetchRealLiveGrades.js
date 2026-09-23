import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

async function fetchRealLiveGrades() {
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
  console.log('1. Đang đăng nhập...');
  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: '42200522', pass: 'DuyTienA123@' });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params);
  await client.get(signin.data.url);
  await client.get('https://ketquahoctap.tdtu.edu.vn/');

  // 1. Lấy danh sách Học kỳ
  console.log('2. Đang lấy danh sách học kỳ...');
  const hkRes = await client.get('https://ketquahoctap.tdtu.edu.vn/Home/LayHocKy_KetQuaHocTap?time=' + Date.now());
  console.log('Danh sách học kỳ:', hkRes.data);

  if (hkRes.data && hkRes.data.length > 0) {
    const latestSemester = hkRes.data[0];
    console.log(`\n3. Đang lấy bảng điểm của học kỳ mới nhất: ${latestSemester.TenHocKy} (${latestSemester.TenBangDiem})...`);
    
    const gradesRes = await client.get(`https://ketquahoctap.tdtu.edu.vn/Home/LayKetQuaHocTap?lop=22040401&mssv=42200522&tenBangDiem=${encodeURIComponent(latestSemester.TenBangDiem)}&time=${Date.now()}`);
    console.log(`\n=== 🎓 BẢNG ĐIỂM HỌC KỲ ${latestSemester.TenHocKy} ===`);
    console.log(JSON.stringify(gradesRes.data, null, 2));
  }

  // 2. Lấy điểm tổng hợp tích lũy
  console.log('\n4. Đang lấy điểm tổng hợp tích lũy...');
  const totalRes = await client.get(`https://ketquahoctap.tdtu.edu.vn/Home/LayDiemTongHop?mssv=42200522&time=${Date.now()}`);
  console.log('Điểm tổng hợp:', totalRes.data?.slice(0, 3));
}

fetchRealLiveGrades().catch(e => console.error(e));
