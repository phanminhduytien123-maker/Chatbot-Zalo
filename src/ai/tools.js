import scraper from '../portal/scraper.js';
import config from '../config/config.js';
import NotificationFormatter from '../services/notification.js';
import storage from '../services/storage.js';

/**
 * Định nghĩa các Tool / Function Calling cho AI Gemini
 */
export const aiToolDeclarations = [
  {
    name: 'get_grades',
    description: 'Tra cứu điểm thi, điểm quá trình, điểm tổng kết các môn học của sinh viên trong học kỳ hiện tại.',
    parameters: {
      type: 'OBJECT',
      properties: {
        subjectCode: {
          type: 'STRING',
          description: 'Mã môn học hoặc tên môn học cụ thể cần xem (ví dụ: 404CM7, Đồ án tốt nghiệp, Thực hành chuyên môn), để trống nếu muốn xem tất cả các môn'
        }
      }
    }
  },
  {
    name: 'get_announcements',
    description: 'Lấy danh sách các thông báo, tin tức mới nhất từ trường, phòng Đào tạo, phòng Công tác sinh viên hoặc khoa.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: {
          type: 'INTEGER',
          description: 'Số lượng bài viết muốn lấy, mặc định là 3'
        },
        onlyImportant: {
          type: 'BOOLEAN',
          description: 'Chỉ lọc các thông báo quan trọng / khẩn cấp / học phí'
        }
      }
    }
  },
  {
    name: 'get_applications',
    description: 'Tra cứu danh sách và trạng thái xử lý các đơn từ trực tuyến của sinh viên (giấy xác nhận sinh viên, tạm hoãn nghĩa vụ quân sự, đơn phúc khảo...).',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'get_activities',
    description: 'Tra cứu danh sách hoạt động ngoại khóa, tình nguyện, phong trào rèn luyện đang mở đăng ký để tích lũy điểm rèn luyện (ĐRL).',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'get_system_status',
    description: 'Kiểm tra trạng thái kết nối Cổng sinh viên TDTU, tần suất quét ngầm và tình trạng tổng thể của bot sinh viên.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  }
];

/**
 * Bộ thực thi (Tool Executor) khi AI quyết định gọi hàm
 */
export async function executeTool(toolName, args = {}) {
  switch (toolName) {
    case 'get_grades': {
      const grades = await scraper.getGrades();
      if (args.subjectCode) {
        const query = args.subjectCode.toLowerCase();
        const filtered = grades.filter(g => 
          g.code.toLowerCase().includes(query) ||
          g.name.toLowerCase().includes(query)
        );
        return {
          totalSubjects: filtered.length > 0 ? filtered.length : grades.length,
          subjects: filtered.length > 0 ? filtered : grades
        };
      }
      return {
        totalSubjects: grades.length,
        hasScoreCount: grades.filter(g => g.status === 'Đã có điểm').length,
        subjects: grades
      };
    }

    case 'get_announcements': {
      const news = await scraper.getAnnouncements();
      let result = news;
      if (args.onlyImportant) {
        result = result.filter(n => n.isImportant);
      }
      const limit = args.limit || 3;
      return {
        count: result.length,
        announcements: result.slice(0, limit)
      };
    }

    case 'get_applications': {
      const apps = await scraper.getApplications();
      return {
        totalApplications: apps.length,
        applications: apps
      };
    }

    case 'get_activities': {
      const acts = await scraper.getActivities();
      return {
        totalActivities: acts.length,
        activities: acts
      };
    }

    case 'get_system_status': {
      const cookieStatus = await scraper.checkCookieStatus();
      const grades = await scraper.getGrades();
      return {
        cookieStatus,
        checkIntervalMinutes: config.portal.checkIntervalMinutes,
        totalSubjects: grades.length,
        studentName: config.portal.studentName,
        studentId: config.portal.studentId
      };
    }

    default:
      return { error: `Không tìm thấy tool mang tên: ${toolName}` };
  }
}
