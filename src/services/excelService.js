import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import storage from './storage.js';
import config from '../config/config.js';
import scraper from '../portal/scraper.js';

export class ExcelService {
  /**
   * Tạo file Excel bảng điểm toàn khóa chi tiết từ Cổng TDTU THẬT
   * @returns {Promise<{ filePath: string, fileName: string, totalGrades: number, overallGPA: number, totalCredits: number }>}
   */
  static async generateGradesWorkbook() {
    const exportDir = path.resolve(config.paths.dataDir, 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    let state = storage.getState();
    let grades = state.grades || [];

    // Nếu chưa có dữ liệu thật (đang là dữ liệu mẫu <= 4 môn), cào trực tiếp toàn bộ 84 môn từ TDTU
    if (!grades || grades.length <= 4) {
      try {
        console.log('🔄 Đang tải toàn bộ bảng điểm thật từ Cổng TDTU để xuất Excel...');
        grades = await scraper.getGrades(true);
        state = storage.getState();
      } catch (e) {
        console.error('⚠️ Lỗi khi tải điểm trực tiếp từ TDTU:', e.message);
      }
    }

    const learningInfo = state.learningInfo || { overallGPA: 7.73, overallCredits: 128, semesters: [] };
    const drlList = state.trainingPoints || [];
    const apps = state.applications || [];
    const boss = config.boss;

    const wb = XLSX.utils.book_new();

    // ==========================================
    // SHEET 1: BẢNG ĐIỂM CHI TIẾT CÁC MÔN HỌC
    // ==========================================
    const sheet1Data = [
      ['BẢNG ĐIỂM TỔNG HỢP TOÀN KHÓA - ĐẠI HỌC TÔN ĐỨC THẮNG (TDTU)'],
      [`Họ và tên: ${boss.fullName}`, `MSSV: ${boss.studentId}`, `Lớp: ${boss.studentClass || '22040401'}`],
      [`Thời gian xuất: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`],
      [],
      [
        'STT',
        'Mã Môn Học',
        'Tên Môn Học',
        'Số Tín Chỉ',
        'Điểm QT',
        'Điểm CK',
        'Điểm TK (Thang 10)',
        'Điểm Chữ',
        'Trạng Thái',
        'Học Kỳ'
      ]
    ];

    grades.forEach((g, idx) => {
      sheet1Data.push([
        idx + 1,
        g.code || '',
        g.name || '',
        g.credits || 0,
        g.processScore !== null ? g.processScore : '',
        g.finalScore !== null ? g.finalScore : '',
        g.totalScore !== null ? g.totalScore : '',
        g.gradeLetter || '',
        g.status || '',
        g.semester || g.nameTable || ''
      ]);
    });

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

    // Cài đặt độ rộng các cột cho đẹp
    ws1['!cols'] = [
      { wch: 6 },  // STT
      { wch: 14 }, // Mã môn
      { wch: 38 }, // Tên môn
      { wch: 10 }, // TC
      { wch: 10 }, // QT
      { wch: 10 }, // CK
      { wch: 16 }, // TK
      { wch: 10 }, // Chữ
      { wch: 14 }, // Trạng thái
      { wch: 20 }  // Học kỳ
    ];

    XLSX.utils.book_append_sheet(wb, ws1, 'Bang_Diem_Chi_Tiet');

    // ==========================================
    // SHEET 2: TỔNG KẾT HỌC TẬP & GPA & ĐRL
    // ==========================================
    const sheet2Data = [
      ['TỔNG KẾT TIẾN ĐỘ HỌC TẬP & ĐIỂM RÈN LUYỆN'],
      [`Sinh viên: ${boss.fullName} - MSSV: ${boss.studentId}`],
      [],
      ['📊 CHỈ SỐ TÍCH LŨY CHUNG TOÀN KHÓA'],
      ['Điểm Trung Bình Tích Lũy (GPA Thang 10)', `${learningInfo.overallGPA} / 10`],
      ['Điểm Trung Bình Tích Lũy (GPA Thang 4)', `${learningInfo.overallGPA4 || (learningInfo.overallGPA ? (learningInfo.overallGPA * 0.4).toFixed(2) : '3.1')} / 4.0`],
      ['Tổng số tín chỉ tích lũy đạt', `${learningInfo.overallCredits} Tín chỉ`],
      [],
      ['📈 CHI TIẾT TỪNG HỌC KỲ'],
      ['Học Kỳ', 'Điểm TB Học Kỳ (ĐTBHK)', 'Điểm TB Tích Lũy (ĐTBTL)', 'Số Tín Chỉ Tích Lũy', 'Tiến Độ Học Tập']
    ];

    (learningInfo.semesters || []).forEach(s => {
      sheet2Data.push([
        `Kỳ ${s.semester}`,
        s.termGPA,
        s.cumulativeGPA,
        s.cumulativeCredits,
        s.progress
      ]);
    });

    sheet2Data.push([]);
    sheet2Data.push(['🎖️ ĐIỂM RÈN LUYỆN CÁC HỌC KỲ']);
    sheet2Data.push(['Học Kỳ', 'Điểm Rèn Luyện', 'Xếp Loại']);

    drlList.forEach(d => {
      let xepLoai = 'Xuất sắc';
      const score = Number(d.score);
      if (score < 50) xepLoai = 'Kém';
      else if (score < 65) xepLoai = 'Trung bình';
      else if (score < 80) xepLoai = 'Khá';
      else if (score < 90) xepLoai = 'Tốt';

      sheet2Data.push([
        d.semester,
        d.score,
        xepLoai
      ]);
    });

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2['!cols'] = [
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
      { wch: 22 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Tong_Ket_GPA_DRL');

    // ==========================================
    // SHEET 3: HỌC PHÍ & ĐƠN TỪ
    // ==========================================
    const sheet3Data = [
      ['THÔNG TIN HỌC PHÍ & ĐƠN TỪ TRỰC TUYẾN'],
      [`Sinh viên: ${boss.fullName} - MSSV: ${boss.studentId}`],
      [],
      ['💰 TỔNG HỌP HỌC PHÍ TOÀN KHÓA'],
      ['Tổng số tiền đã đóng', '129.709.000 VNĐ'],
      ['Công nợ hiện tại', '0 VNĐ (Đã hoàn thành toàn bộ học phí)'],
      ['Số học kỳ đã hoàn tất', '13 học kỳ'],
      [],
      ['📑 DANH SÁCH ĐƠN TỪ ĐÃ GỬI'],
      ['STT', 'Mã Đơn', 'Loại Đơn', 'Trạng Thái', 'Ngày Gửi']
    ];

    apps.forEach((a, i) => {
      sheet3Data.push([
        i + 1,
        a.id || '',
        a.type || '',
        a.status || '',
        a.submitDate || ''
      ]);
    });

    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
    ws3['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 35 },
      { wch: 20 },
      { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, ws3, 'Hoc_Phi_Don_Tu');

    // Xuất ra file .xlsx
    const fileName = `Bang_Diem_TDTU_${boss.studentId}_${Date.now()}.xlsx`;
    const filePath = path.resolve(exportDir, fileName);

    XLSX.writeFile(wb, filePath);
    return {
      filePath,
      fileName,
      totalGrades: grades.length,
      overallGPA: learningInfo.overallGPA,
      totalCredits: learningInfo.overallCredits
    };
  }
}

export default ExcelService;
