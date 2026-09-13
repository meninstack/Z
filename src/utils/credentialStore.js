// utils/credentialStore.js
//
// Lưu trữ credential (cookie/imei/userAgent) cho từng tài khoản Zalo.
//
// Bug được sửa ở đây (issue #7): trước đây credential chỉ được ghi khi file
// chưa tồn tại. Sau khi một cookie cũ hết hạn và người dùng đăng nhập lại bằng
// QR, credential mới KHÔNG bao giờ được ghi đè lên file cũ, nên lần khởi động
// tiếp theo lại nạp đúng cookie hỏng đó và bắt quét QR lại.
//
// Cách sửa: luôn ghi đè credential mới bằng thao tác ghi file nguyên tử
// (temp-file rồi rename) có await, xử lý lỗi ghi, và không log giá trị nhạy cảm.

import fs from 'fs/promises';
import path from 'path';

const DEFAULT_COOKIES_DIR = path.join(process.cwd(), 'data', 'cookies');

/**
 * Đường dẫn tới file credential của một tài khoản.
 * @param {string} ownId
 * @param {string} [cookiesDir]
 */
export function credentialPath(ownId, cookiesDir = DEFAULT_COOKIES_DIR) {
    return path.join(cookiesDir, `cred_${ownId}.json`);
}

/**
 * Ghi credential cho tài khoản một cách nguyên tử, LUÔN ghi đè file cũ (nếu có).
 *
 * Quy trình: ghi ra file tạm cùng thư mục rồi rename đè lên file đích. rename
 * trên cùng một filesystem là thao tác nguyên tử nên file đích không bao giờ ở
 * trạng thái ghi dở.
 *
 * KHÔNG log giá trị cookie/imei/userAgent — chỉ log ownId và trạng thái.
 *
 * @param {string} ownId
 * @param {{ imei: string, cookie: any, userAgent: string }} credential
 * @param {string} [cookiesDir]
 * @returns {Promise<string>} đường dẫn file đã ghi
 */
export async function saveCredentials(ownId, credential, cookiesDir = DEFAULT_COOKIES_DIR) {
    if (!ownId) {
        throw new Error('saveCredentials: ownId là bắt buộc');
    }
    if (!credential || typeof credential !== 'object') {
        throw new Error('saveCredentials: credential không hợp lệ');
    }

    const targetPath = credentialPath(ownId, cookiesDir);
    // File tạm nằm cùng thư mục với file đích để rename là thao tác cùng filesystem.
    // Thêm ownId + pid để tránh đụng độ giữa các lần ghi song song.
    const tempPath = `${targetPath}.${process.pid}.tmp`;

    const data = {
        imei: credential.imei,
        cookie: credential.cookie,
        userAgent: credential.userAgent,
    };
    const jsonData = JSON.stringify(data, null, 4);

    await fs.mkdir(cookiesDir, { recursive: true });

    try {
        // Ghi file tạm trước, ép flush xuống đĩa, rồi rename đè lên file đích.
        await fs.writeFile(tempPath, jsonData, { encoding: 'utf8', flag: 'w' });
        await fs.rename(tempPath, targetPath);
    } catch (error) {
        // Dọn file tạm nếu còn sót lại; không để lộ nội dung credential trong log.
        try {
            await fs.unlink(tempPath);
        } catch {
            // file tạm có thể chưa được tạo — bỏ qua.
        }
        console.error(`Lỗi khi lưu credential cho tài khoản ${ownId}:`, error.message);
        throw error;
    }

    console.log(`Đã lưu credential cho tài khoản ${ownId}`);
    return targetPath;
}

/**
 * Đọc credential đã lưu của một tài khoản. Trả về null nếu không có/không đọc được.
 * KHÔNG log nội dung credential.
 *
 * @param {string} ownId
 * @param {string} [cookiesDir]
 * @returns {Promise<{ imei: string, cookie: any, userAgent: string } | null>}
 */
export async function loadCredentials(ownId, cookiesDir = DEFAULT_COOKIES_DIR) {
    const targetPath = credentialPath(ownId, cookiesDir);
    try {
        const raw = await fs.readFile(targetPath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`Lỗi khi đọc credential cho tài khoản ${ownId}:`, error.message);
        }
        return null;
    }
}
