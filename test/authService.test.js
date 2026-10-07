// test/authService.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Dat DATA_PATH sang temp dir TRUOC khi import authService
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-auth-test-'));
process.env.DATA_PATH = tmpDir;
process.env.ADMIN_DEFAULT_PASSWORD = 'admin';

const {
  validateUser,
  changePassword,
  addUser,
  getAllUsers,
} = await import('../src/services/authService.js');

const usersFile = path.join(tmpDir, 'cookies', 'users.json');

before(() => {
  getAllUsers();
  assert.ok(fs.existsSync(usersFile), `users.json phai ton tai o ${usersFile}`);
});

test('login admin/admin thanh cong voi mat khau mac dinh tu env', () => {
  const user = validateUser('admin', 'admin');
  assert.ok(user, 'validateUser phai tra ve user');
  assert.equal(user.username, 'admin');
  assert.equal(user.role, 'admin');
});

test('login sai mat khau tra ve null', () => {
  assert.equal(validateUser('admin', 'sai-mat-khau'), null);
});

test('changePassword chay dung va khong sot file .tmp', () => {
  const ok = changePassword('admin', 'admin', 'matkhaumoi');
  assert.ok(ok, 'changePassword phai tra ve true');

  // Khong con file .tmp
  const leftovers = fs.readdirSync(path.dirname(usersFile)).filter(f => f.endsWith('.tmp'));
  assert.equal(leftovers.length, 0, `khong duoc sot file .tmp: ${leftovers}`);

  // Login bang mat khau moi thanh cong
  const user = validateUser('admin', 'matkhaumoi');
  assert.ok(user, 'validateUser voi mat khau moi phai thanh cong');

  // Login bang mat khau cu that bai
  assert.equal(validateUser('admin', 'admin'), null);
});

test('users.json hong syntax thi backup va khoi dong lai duoc', () => {
  // Pha hong file
  fs.writeFileSync(usersFile, '{khong-phai-json-hop-le,,,');

  // Goi validateUser -> phai backup va tra ve null (khong crash)
  const result = validateUser('admin', 'matkhaumoi');
  assert.equal(result, null);

  // Phai co file .backup-
  const dir = path.dirname(usersFile);
  const backups = fs.readdirSync(dir).filter(f => f.includes('.backup-'));
  assert.ok(backups.length > 0, `phai co file .backup-, thay: ${fs.readdirSync(dir)}`);

  // File users.json van phai ton tai (khong bi xoa phim)
  assert.ok(fs.existsSync(usersFile), 'users.json van phai ton tai');
});

test('addUser + getAllUsers', () => {
  const added = addUser('tester', 'pass123', 'user');
  assert.ok(added, 'addUser phai tra ve true');
  const all = getAllUsers();
  assert.ok(all.some(u => u.username === 'tester'));
});

test('khong con log mat khau trong source', async () => {
  const fs2 = await import('node:fs');
  const path2 = await import('node:path');
  const src = fs2.readFileSync(
    new URL('../src/services/authService.js', import.meta.url),
    'utf8'
  );
  assert.ok(!src.includes('Password: '), 'khong duoc log "Password: "');
  assert.ok(!src.includes('Full generated hash'), 'khong duoc log "Full generated hash"');
  assert.ok(!src.includes('Full user'), 'khong duoc log "Full user"');
});

test('migration: hash cu 1000 iterations duoc rehash tu dong khi login', async () => {
    // Tao user "legacy" voi hash tao tu 1000 iterations
    const crypto = (await import('node:crypto')).default;
    const salt = crypto.randomBytes(16).toString('hex');
    const oldHash = crypto.pbkdf2Sync('pass123', salt, 1000, 64, 'sha512').toString('hex');

    const usersRaw = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    usersRaw.push({ username: 'legacy', salt, hash: oldHash, role: 'user' });
    fs.writeFileSync(usersFile, JSON.stringify(usersRaw, null, 2));

    // Login bang pass123 -> phai thanh cong va rehash
    const user = validateUser('legacy', 'pass123');
    assert.ok(user, 'validateUser phai thanh cong cho legacy user');

    // Kiem tra hash trong file da duoc cap nhat len 210000
    const updated = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const legacyUser = updated.find(u => u.username === 'legacy');
    const expectedNewHash = crypto.pbkdf2Sync('pass123', salt, 210000, 64, 'sha512').toString('hex');
    assert.equal(legacyUser.hash, expectedNewHash, 'hash phai duoc rehash len 210000');

    // Login lai thi dung truc tiep hash moi, khong can migration
    const user2 = validateUser('legacy', 'pass123');
    assert.ok(user2, 'validateUser lan 2 phai thanh cong');
});
