import scraper from '../portal/scraper.js';
import config from '../config/config.js';
import NotificationFormatter from '../services/notification.js';
import storage from '../services/storage.js';
import { pcBridge } from '../pc/pcBridge.js';

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
  },
  {
    name: 'get_bambu_3d_printer_status',
    description: 'Kiểm tra trạng thái thời gian thực của máy in 3D Bambu Lab A1 mini: tiến độ in %, lớp in, nhiệt độ đầu phun (nozzle), nhiệt độ bàn in (bed max 80°C), quạt, tốc độ và thời gian còn lại.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'control_bambu_3d_printer',
    description: 'Điều khiển máy in 3D Bambu Lab A1 mini: tạm dừng (pause), tiếp tục (resume), hủy in (stop), bật/tắt đèn (set_light), chỉnh nhiệt độ hoặc gửi mã G-code.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Hành động điều khiển: "pause" (tạm dừng), "resume" (tiếp tục), "stop" (hủy in), "set_light" (bật/tắt đèn), "set_temp" (đặt nhiệt độ), "gcode" (gửi gcode)'
        },
        target: {
          type: 'STRING',
          description: 'Dành cho set_temp: "nozzle" (đầu phun) hoặc "bed" (bàn in)'
        },
        value: {
          type: 'INTEGER',
          description: 'Giá trị nhiệt độ (°C) hoặc trạng thái'
        },
        state: {
          type: 'BOOLEAN',
          description: 'Trạng thái bật/tắt (cho set_light)'
        },
        gcode: {
          type: 'STRING',
          description: 'Dòng mã G-code cần gửi'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'manage_reminders',
    description: 'Quản lý lịch nhắc nhở và hẹn giờ cho anh Tiến trên hệ thống và Zalo: tạo lịch nhắc mới (create), xóa lịch nhắc (delete theo từ khóa/tên việc/mã lịch hoặc xóa tất cả), xem danh sách lịch hẹn (list). BẮT BUỘC phải gọi tool này khi anh Tiến bảo tạo lịch nhắc, hẹn giờ, báo thức hoặc yêu cầu xóa, bỏ, hủy lịch nhắc!',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Hành động: "create" (tạo lịch nhắc mới), "delete" (xóa lịch nhắc theo tên/từ khóa hoặc "all"), "clear_all" (xóa toàn bộ mọi lịch nhắc), "list" (xem danh sách lịch nhắc hiện có)'
        },
        title: {
          type: 'STRING',
          description: 'Nội dung nhắc nhở khi tạo (VD: "Uống nước", "Họp đồ án", "Đi ngủ") HOẶC từ khóa cần tìm để xóa (VD: "chấm công", "tắm", "họp", "all" nếu xóa tất cả)'
        },
        time: {
          type: 'STRING',
          description: 'Thời gian nhắc (dành cho create), ví dụ: "08:00", "17:30", "19:00", "20:30"'
        },
        repeat: {
          type: 'STRING',
          description: 'Tần suất (dành cho create): "daily" (lặp lại mỗi ngày/hàng ngày) hoặc "once" (nhắc một lần)'
        },
        reminderId: {
          type: 'STRING',
          description: 'Mã lịch nhắc cụ thể nếu có (dành cho delete)'
        }
      },
      required: ['action']
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

    case 'get_bambu_3d_printer_status': {
      try {
        const res = await pcBridge.executeCommand('bambu_status');
        if (!res || !res.status) {
          return { error: res?.message || 'Không lấy được thông tin máy in.' };
        }
        const st = res.status;
        const stateStr = st.gcode_state === 'RUNNING' ? 'Đang in' : (st.gcode_state === 'PAUSE' ? 'Tạm dừng' : (st.gcode_state === 'PREPARE' ? 'Đang chuẩn bị / Gia nhiệt' : (st.gcode_state === 'IDLE' ? 'Sẵn sàng (Nghỉ)' : st.gcode_state)));
        return {
          success: true,
          status: st,
          summary: `Máy in Bambu Lab A1 mini đang ở trạng thái: ${stateStr}. Tiến độ: ${st.mc_percent}% (lớp ${st.layer_num}/${st.total_layer_num}), Tệp in: ${st.subtask_name || 'Không có'}, Nhiệt độ đầu phun: ${st.nozzle_temper}°C (mục tiêu ${st.nozzle_target_temper}°C), Nhiệt độ bàn in: ${st.bed_temper}°C (mục tiêu ${st.bed_target_temper}°C), Thời gian còn lại: ~${st.mc_remaining_time} phút, Tín hiệu Wi-Fi: ${st.wifi_signal}.`
        };
      } catch (err) {
        return { error: `Lỗi đọc trạng thái máy in: ${err.message}` };
      }
    }

    case 'control_bambu_3d_printer': {
      try {
        const act = args.action;
        const res = await pcBridge.executeCommand('bambu_action', { action: act, ...args });
        return {
          success: res.success !== false,
          action: act,
          result: res,
          message: res.message || `Đã gửi lệnh ${act} tới máy in 3D Bambu Lab A1 mini.`
        };
      } catch (err) {
        return { error: `Lỗi điều khiển máy in: ${err.message}` };
      }
    }

    case 'manage_reminders': {
      try {
        const action = args.action;
        const scheduler = (await import('../services/scheduler.js')).default;

        if (action === 'clear_all' || (action === 'delete' && (!args.title || /^(?:all|tatca|toanbo|tất\s*cả|toàn\s*bộ|hết)$/i.test(args.title.trim())))) {
          const res = await scheduler.clearAll();
          return {
            success: true,
            action: 'clear_all',
            message: `Đã dọn sạch toàn bộ ${res.removedCount} lịch nhắc nhở trên cả hệ thống và Zalo.`,
            ...res
          };
        }

        if (action === 'delete') {
          const query = args.reminderId || args.title || '';
          const res = await scheduler.removeMatchingReminders(query);
          return {
            success: true,
            action: 'delete',
            query,
            removedCount: res.removedCount,
            removedTitles: res.removedTitles,
            message: res.removedCount > 0
              ? `Đã xóa thành công ${res.removedCount} lịch nhắc liên quan đến "${query}" trên cả hệ thống và Zalo.`
              : `Hiện tại không có lịch nhắc nào khớp với "${query}" trên hệ thống và Zalo.`
          };
        }

        if (action === 'create') {
          const title = args.title || 'Nhắc việc';
          const time = args.time || '08:00';
          const [h, m] = time.split(':').map(Number);
          const type = (args.repeat === 'daily' || args.repeat === 'hangngay' || args.repeat === 'moingay') ? 'daily' : 'once';

          const created = await scheduler.addReminders({
            title,
            type,
            times: [{ hour: isNaN(h) ? 8 : h, minute: isNaN(m) ? 0 : m }]
          });

          return {
            success: true,
            action: 'create',
            title,
            time,
            type,
            createdList: created,
            message: `Đã cài lịch nhắc nhở "${title}" lúc ${time} (${type === 'daily' ? 'mỗi ngày' : 'hôm nay'}) và đồng bộ trực tiếp lên Zalo thành công!`
          };
        }

        if (action === 'list') {
          const listText = await scheduler.formatRemindersList();
          return {
            success: true,
            action: 'list',
            text: listText
          };
        }

        return { error: `Hành động ${action} không hợp lệ.` };
      } catch (err) {
        return { error: `Lỗi xử lý lịch nhắc: ${err.message}` };
      }
    }

    default:
      return { error: `Không tìm thấy tool mang tên: ${toolName}` };
  }
}
