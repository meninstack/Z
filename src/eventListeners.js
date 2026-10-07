import { GroupEventType } from "zca-js";
import { getWebhookUrl, triggerN8nWebhook } from './utils/helpers.js';
import fs from 'fs';
import { loginZaloAccount, zaloAccounts } from './api/zalo/zalo.js';
import { broadcastMessage } from './server.js';
import {
    RELOGIN_COOLDOWN,
    MAX_RETRY_ATTEMPTS,
    HEALTH_CHECK_INTERVAL,
    RETRY_RESET_TIME
} from './config/constants.js';

// Biến để theo dõi thời gian relogin cho từng tài khoản
export const reloginAttempts = new Map();
// Lock để tránh race condition khi relogin
const reloginLocks = new Map();

export function setupEventListeners(api, loginResolve) {
    const ownId = api.getOwnId();

    // Dọn dẹp health check timer cũ
    if (api._healthCheckTimer) {
        clearInterval(api._healthCheckTimer);
        api._healthCheckTimer = null;
        console.log(`[Cleanup] Đã clear old health check timer cho ${ownId}`);
    }

    // Remove tất cả event listeners cũ
    if (api.listener) {
        api.listener.removeAllListeners();
        console.log(`[Cleanup] Đã remove all old listeners cho ${ownId}`);
    }

    // Thiết lập health check
    const healthCheckTimer = setInterval(() => {
        try {
            if (!api.listener || !api.listener.isStarted) {
                console.warn(`[Health Check] Connection không hoạt động cho tài khoản ${ownId}, đang thử reconnect...`);
                handleRelogin(api);
            } else {
                console.log(`[Health Check] Connection OK cho tài khoản ${ownId}`);
            }
        } catch (error) {
            console.error(`[Health Check] Lỗi khi kiểm tra connection cho ${ownId}:`, error);
        }
    }, HEALTH_CHECK_INTERVAL);

    api._healthCheckTimer = healthCheckTimer;

    // Lắng nghe sự kiện tin nhắn và gửi đến webhook được cấu hình cho tin nhắn
    api.listener.on("message", async (msg) => {
        const messageWebhookUrl = getWebhookUrl("messageWebhookUrl", ownId);
        if (messageWebhookUrl) {
            // Thêm ownId vào dữ liệu để webhook biết tin nhắn từ tài khoản nào
            const msgWithOwnId = { ...msg, _accountId: ownId };
            try {
                await triggerN8nWebhook(msgWithOwnId, messageWebhookUrl);
            } catch (error) {
                console.error(`[Webhook] Lỗi khi gửi message webhook:`, error);
            }
        }
    });

    // Lắng nghe sự kiện nhóm và gửi đến webhook được cấu hình cho sự kiện nhóm
    api.listener.on("group_event", async (data) => {
        const groupEventWebhookUrl = getWebhookUrl("groupEventWebhookUrl", ownId);
        if (groupEventWebhookUrl) {
            // Thêm ownId vào dữ liệu
            const dataWithOwnId = { ...data, _accountId: ownId };
            try {
                await triggerN8nWebhook(dataWithOwnId, groupEventWebhookUrl);
            } catch (error) {
                console.error(`[Webhook] Lỗi khi gửi group event webhook:`, error);
            }
        }
    });

    // Lắng nghe sự kiện reaction và gửi đến webhook được cấu hình cho reaction
    api.listener.on("reaction", async (reaction) => {
        const reactionWebhookUrl = getWebhookUrl("reactionWebhookUrl", ownId);
        console.log("Nhận reaction:", reaction);
        if (reactionWebhookUrl) {
            // Thêm ownId vào dữ liệu
            const reactionWithOwnId = { ...reaction, _accountId: ownId };
            try {
                await triggerN8nWebhook(reactionWithOwnId, reactionWebhookUrl);
            } catch (error) {
                console.error(`[Webhook] Lỗi khi gửi reaction webhook:`, error);
            }
        }
    });

    api.listener.onConnected(() => {
        console.log(`Connected account ${ownId}`);
        loginResolve('login_success');

        // Reset retry counter khi kết nối thành công
        if (reloginAttempts.has(ownId)) {
            const attempts = reloginAttempts.get(ownId);
            if (attempts && attempts.count) {
                console.log(`[Reconnect] Đã kết nối lại thành công sau ${attempts.count} lần thử`);
                attempts.count = 0;
                reloginAttempts.set(ownId, attempts);
            }
        }

        // Gửi thông báo đến tất cả client
        try {
            broadcastMessage('login_success');
        } catch (err) {
            console.error('Lỗi khi gửi thông báo WebSocket:', err);
        }
    });

    api.listener.onClosed(() => {
        console.log(`[Connection] Closed - API listener đã ngắt kết nối cho tài khoản ${ownId}`);

        // Dọn dẹp health check timer nếu có
        if (api._healthCheckTimer) {
            clearInterval(api._healthCheckTimer);
            api._healthCheckTimer = null;
        }

        // Dọn dẹp retry timeout nếu có
        if (api._retryTimeout) {
            clearTimeout(api._retryTimeout);
            api._retryTimeout = null;
        }

        handleRelogin(api);
    });

    api.listener.onError((error) => {
        console.error(`Error on account ${ownId}:`, error);
    });
}

