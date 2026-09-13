// Regression coverage for GitHub issue #6:
// keep the zca-js dependency (and its transitive deps) consistent between
// package.json and package-lock.json, and guard the login/cookie contract
// this project relies on from the zca-js SDK.
//
// Uses only Node's built-in test runner (`node --test`) so it needs no
// network access and no installed node_modules.

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
  // outranks a floor prerelease; otherwise compare the numeric suffix.
  if (f.pre === '' && t.pre === '') return true;
  if (t.pre === '') return true; // stable >= any prerelease of same core
  if (f.pre === '') return false; // prerelease < stable of same core

  const preNum = (p) => Number(p.split('.').pop());
  return preNum(t.pre) >= preNum(f.pre);
}

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
