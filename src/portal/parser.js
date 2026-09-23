import * as cheerio from 'cheerio';

/**
 * Parser xử lý bóc tách HTML từ portal trường (TDTU hoặc các trường ĐH chuẩn)
 */
export class PortalParser {
  /**
   * Parse bảng điểm từ HTML
   */
  static parseGrades(html) {
    if (!html) return [];
    const $ = cheerio.load(html);
    const grades = [];

    // Tìm kiếm trong các bảng dữ liệu chuẩn portal
    $('table tr').each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 4) {
        const code = $(cols[0]).text().trim();
        const name = $(cols[1]).text().trim();
        const credits = parseInt($(cols[2]).text().trim(), 10) || 0;
        const processScore = parseFloat($(cols[3]).text().trim()) || null;
        const midtermScore = cols.length > 4 ? parseFloat($(cols[4]).text().trim()) || null : null;
        const finalScore = cols.length > 5 ? parseFloat($(cols[5]).text().trim()) || null : null;
        const totalScore = cols.length > 6 ? parseFloat($(cols[6]).text().trim()) || null : null;
        const gradeLetter = cols.length > 7 ? $(cols[7]).text().trim() : null;

        if (code && name && !isNaN(credits)) {
          let status = 'Chưa có điểm';
          if (totalScore !== null || finalScore !== null) {
            status = 'Đã có điểm';
          } else if (processScore !== null) {
            status = 'Chưa có điểm cuối kỳ';
          }

          grades.push({
            code,
            name,
            credits,
            processScore,
            midtermScore,
            finalScore,
            totalScore,
            gradeLetter,
            status,
            updatedAt: new Date().toISOString()
          });
        }
      }
    });

    return grades;
  }

  /**
   * Parse danh sách thông báo
   */
  static parseAnnouncements(html) {
    if (!html) return [];
    const $ = cheerio.load(html);
    const news = [];

    $('.news-item, .notification-item, li.item, table tr').each((i, el) => {
      const title = $(el).find('a, .title, td:nth-child(2)').first().text().trim();
      const link = $(el).find('a').first().attr('href') || '';
      const date = $(el).find('.date, .time, td:nth-child(3)').first().text().trim();
      const dept = $(el).find('.dept, .department, td:nth-child(1)').first().text().trim();

      if (title && title.length > 5) {
        news.push({
          id: `tb-${Date.now()}-${i}`,
          department: dept || 'Phòng Đào Tạo',
          title,
          summary: title,
          publishedDate: date || new Date().toISOString().split('T')[0],
          isImportant: title.toLowerCase().includes('khẩn') || title.toLowerCase().includes('học phí'),
          url: link.startsWith('http') ? link : `https://stdportal.tdtu.edu.vn${link}`
        });
      }
    });

    return news;
  }

  /**
   * Parse danh sách đơn từ
   */
  static parseApplications(html) {
    if (!html) return [];
    const $ = cheerio.load(html);
    const applications = [];

    $('table.table-don tr, table tr').each((i, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 3) {
        const id = $(cols[0]).text().trim() || `REQ-${10000 + i}`;
        const type = $(cols[1]).text().trim();
        const status = $(cols[2]).text().trim();
        const submitDate = cols.length > 3 ? $(cols[3]).text().trim() : '';

        if (type && status) {
          applications.push({
            id,
            type,
            status,
            submitDate: submitDate || new Date().toISOString().split('T')[0],
            processedBy: 'Phòng Đào Tạo',
            note: ''
          });
        }
      }
    });

    return applications;
  }
}

export default PortalParser;
