/**
 * Dữ liệu giả lập thực tế từ Cổng thông tin sinh viên TDTU (hoặc tương đương)
 * Dùng khi chạy kiểm thử (MOCK_MODE=true) hoặc khi chưa gắn Cookie thật.
 */

export const initialMockState = {
  grades: [
    {
      code: '404CM7',
      name: 'Kỹ năng thực hành chuyên môn',
      credits: 2,
      processScore: null,
      midtermScore: null,
      finalScore: null,
      totalScore: null,
      gradeLetter: null,
      status: 'Chưa có điểm',
      updatedAt: '2026-08-30 08:00:00'
    },
    {
      code: '502043',
      name: 'Phát triển ứng dụng Web',
      credits: 3,
      processScore: 8.5,
      midtermScore: 9.0,
      finalScore: 8.5,
      totalScore: 8.6,
      gradeLetter: 'A',
      status: 'Đã có điểm',
      updatedAt: '2026-08-28 14:20:00'
    },
    {
      code: '502044',
      name: 'Trí tuệ nhân tạo & Ứng dụng',
      credits: 3,
      processScore: 9.0,
      midtermScore: 8.5,
      finalScore: null,
      totalScore: null,
      gradeLetter: null,
      status: 'Chưa có điểm cuối kỳ',
      updatedAt: '2026-08-25 10:00:00'
    },
    {
      code: '502045',
      name: 'An toàn và bảo mật hệ thống',
      credits: 3,
      processScore: 7.5,
      midtermScore: 8.0,
      finalScore: null,
      totalScore: null,
      gradeLetter: null,
      status: 'Chưa có điểm',
      updatedAt: '2026-08-20 09:30:00'
    }
  ],

  announcements: [
    {
      id: 'tb-2026-0901',
      department: 'Phòng Đào Tạo',
      title: 'Thông báo về việc gia hạn thời gian nộp học phí Học kỳ 1 (2026 - 2027)',
      summary: 'Phòng Đào tạo thông báo gia hạn thời gian đóng học phí đến hết ngày 15/10/2026.',
      publishedDate: '2026-09-01',
      isImportant: true,
      url: 'https://stdportal.tdtu.edu.vn/tintuc/tb-2026-0901'
    },
    {
      id: 'tb-2026-0828',
      department: 'Khoa Công Nghệ Thông Tin',
      title: 'Hội thảo AI & Xu hướng phát triển công nghệ Generative AI',
      summary: 'Thời gian: 08:30 Thứ Bảy 05/09/2026 tại Hội trường 6B. Cộng 5 điểm rèn luyện.',
      publishedDate: '2026-08-28',
      isImportant: false,
      url: 'https://stdportal.tdtu.edu.vn/tintuc/tb-2026-0828'
    },
    {
      id: 'tb-2026-0825',
      department: 'Phòng Công Tác Sinh Viên',
      title: 'Xét cấp học bổng khuyến khích học tập Học kỳ 2 năm học vừa qua',
      summary: 'Sinh viên nộp hồ sơ xét duyệt học bổng trực tuyến trước ngày 10/09/2026.',
      publishedDate: '2026-08-25',
      isImportant: true,
      url: 'https://stdportal.tdtu.edu.vn/tintuc/tb-2026-0825'
    }
  ],

  applications: [
    {
      id: 'REQ-10294',
      type: 'Đơn xin cấp Giấy xác nhận sinh viên (Bổ sung hồ sơ)',
      submitDate: '2026-08-29',
      status: 'Đang xử lý', // Chờ duyệt -> Đã duyệt
      processedBy: 'Phòng Đào Tạo',
      note: 'Dự kiến hoàn thành sau 2 ngày làm việc'
    },
    {
      id: 'REQ-10180',
      type: 'Đơn xin phúc khảo điểm thi kết thúc học phần',
      submitDate: '2026-08-15',
      status: 'Đã duyệt',
      processedBy: 'Khoa CNTT',
      note: 'Điểm sau phúc khảo giữ nguyên 8.5'
    }
  ],

  activities: [
    {
      id: 'ACT-902',
      name: 'Chiến dịch Mùa hè xanh & Tiếp sức mùa thi 2026',
      points: 10,
      category: 'Công tác xã hội & Tình nguyện',
      regDeadline: '2026-09-05',
      status: 'Đang mở đăng ký'
    },
    {
      id: 'ACT-903',
      name: 'Cuộc thi Ý tưởng Khởi nghiệp Sáng tạo Sinh viên TDTU 2026',
      points: 15,
      category: 'Học thuật & NCKH',
      regDeadline: '2026-09-12',
      status: 'Đang mở đăng ký'
    }
  ],

  examSchedules: [
    {
      code: '404CM7',
      subject: 'Kỹ năng thực hành chuyên môn',
      examDate: '2026-09-15',
      examTime: '07:30 - 09:30',
      room: 'B402',
      seatNumber: '24'
    }
  ]
};

export default initialMockState;
