import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import config from '../config/config.js';

export class QRService {
  /**
   * Tạo file ảnh QR Code PNG từ chuỗi văn bản hoặc URL
   * @param {string} textToEncode 
   * @returns {Promise<{ filePath: string, fileName: string }>}
   */
  static async generateQRCodeImage(textToEncode) {
    const qrDir = path.resolve(config.paths.dataDir, 'qr');
    if (!fs.existsSync(qrDir)) {
      fs.mkdirSync(qrDir, { recursive: true });
    }

    const fileName = `qr_${Date.now()}.png`;
    const filePath = path.resolve(qrDir, fileName);

    await QRCode.toFile(filePath, textToEncode, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    });

    return { filePath, fileName };
  }

  /**
   * Tạo link ảnh mã VietQR thanh toán ngân hàng nhanh
   * @param {string} bankId Mã ngân hàng (VD: MB, VCB, TCB, ACB, TPB, VPB, ...)
   * @param {string} accountNo Số tài khoản
   * @param {number} [amount] Số tiền
   * @param {string} [description] Nội dung chuyển khoản
   */
  static generateVietQRUrl(bankId, accountNo, amount = 0, description = '') {
    const cleanBank = bankId.toUpperCase().trim();
    const cleanAcc = accountNo.trim();
    let url = `https://img.vietqr.io/image/${cleanBank}-${cleanAcc}-compact2.png`;

    const params = [];
    if (amount && Number(amount) > 0) {
      params.push(`amount=${amount}`);
    }
    if (description && description.trim()) {
      params.push(`addInfo=${encodeURIComponent(description.trim())}`);
    }

    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    return url;
  }
}

export default QRService;
