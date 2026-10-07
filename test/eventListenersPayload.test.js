// test/eventListenersPayload.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(
    new URL('../src/eventListeners.js', import.meta.url),
    'utf8'
);

test('webhook message import ThreadType tu zca-js', () => {
    assert.match(src, /import \{ GroupEventType, ThreadType \} from "zca-js"/);
});

test('payload webhook co _accountId', () => {
    assert.match(src, /_accountId: ownId/);
});

test('payload webhook phan loai group/personal', () => {
    assert.match(src, /msg\.type === ThreadType\.Group/);
    assert.match(src, /_isGroup: isGroupMessage/);
    assert.match(src, /_chatType: isGroupMessage \? 'group' : 'personal'/);
});

test('payload webhook phan loai messageType self/user', () => {
    assert.match(src, /_messageType: msg\.isSelf \? 'self' : 'user'/);
});

test('khong hardcode so === 1 de phan loai', () => {
    // Phan group phai dung ThreadType.Group, khong phai so cung
    const msgBlock = src.match(/api\.listener\.on\("message"[\s\S]*?\}\);/);
    assert.ok(msgBlock, 'phai co message handler');
    assert.ok(!/msg\.type === 1/.test(msgBlock[0]), 'khong duoc hardcode msg.type === 1');
});
