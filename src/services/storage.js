import fs from 'fs';
import path from 'path';
import config from '../config/config.js';
import { initialMockState } from '../portal/mockData.js';

class StorageService {
  constructor() {
    this.stateFilePath = config.paths.stateFile;
    this.ensureDataDir();
  }

  ensureDataDir() {
    const dir = path.dirname(this.stateFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Đọc dữ liệu snapshot trạng thái hiện tại
   */
  getState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Lỗi khi đọc file state:', err.message);
    }

    // Nếu chưa có file thì tạo với state mặc định
    const defaultState = JSON.parse(JSON.stringify(initialMockState));
    this.saveState(defaultState);
    return defaultState;
  }

  /**
   * Lưu snapshot mới
   */
  saveState(newState) {
    try {
      this.ensureDataDir();
      fs.writeFileSync(this.stateFilePath, JSON.stringify(newState, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('Lỗi khi ghi file state:', err.message);
      return false;
    }
  }

  /**
   * So sánh dữ liệu cũ và mới để phát hiện biến động (Diff Engine)
   * @param {Object} oldState 
   * @param {Object} newState 
   * @returns {Object} Danh sách các thay đổi
   */
  detectDiff(oldState, newState) {
    const changes = {
      gradeUpdates: [],
      newAnnouncements: [],
      applicationUpdates: [],
      newActivities: []
    };

    if (!oldState || !newState) return { hasChanges: false, changes };

    const getGradeKey = (g) => `${g.code}_${g.semester || g.nameTable || ''}`;

    // 1. Kiểm tra điểm thi thay đổi (dùng khóa kết hợp mã môn + học kỳ để tránh trùng môn học lại/học vượt)
    if (newState.grades && oldState.grades) {
      const oldGradesMap = new Map();
      oldState.grades.forEach(g => oldGradesMap.set(getGradeKey(g), g));

      for (const newGrade of newState.grades) {
        const key = getGradeKey(newGrade);
        const oldGrade = oldGradesMap.get(key);

        if (!oldGrade) {
          // Chỉ coi là môn mới nếu bảng điểm cũ đã có dữ liệu và môn này mới xuất hiện
          if (oldState.grades.length > 0) {
            changes.gradeUpdates.push({
              type: 'NEW_SUBJECT',
              subject: newGrade
            });
          }
        } else {
          const isStatusChanged = oldGrade.status === 'Chưa có điểm' && newGrade.status !== 'Chưa có điểm';
          const isTotalChanged = newGrade.totalScore !== null && newGrade.totalScore !== undefined && oldGrade.totalScore !== newGrade.totalScore;
          const isFinalChanged = newGrade.finalScore !== null && newGrade.finalScore !== undefined && oldGrade.finalScore !== newGrade.finalScore;
          const isMidChanged = newGrade.midtermScore !== null && newGrade.midtermScore !== undefined && oldGrade.midtermScore !== newGrade.midtermScore;
          const isProcessChanged = newGrade.processScore !== null && newGrade.processScore !== undefined && oldGrade.processScore !== newGrade.processScore;

          if (isStatusChanged || isTotalChanged || isFinalChanged || isMidChanged || isProcessChanged) {
            changes.gradeUpdates.push({
              type: 'SCORE_UPDATED',
              subject: newGrade,
              oldSubject: oldGrade
            });
          }
        }
      }
    }

    // 2. Kiểm tra thông báo mới
    if (newState.announcements && oldState.announcements) {
      const oldIds = new Set(oldState.announcements.map(a => a.id));
      for (const item of newState.announcements) {
        if (!oldIds.has(item.id)) {
          changes.newAnnouncements.push(item);
        }
      }
    }

    // 3. Kiểm tra trạng thái duyệt đơn
    if (newState.applications && oldState.applications) {
      const oldAppsMap = new Map();
      oldState.applications.forEach(a => oldAppsMap.set(a.id, a));

      for (const newApp of newState.applications) {
        const oldApp = oldAppsMap.get(newApp.id);
        if (!oldApp) {
          if (oldState.applications.length > 0) {
            changes.applicationUpdates.push({
              type: 'NEW_APPLICATION',
              application: newApp
            });
          }
        } else if (oldApp.status !== newApp.status) {
          changes.applicationUpdates.push({
            type: 'STATUS_CHANGED',
            application: newApp,
            oldStatus: oldApp.status,
            newStatus: newApp.status
          });
        }
      }
    }

    // 4. Kiểm tra hoạt động ngoại khóa mới
    if (newState.activities && oldState.activities) {
      const oldIds = new Set(oldState.activities.map(a => a.id));
      for (const act of newState.activities) {
        if (!oldIds.has(act.id)) {
          changes.newActivities.push(act);
        }
      }
    }

    const hasAnyChange = 
      changes.gradeUpdates.length > 0 ||
      changes.newAnnouncements.length > 0 ||
      changes.applicationUpdates.length > 0 ||
      changes.newActivities.length > 0;

    return { hasChanges: hasAnyChange, changes };
  }
}

export const storage = new StorageService();
export default storage;
