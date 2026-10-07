// test/eventListeners.test.js
//
// Source-inspection test cho src/eventListeners.js.
// Khong import truc tiep vi eventListeners.js import server.js -> khoi dong HTTP server that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(
    new URL('../src/eventListeners.js', import.meta.url),
    'utf8'
);

test('reloginAttempts la Map<ownId, {lastTime, count}>', () => {
    assert.match(src, /reloginAttempts = new Map\(\)/);
    assert.match(src, /attemptInfo\.count/);
});

test('co reloginLocks chong race condition', () => {
    assert.match(src, /reloginLocks = new Map\(\)/);
    assert.match(src, /reloginLocks\.set\(ownId, true\)/);
    assert.match(src, /reloginLocks\.delete\(ownId\)/);
});

test('onConnected reset retry counter ve 0', () => {
    assert.match(src, /attempts\.count = 0/);
});

test('backoff tang dan va co gioi han', () => {
    assert.match(src, /Math\.min\(RELOGIN_COOLDOWN \* attemptInfo\.count, 10 \* 60 \* 1000\)/);
});

test('setupEventListeners cleanup listener va timer cu', () => {
    assert.match(src, /clearInterval\(api\._healthCheckTimer\)/);
    assert.match(src, /api\.listener\.removeAllListeners\(\)/);
});

test('co health check timer', () => {
    assert.match(src, /HEALTH_CHECK_INTERVAL/);
    assert.match(src, /setInterval\(/);
    assert.match(src, /api\._healthCheckTimer =/);
});

test('onClosed don timer truoc khi relogin', () => {
    const onClosedBlock = src.match(/onClosed\(\(\) => \{[\s\S]*?\}\);/);
    assert.ok(onClosedBlock, 'phai co onClosed handler');
    assert.match(onClosedBlock[0], /clearInterval/);
    assert.match(onClosedBlock[0], /clearTimeout/);
});

test('triggerN8nWebhook duoc await va bat loi', () => {
    assert.match(src, /await triggerN8nWebhook/);
    assert.match(src, /catch\s*\(/);
});

test('vuot MAX_RETRY_ATTEMPTS thi reset sau RETRY_RESET_TIME', () => {
    assert.match(src, /MAX_RETRY_ATTEMPTS/);
    assert.match(src, /RETRY_RESET_TIME/);
});

test('constants duoc import tu config/constants.js', () => {
    assert.match(src, /from ['"]\.\/config\/constants\.js['"]/);
});

test('khong hardcode RELOGIN_COOLDOWN trong eventListeners', () => {
    // Phai import tu constants, khong khai bao lai
    const localDecls = src.match(/const RELOGIN_COOLDOWN\s*=/g);
    assert.equal(localDecls, null, 'khong duoc hardcode RELOGIN_COOLDOWN o eventListeners.js');
});