// Hàm xử lý đăng nhập lại
async function handleRelogin(api) {
    const ownId = api.getOwnId();

    // Kiểm tra relogin lock để tránh race condition
    if (reloginLocks.get(ownId)) {
        console.log(`[Relogin] Tài khoản ${ownId} đang trong quá trình relogin, bỏ qua request mới`);
        return;
    }

    try {
        console.log("[Relogin] Đang thử đăng nhập lại...");

        if (!ownId) {
            console.error("[Relogin] Không thể xác định ownId, không thể đăng nhập lại");
            return;
        }

        reloginLocks.set(ownId, true);

        let attemptInfo = reloginAttempts.get(ownId);
        if (!attemptInfo) {
            attemptInfo = { lastTime: 0, count: 0 };
        }

        const now = Date.now();

        if (attemptInfo.lastTime && now - attemptInfo.lastTime < RELOGIN_COOLDOWN) {
            console.log(`[Relogin] Bỏ qua việc đăng nhập lại tài khoản ${ownId}, đã thử cách đây ${Math.floor((now - attemptInfo.lastTime) / 1000)} giây`);
            return;
        }

        if (attemptInfo.count >= MAX_RETRY_ATTEMPTS) {
            console.error(`[Relogin] Đã vượt quá số lần retry tối đa (${MAX_RETRY_ATTEMPTS}) cho tài khoản ${ownId}. Vui lòng kiểm tra lại.`);
            setTimeout(() => {
                const info = reloginAttempts.get(ownId);
                if (info) {
                    info.count = 0;
                    reloginAttempts.set(ownId, info);
                    console.log(`[Relogin] Đã reset retry counter cho tài khoản ${ownId}`);
                }
            }, RETRY_RESET_TIME);
            return;
        }

        attemptInfo.lastTime = now;
        attemptInfo.count += 1;
        reloginAttempts.set(ownId, attemptInfo);

        // Tìm thông tin proxy từ mảng zaloAccounts
        const accountInfo = zaloAccounts.find(acc => acc.ownId === ownId);
        const customProxy = accountInfo?.proxy || null;

        // Tìm file cookie tương ứng
        const cookiesDir = './data/cookies';
        const cookieFile = `${cookiesDir}/cred_${ownId}.json`;

        if (!fs.existsSync(cookieFile)) {
            console.error(`Không tìm thấy file cookie cho tài khoản ${ownId}`);
            return;
        }

        // Đọc cookie từ file
        const cookie = JSON.parse(fs.readFileSync(cookieFile, "utf-8"));

        // Đăng nhập lại với cookie
        console.log(`[Relogin] Đang đăng nhập lại tài khoản ${ownId} (Lần thử ${attemptInfo.count}/${MAX_RETRY_ATTEMPTS}) với proxy ${customProxy || 'không có'}...`);

        await loginZaloAccount(customProxy, cookie);
        console.log(`[Relogin] Đã gửi yêu cầu đăng nhập lại cho tài khoản ${ownId}`);

    } catch (error) {
        console.error(`[Relogin] Lỗi khi thử đăng nhập lại tài khoản ${ownId}:`, error);

        const attemptInfo = reloginAttempts.get(ownId);
        if (attemptInfo && attemptInfo.count < MAX_RETRY_ATTEMPTS) {
            const retryDelay = Math.min(RELOGIN_COOLDOWN * attemptInfo.count, 10 * 60 * 1000);
            console.log(`[Relogin] Sẽ thử lại sau ${Math.floor(retryDelay / 1000)} giây...`);

            if (api._retryTimeout) {
                clearTimeout(api._retryTimeout);
            }

            api._retryTimeout = setTimeout(() => {
                api._retryTimeout = null;
                handleRelogin(api);
            }, retryDelay);
        }
    } finally {
        reloginLocks.delete(ownId);
    }
}
