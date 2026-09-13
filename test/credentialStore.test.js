// test/credentialStore.test.js
//
// Regression tests cho issue #7: sau khi cookie cũ hết hạn và người dùng đăng
// nhập lại bằng QR, credential mới phải ĐƯỢC GHI ĐÈ lên file cũ để lần khởi
// động sau khôi phục được mà không cần quét QR lại.
//
// Chỉ dùng dữ liệu giả (synthetic placeholders), không có secret thật, không
// gọi mạng và không đụng tới SDK Zalo thật.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
    saveCredentials,
    loadCredentials,
    credentialPath,
} from '../src/utils/credentialStore.js';

// Credential giả — KHÔNG phải giá trị thật.
const STALE_CRED = { imei: 'imei-STALE', cookie: [{ name: 'x', value: 'stale' }], userAgent: 'UA-STALE' };
const FRESH_CRED = { imei: 'imei-FRESH', cookie: [{ name: 'x', value: 'fresh' }], userAgent: 'UA-FRESH' };
const OWN_ID = 'account-0001';

async function tmpCookiesDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'multiz-cred-'));
}

test('saveCredentials ghi credential mới khi chưa có file', async () => {
    const dir = await tmpCookiesDir();
    try {
        await saveCredentials(OWN_ID, FRESH_CRED, dir);
        const loaded = await loadCredentials(OWN_ID, dir);
        assert.deepEqual(loaded, FRESH_CRED);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('saveCredentials LUÔN ghi đè credential cũ (bản sửa issue #7)', async () => {
    const dir = await tmpCookiesDir();
    try {
        // File credential cũ (hỏng) đã tồn tại từ trước.
        await saveCredentials(OWN_ID, STALE_CRED, dir);
        assert.deepEqual(await loadCredentials(OWN_ID, dir), STALE_CRED);

        // Sau khi đăng nhập lại bằng QR, ghi credential mới lên trên.
        await saveCredentials(OWN_ID, FRESH_CRED, dir);

        const loaded = await loadCredentials(OWN_ID, dir);
        assert.deepEqual(loaded, FRESH_CRED, 'credential mới phải thay thế credential cũ');
        assert.notDeepEqual(loaded, STALE_CRED);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('ghi là nguyên tử: không để lại file .tmp', async () => {
    const dir = await tmpCookiesDir();
    try {
        await saveCredentials(OWN_ID, FRESH_CRED, dir);
        const files = await fs.readdir(dir);
        assert.equal(files.filter(f => f.endsWith('.tmp')).length, 0, 'không được còn file tạm sót lại');
        assert.ok(files.includes(`cred_${OWN_ID}.json`));
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('saveCredentials báo lỗi khi thư mục đích không thể tạo', async () => {
    const dir = await tmpCookiesDir();
    try {
        // Tạo một file trùng tên với thư mục con -> mkdir sẽ thất bại.
        const badParent = path.join(dir, 'blocker');
        await fs.writeFile(badParent, 'not a dir');
        const nestedDir = path.join(badParent, 'cookies');

        await assert.rejects(
            () => saveCredentials(OWN_ID, FRESH_CRED, nestedDir),
            /.*/,
        );
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('loadCredentials trả về null khi không có file', async () => {
    const dir = await tmpCookiesDir();
    try {
        assert.equal(await loadCredentials('khong-ton-tai', dir), null);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('saveCredentials từ chối ownId rỗng', async () => {
    const dir = await tmpCookiesDir();
    try {
        await assert.rejects(() => saveCredentials('', FRESH_CRED, dir), /ownId/);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

// --- Kịch bản end-to-end: cookie hỏng -> QR fallback -> lưu -> khởi động lại ---
//
// Mô phỏng lại logic trong loginZaloAccount bằng một SDK Zalo giả để kiểm tra
// toàn bộ vòng đời mà không cần mạng hay SDK thật.

/**
 * SDK Zalo giả.
 * - login(cred): thành công CHỈ khi cred khớp với credential "hợp lệ" hiện tại.
 * - loginQR(): luôn thành công và trả về credential hợp lệ.
 */
class FakeZalo {
    constructor(validCred) {
        this.validCred = validCred;
        this.qrCalls = 0;
    }
    async login(cred) {
        if (JSON.stringify(cred) !== JSON.stringify(this.validCred)) {
            throw new Error('cookie không hợp lệ');
        }
        return this.validCred;
    }
    async loginQR() {
        this.qrCalls++;
        return this.validCred;
    }
}

// Bản rút gọn của phần đăng nhập + lưu credential trong loginZaloAccount.
async function loginAndPersist(zalo, ownId, cred, cookiesDir) {
    let usedQR = false;
    let effectiveCred;
    if (cred) {
        try {
            effectiveCred = await zalo.login(cred);
        } catch {
            effectiveCred = await zalo.loginQR();
            usedQR = true;
        }
    } else {
        effectiveCred = await zalo.loginQR();
        usedQR = true;
    }
    await saveCredentials(ownId, effectiveCred, cookiesDir);
    return { usedQR };
}

test('e2e: cred hỏng -> QR fallback -> lưu -> khởi động lại KHÔNG cần QR', async () => {
    const dir = await tmpCookiesDir();
    try {
        // Credential hợp lệ hiện tại của tài khoản (giá trị giả).
        const validCred = FRESH_CRED;
        const zalo = new FakeZalo(validCred);

        // Trạng thái ban đầu: file credential cũ đã hỏng nằm trên đĩa.
        await saveCredentials(OWN_ID, STALE_CRED, dir);

        // Lần đăng nhập 1: nạp cred hỏng -> login thất bại -> QR fallback -> lưu lại.
        const stored1 = await loadCredentials(OWN_ID, dir);
        const run1 = await loginAndPersist(zalo, OWN_ID, stored1, dir);
        assert.equal(run1.usedQR, true, 'lần 1 phải rơi vào QR fallback');
        assert.equal(zalo.qrCalls, 1);

        // Credential mới hợp lệ đã được ghi đè lên file cũ.
        assert.deepEqual(await loadCredentials(OWN_ID, dir), validCred);

        // Lần khởi động 2: nạp credential đã lưu -> login thành công, KHÔNG QR.
        const stored2 = await loadCredentials(OWN_ID, dir);
        const run2 = await loginAndPersist(zalo, OWN_ID, stored2, dir);
        assert.equal(run2.usedQR, false, 'lần 2 phải khôi phục được mà không cần QR');
        assert.equal(zalo.qrCalls, 1, 'không được gọi QR thêm lần nào ở lần khởi động 2');
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});
