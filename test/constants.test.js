// test/constants.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    RELOGIN_COOLDOWN,
    MAX_RETRY_ATTEMPTS,
    HEALTH_CHECK_INTERVAL,
    RETRY_RESET_TIME,
    SESSION_MAX_AGE,
    HASH_ITERATIONS,
    HASH_KEY_LENGTH,
    HASH_DIGEST,
} from '../src/config/constants.js';

test('RELOGIN_COOLDOWN giu nguyen 5 phut', () => {
    assert.equal(RELOGIN_COOLDOWN, 5 * 60 * 1000);
});

test('MAX_RETRY_ATTEMPTS = 5', () => {
    assert.equal(MAX_RETRY_ATTEMPTS, 5);
});

test('HEALTH_CHECK_INTERVAL = 2 phut', () => {
    assert.equal(HEALTH_CHECK_INTERVAL, 2 * 60 * 1000);
});

test('RETRY_RESET_TIME = 30 phut', () => {
    assert.equal(RETRY_RESET_TIME, 30 * 60 * 1000);
});

test('SESSION_MAX_AGE = 24 gio', () => {
    assert.equal(SESSION_MAX_AGE, 24 * 60 * 60 * 1000);
});

test('PBKDF2 iter = 1000 (giong ban goc)', () => {
  assert.equal(HASH_ITERATIONS, 1000);
  assert.equal(HASH_KEY_LENGTH, 64);
  assert.equal(HASH_DIGEST, 'sha512');
});
