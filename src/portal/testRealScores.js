import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

async function testFetchSemesterScoresWithAllParams() {
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

  const hkList = await client.get(`https://ketquahoctap.tdtu.edu.vn/Home/LayHocKy_KetQuaHocTap?mssv=42200522&namvt=2022&hedaotao=0&time=${Date.now()}`);
  console.log(`Tìm thấy ${hkList.data.length} học kỳ.`);

  for (const hk of hkList.data.slice(0, 4)) {
    console.log(`\n================== 🎓 ${hk.TenHocKy} (${hk.NameTable}) ==================`);
    try {
      const q = new URLSearchParams({
        mssv: '42200522',
        nametable: hk.NameTable,
        lop: '22040401',
        hedaotao: '0',
        fox: '',
        namvt: '2022',
        time: Date.now().toString()
      });

      const res = await client.get(`https://ketquahoctap.tdtu.edu.vn/Home/LayKetQuaHocTap?${q.toString()}`);
      console.log(`Số lượng môn học: ${res.data.length}`);
      res.data.forEach((item, idx) => {
        const dtb = item.DTB || 'Chưa có';
        const gk = item.Diem2 || '-';
        const ck = item.DiemThi1 || '-';
        console.log(`${idx + 1}. [${item.MonHocID}] ${item.TenMH} (${item.SoTC} TC) | GK: ${gk} | CK: ${ck} | Tổng: ${dtb} | Cập nhật: ${item.NgayCongBoDTB || item.NgayCongBoDiemThi1 || 'Chưa có'}`);
      });
    } catch(e) {
      console.log(`Lỗi:`, e.response?.status, e.message);
    }
  }
}

testFetchSemesterScoresWithAllParams().catch(e => console.error(e));
