import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import config from '../config/config.js';
import storage from '../services/storage.js';

async function fetchAllSemestersHistory() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://ketquahoctap.tdtu.edu.vn/Home/DiemHocKy/',
      'Accept': 'application/json, text/javascript, */*; q=0.01'
    }
  }));

  console.log('1. Đang đăng nhập TDTU...');
  await client.get('https://old-stdportal.tdtu.edu.vn/Login/Index');
  const params = new URLSearchParams({ user: config.portal.studentId, pass: config.portal.studentPass });
  const signin = await client.post('https://old-stdportal.tdtu.edu.vn/Login/SignIn?ReturnURL=', params);
  await client.get(signin.data.url);
  await client.get('https://ketquahoctap.tdtu.edu.vn/');
  await client.get('https://ketquahoctap.tdtu.edu.vn/Home/DiemHocKy/');

  console.log('2. Đang lấy danh sách toàn bộ học kỳ...');
  const hkList = await client.get(`https://ketquahoctap.tdtu.edu.vn/Home/LayHocKy_KetQuaHocTap?mssv=${config.portal.studentId}&namvt=2022&hedaotao=0&time=${Date.now()}`);
  
  const semesters = hkList.data || [];
  console.log(`Tìm thấy tổng cộng ${semesters.length} học kỳ của sinh viên.`);

  const allSubjectsHistory = [];

  for (const hk of semesters) {
    try {
      const q = new URLSearchParams({
        mssv: config.portal.studentId,
        nametable: hk.NameTable,
        lop: config.portal.studentClass,
        hedaotao: '0',
        fox: '',
        namvt: '2022',
        time: Date.now().toString()
      });

      const scoreRes = await client.get(`https://ketquahoctap.tdtu.edu.vn/Home/LayKetQuaHocTap?${q.toString()}`);
      
      if (Array.isArray(scoreRes.data) && scoreRes.data.length > 0) {
        console.log(`- ${hk.TenHocKy} (${hk.NameTable}): ${scoreRes.data.length} môn học`);
        scoreRes.data.forEach(m => {
          const hasTotal = m.DTB && m.DTB.trim() !== '';
          let status = hasTotal ? 'Đã có điểm' : (m.DiemThi1 || m.Diem2 ? 'Đã có điểm thi (Chờ tổng kết)' : 'Chưa có điểm');

          allSubjectsHistory.push({
            code: m.MonHocID,
            name: m.TenMH,
            semester: hk.TenHocKy,
            nameTable: hk.NameTable,
            credits: parseInt(m.SoTC, 10) || 0,
            processScore: m.Diem1 || null,
            midtermScore: m.Diem2 || null,
            finalScore: m.DiemThi1 || null,
            totalScore: m.DTB || null,
            gradeLetter: hasTotal ? (m.DTB >= 8.5 ? 'A' : m.DTB >= 7.0 ? 'B' : m.DTB >= 5.5 ? 'C' : 'D') : null,
            status,
            updatedAt: m.NgayCongBoDTB || m.NgayCongBoDiemThi1 || 'Chưa cập nhật'
          });
        });
      }
    } catch(err) {
      console.log(`Lỗi học kỳ ${hk.TenHocKy}:`, err.message);
    }
  }

  console.log(`\n🎉 TỔNG CỘNG ĐÃ THU THẬP: ${allSubjectsHistory.length} môn học trong toàn bộ lịch sử!`);

  const state = storage.getState();
  state.grades = allSubjectsHistory;
  storage.saveState(state);
  console.log('💾 Đã lưu toàn bộ lịch sử điểm vào data/state.json thành công!');
}

fetchAllSemestersHistory().catch(e => console.error(e));
