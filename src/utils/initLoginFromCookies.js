// utils/initLoginFromCookies.js
// Đăng nhập lại các tài khoản Zalo từ file cookie đã lưu trong data/cookies/
import fs from 'fs';
import { loginZaloAccount, zaloAccounts } from '../api/zalo/zalo.js';

export async function initLoginFromCookies() {
    const cookiesDir = './data/cookies';
    if (fs.existsSync(cookiesDir)) {
        try {
            const cookieFiles = fs.readdirSync(cookiesDir);
            if (zaloAccounts.length < cookieFiles.length) {
                console.log('Số lượng tài khoản Zalo nhỏ hơn số lượng cookie files. Đang đăng nhập lại từ cookie...');

                for (const file of cookieFiles) {
                    if (file.startsWith('cred_') && file.endsWith('.json')) {
                        const ownId = file.substring(5, file.length - 5);
                        try {
                            const cookiePath = `${cookiesDir}/${file}`;
                            if (fs.existsSync(cookiePath)) {
                                const cookie = JSON.parse(fs.readFileSync(cookiePath, "utf-8"));
                                try {
                                    await loginZaloAccount(null, cookie);
                                    console.log(`Đã đăng nhập lại tài khoản ${ownId} từ cookie.`);
                                } catch (loginError) {
                                    console.error(`Lỗi khi đăng nhập lại tài khoản ${ownId} từ cookie:`, loginError);
                                }
                            } else {
                                console.log(`Không tìm thấy file cookie: ${cookiePath}`);
                            }
                        } catch (error) {
                            console.error(`Lỗi khi đọc/xử lý cookie cho tài khoản ${ownId}:`, error);
                        }
                    }
                }
            }
        } catch (dirError) {
            console.error(`Lỗi khi đọc thư mục cookies:`, dirError);
        }
    } else {
        console.log(`Thư mục cookies không tồn tại: ${cookiesDir}`);
        fs.mkdirSync(cookiesDir, { recursive: true });
    }
}
