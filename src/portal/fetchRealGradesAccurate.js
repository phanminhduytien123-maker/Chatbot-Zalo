import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

async function fetchRealGradesAccurate() {
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
  console.log('1. Đang đăng nhập TDTU Portal...');
  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: '42200522', pass: 'DuyTienA123@' });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params);
  await client.get(signin.data.url);
  await client.get('https://ketquahoctap.tdtu.edu.vn/');
  await client.get('https://ketquahoctap.tdtu.edu.vn/Home/DiemHocKy/');

  // 1. Lấy danh sách Học kỳ
  console.log('2. Đang lấy danh sách học kỳ (mssv=42200522, namvt=2022, hedaotao=0)...');
  const hkRes = await client.get('https://ketquahoctap.tdtu.edu.vn/Home/LayHocKy_KetQuaHocTap?mssv=42200522&namvt=2022&hedaotao=0');
  console.log('Danh sách học kỳ:', hkRes.data);

  if (hkRes.data && hkRes.data.length > 0) {
    for (const hk of hkRes.data.slice(0, 2)) {
      console.log(`\n=== 🎓 BẢNG ĐIỂM: ${hk.TenHocKy} (NameTable: ${hk.NameTable}) ===`);
      const gradeRes = await client.get(`https://ketquahoctap.tdtu.edu.vn/Home/LayKetQuaHocTap?mssv=42200522&nametable=${hk.NameTable}`);
      
      gradeRes.data.forEach((m, idx) => {
        console.log(`${idx + 1}. [${m.MonHocID}] ${m.TenMH} (${m.SoTC} TC) | GK: ${m.Diem2 || '-'} | CK: ${m.DiemThi1 || '-'} | TK: ${m.DTB || '-'} | Ngày cập nhật: ${m.NgayCongBoDTB || m.NgayCongBoDiemThi1 || 'Chưa có'}`);
      });
    }
  }
}

fetchRealGradesAccurate().catch(e => console.error(e));
