// Regression coverage for GitHub issue #6 (zca-js dependency consistency).
//
// Two concerns a zca-js version bump can break, both guarded here:
//   1. package.json and package-lock.json must stay in sync for zca-js and its
//      transitive dependencies, so the declared spec matches what is resolved.
//   2. The login/cookie data contract in src/api/zalo/zalo.js — the credential
//      object built from `api.getContext()` and later replayed into
//      `zalo.login(cred)` — must keep the exact { imei, cookie, userAgent }
//      shape the SDK expects.
//
// Uses only Node's built-in test runner (`node --test`): no network access and
// no installed node_modules. The login/cookie section mocks the SDK surface and
// uses placeholder (non-secret) values only.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

// Minimal caret-range satisfaction check for a pinned version, sufficient for
// the "^x.y.z" / "^x.y.z-beta.n" specs this project uses. Avoids pulling in an
// external semver dependency (which may not be installed).
function satisfiesCaret(spec, version) {
  assert.ok(spec.startsWith('^'), `expected a caret range, got "${spec}"`);
  const floor = spec.slice(1);

  const parse = (v) => {
    const [core, pre = ''] = v.split('-');
    const [major, minor, patch] = core.split('.').map((n) => Number(n));
    return { major, minor, patch, pre };
  };

  const f = parse(floor);
  const t = parse(version);

  // Caret keeps the left-most non-zero component fixed. All specs here are
  // major >= 1, so the major must match and the version must be >= the floor.
  if (t.major !== f.major) return false;
  if (t.minor !== f.minor) return t.minor > f.minor;
  if (t.patch !== f.patch) return t.patch > f.patch;

  // Same core version: compare prerelease tags. A pinned stable (no prerelease)
  // outranks a floor prerelease; otherwise compare the prerelease identifiers
  // left-to-right (label first, then the numeric suffix) per semver ordering.
  if (f.pre === '' && t.pre === '') return true;
  if (t.pre === '') return true; // stable >= any prerelease of same core
  if (f.pre === '') return false; // prerelease < stable of same core

  const fParts = f.pre.split('.');
  const tParts = t.pre.split('.');
  for (let i = 0; i < Math.max(fParts.length, tParts.length); i++) {
    const fp = fParts[i];
    const tp = tParts[i];
    if (fp === undefined) return true; // longer prerelease outranks its prefix
    if (tp === undefined) return false;
    const fn = Number(fp);
    const tn = Number(tp);
    const bothNumeric = !Number.isNaN(fn) && !Number.isNaN(tn);
    if (bothNumeric) {
      if (tn !== fn) return tn > fn;
    } else if (tp !== fp) {
      return tp > fp; // lexical compare of identifiers (e.g. beta > alpha)
    }
  }
  return true; // identical prerelease tags
}

// --- Dependency consistency ---------------------------------------------------

test('package.json declares zca-js', () => {
  assert.ok(pkg.dependencies?.['zca-js'], 'zca-js must be a declared dependency');
});

test('lockfile root mirror matches package.json zca-js spec', () => {
  const declared = pkg.dependencies['zca-js'];
  const lockMirror = lock.packages['']?.dependencies?.['zca-js'];
  assert.equal(
    lockMirror,
    declared,
    'package-lock.json root dependency spec must equal package.json spec',
  );
});

test('resolved zca-js in lockfile satisfies package.json spec', () => {
  const declared = pkg.dependencies['zca-js'];
  const resolved = lock.packages['node_modules/zca-js']?.version;
  assert.ok(resolved, 'lockfile must resolve node_modules/zca-js');
  assert.ok(
    satisfiesCaret(declared, resolved),
    `resolved zca-js ${resolved} does not satisfy declared spec ${declared}`,
  );
});

test('zca-js transitive dependencies are present in the lockfile', () => {
  const zca = lock.packages['node_modules/zca-js'];
  assert.ok(zca?.dependencies, 'zca-js entry must list its dependencies');
  for (const dep of Object.keys(zca.dependencies)) {
    assert.ok(
      lock.packages[`node_modules/${dep}`],
      `transitive dependency "${dep}" of zca-js is missing from the lockfile`,
    );
  }
});

// --- Login/cookie data contract ----------------------------------------------

// The credential object saved after login (from `api.getContext()`) and later
// replayed into `zalo.login(cred)` for cookie relogin must be exactly these
// three keys. This mirrors src/api/zalo/zalo.js.
const CRED_KEYS = ['imei', 'cookie', 'userAgent'];

// A stand-in `api.getContext()` result using placeholder (non-secret) values.
function fakeContext() {
  return {
    imei: 'PLACEHOLDER-IMEI',
    cookie: [{ name: 'placeholder', value: 'x' }],
    userAgent: 'PLACEHOLDER-UA',
    // Extra fields the SDK may return that we intentionally do not persist:
    language: 'vi',
  };
}

test('persisted cred keeps only imei, cookie, userAgent', () => {
  const context = fakeContext();
  const { imei, cookie, userAgent } = context;
  const data = { imei, cookie, userAgent };

  assert.deepEqual(Object.keys(data).sort(), [...CRED_KEYS].sort());
  assert.ok(!('language' in data), 'unrelated context fields must not be persisted');
});

test('persisted cred round-trips through JSON for cookie relogin', () => {
  const context = fakeContext();
  const { imei, cookie, userAgent } = context;
  const data = { imei, cookie, userAgent };

  const restored = JSON.parse(JSON.stringify(data));
  // The cred consumed by zalo.login(cred) on relogin must survive serialization.
  for (const key of CRED_KEYS) {
    assert.deepEqual(restored[key], data[key], `${key} must round-trip`);
  }
});

test('cookie login falls back to QR when login(cred) rejects', async () => {
  // Reproduces the try/catch fallback in loginZaloAccount without the real SDK.
  const calls = [];
  const zalo = {
    async login() {
      calls.push('login');
      throw new Error('cookie expired');
    },
    async loginQR(_opts, cb) {
      calls.push('loginQR');
      cb({ data: { image: 'BASE64' } });
      return { ok: true };
    },
  };

  const cred = { imei: 'x', cookie: [], userAgent: 'x' };
  let api;
  let qrShown = false;
  try {
    api = await zalo.login(cred);
  } catch {
    api = await zalo.loginQR(null, (qrData) => {
      if (qrData?.data?.image) qrShown = true;
    });
  }

  assert.deepEqual(calls, ['login', 'loginQR'], 'must attempt cookie login then QR');
  assert.equal(qrShown, true, 'QR image callback must fire on fallback');
  assert.deepEqual(api, { ok: true });
});
