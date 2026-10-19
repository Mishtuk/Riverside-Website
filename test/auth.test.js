// node --test: staff sign-in (session cookie, single-use link tokens, rate limit, Origin check) and the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allow, allowList, consumeToken, cookieHeader, issueToken, readCookie, sameOrigin, signSession, verifySession, COOKIE } from '../src/auth.js';
import { openDb, getState, setState, backup } from '../src/db.js';

const SECRET = 'test-secret';
const ADMINS = allowList(' Office@Example.org, pastor@example.org ,');
const NOW = Date.parse('2026-10-18T15:00:00Z');

test('allow-list is trimmed and lowercased', () => {
  assert.deepEqual([...ADMINS], ['office@example.org', 'pastor@example.org']);
});

test('session cookie: valid, expired, forged, tampered, removed admin', () => {
  const v = signSession('office@example.org', NOW + 7 * 864e5, SECRET);
  assert.equal(verifySession(v, SECRET, ADMINS, NOW), 'office@example.org');
  assert.equal(verifySession(v, SECRET, ADMINS, NOW + 8 * 864e5), null, 'expired after 7 days');
  assert.equal(verifySession(v, 'other-secret', ADMINS, NOW), null, 'signed with another secret');
  const [, sig] = v.split('.');
  const longer = Buffer.from(`office@example.org.${NOW + 365 * 864e5}`).toString('base64url');
  assert.equal(verifySession(`${longer}.${sig}`, SECRET, ADMINS, NOW), null, 'cannot extend the expiry');
  const other = Buffer.from(`pastor@example.org.${NOW + 864e5}`).toString('base64url');
  assert.equal(verifySession(`${other}.${sig}`, SECRET, ADMINS, NOW), null, 'cannot swap the email');
  assert.equal(verifySession(v, SECRET, allowList('pastor@example.org'), NOW), null, 'taken off the list = signed out');
  for (const junk of [undefined, '', 'abc', 'a.b.c', '.', `${v}x`]) assert.equal(verifySession(junk, SECRET, ADMINS, NOW), null);
});

test('cookie header and parsing', () => {
  const h = cookieHeader('abc.def', { secure: true });
  assert.match(h, /^rs_admin=abc\.def; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/);
  assert.doesNotMatch(cookieHeader('x', { secure: false }), /Secure/);
  assert.match(cookieHeader('', { secure: true, maxAge: 0 }), /Max-Age=0/);
  assert.equal(readCookie(`a=1; ${COOKIE}=abc.def; b=2`), 'abc.def');
  assert.equal(readCookie('a=1'), null);
  assert.equal(readCookie(null), null);
});

test('sign-in link: works once, expires after 15 minutes, stored only as a hash', () => {
  const db = openDb(':memory:');
  const raw = issueToken(db, 'office@example.org', NOW);
  assert.equal(Buffer.from(raw, 'base64url').length, 32);
  const row = db.prepare('SELECT hash FROM login_tokens').get();
  assert.notEqual(row.hash, raw);
  assert.equal(consumeToken(db, raw, NOW + 60e3), 'office@example.org');
  assert.equal(consumeToken(db, raw, NOW + 61e3), null, 'single use');
  const late = issueToken(db, 'office@example.org', NOW);
  assert.equal(consumeToken(db, late, NOW + 15 * 60e3 + 1), null, 'expired');
  assert.equal(consumeToken(db, 'made-up-token', NOW), null);
  assert.equal(consumeToken(db, undefined, NOW), null);
  db.close();
});

test('rate limit: per key per hour', () => {
  const key = `email:test-${Math.random()}`;
  for (let i = 0; i < 5; i++) assert.ok(allow(key, 5, NOW + i));
  assert.ok(!allow(key, 5, NOW + 10));
  assert.ok(allow(key, 5, NOW + 3600e3 + 10), 'an hour later it works again');
});

test('Origin check: only our own origin may write', () => {
  const req = (origin) => new Request('https://www.example.org/api/admin/live', { method: 'PUT', headers: origin ? { origin } : {} });
  assert.ok(sameOrigin(req('https://www.example.org'), 'https://www.example.org'));
  assert.ok(!sameOrigin(req('https://evil.example'), 'https://www.example.org'));
  assert.ok(!sameOrigin(req('http://www.example.org'), 'https://www.example.org'));
  assert.ok(!sameOrigin(req(null), 'https://www.example.org'), 'a missing Origin is refused');
});

test('database: state round trip and a 7-day backup rotation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs-db-'));
  const db = openDb(dir);
  assert.deepEqual(getState(db), {});
  setState(db, { alerts: [{ id: 'a' }] });
  setState(db, { alerts: [{ id: 'b' }] });
  assert.deepEqual(getState(db), { alerts: [{ id: 'b' }] });
  for (let d = 1; d <= 9; d++) backup(db, dir, new Date(Date.UTC(2026, 9, d, 3)));
  const files = readdirSync(join(dir, 'backup'));
  assert.equal(files.length, 7);
  assert.equal(files.sort()[0], 'riverside-2026-10-03.db');
  backup(db, dir, new Date(Date.UTC(2026, 9, 9, 20))); // same day again: no new copy
  assert.equal(readdirSync(join(dir, 'backup')).length, 7);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('passwords: scrypt with a per-user salt, wrong password and unknown user fail', async () => {
  const { hashPassword, verifyPassword, checkLogin, seedStaff, addStaff } = await import('../src/auth.js');
  const a = hashPassword('correct horse battery');
  const b = hashPassword('correct horse battery');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash, 'same password, different hash');
  assert.ok(verifyPassword('correct horse battery', a.salt, a.hash));
  assert.ok(!verifyPassword('correct horse batterY', a.salt, a.hash));
  const db = openDb(':memory:');
  assert.ok(seedStaff(db));
  assert.ok(!seedStaff(db), 'seeds only once');
  assert.equal(checkLogin(db, 'admin', 'admin')?.username, 'admin');
  assert.equal(checkLogin(db, 'ADMIN ', 'admin')?.username, 'admin', 'usernames are not case-sensitive');
  assert.equal(checkLogin(db, 'admin', 'wrong'), null);
  assert.equal(checkLogin(db, 'nobody', 'admin'), null);
  assert.equal(addStaff(db, 'office', 'short').error, 'too_short');
  assert.equal(addStaff(db, 'office', 'office').error, 'too_short');
  assert.equal(addStaff(db, 'Bad Name!', 'a long enough password').error, 'username');
  assert.equal(addStaff(db, 'office', 'a long enough password').value, 'office');
  assert.equal(addStaff(db, 'office', 'a long enough password').error, 'taken');
  db.close();
});

test('forced change: admin/admin only reaches "choose a new password", in both modes', async () => {
  const { checkLogin, defaultInUse, needsChange, seedStaff, setPassword, MUST_CHANGE_ROUTES } = await import('../src/auth.js');
  const db = openDb(':memory:');
  seedStaff(db);
  const admin = checkLogin(db, 'admin', 'admin');
  assert.ok(needsChange(admin, false), 'production default: must change first');
  assert.ok(!needsChange(admin, true), 'ALLOW_DEFAULT_ADMIN=1: no forced change');
  assert.ok(defaultInUse(db), 'the warning bar shows in both modes');
  assert.ok(MUST_CHANGE_ROUTES.has('/api/admin/password'));
  for (const p of ['/api/admin/state', '/api/admin/alerts', '/api/admin/staff', '/api/admin/email/send']) assert.ok(!MUST_CHANGE_ROUTES.has(p), p);
  assert.equal(setPassword(db, 'admin', 'admin').error, 'too_short');
  assert.equal(setPassword(db, 'admin', 'Admin          ').error, 'too_easy');
  assert.equal(setPassword(db, 'admin', 'a new long password').value, 'admin');
  assert.equal(checkLogin(db, 'admin', 'admin'), null, 'the old password no longer works');
  const now = checkLogin(db, 'admin', 'a new long password');
  assert.ok(!needsChange(now, false) && !needsChange(now, true));
  assert.ok(!defaultInUse(db), 'warning gone');
  db.close();
});

test('a temporary password set by someone else must be changed even with ALLOW_DEFAULT_ADMIN=1', async () => {
  const { addStaff, checkLogin, needsChange } = await import('../src/auth.js');
  const db = openDb(':memory:');
  addStaff(db, 'office', 'temporary password 1');
  assert.ok(needsChange(checkLogin(db, 'office', 'temporary password 1'), true));
  db.close();
});

test('lockout: 5 failures lock an IP or a username for 15 minutes', async () => {
  const { locked, recordFailure, clearFailures, LOCK } = await import('../src/auth.js');
  const key = `user:test-${Math.random()}`;
  for (let i = 0; i < LOCK.max - 1; i++) recordFailure(key, NOW + i);
  assert.ok(!locked(key, NOW + 10), 'four failures: still allowed');
  recordFailure(key, NOW + 20);
  assert.ok(locked(key, NOW + 21), 'fifth failure: locked');
  assert.ok(locked(key, NOW + 20 + LOCK.ms - 1));
  assert.ok(!locked(key, NOW + 20 + LOCK.ms + 1), 'unlocked after 15 minutes');
  recordFailure(key, NOW + 40 + LOCK.ms);
  assert.ok(!locked(key, NOW + 41 + LOCK.ms), 'the count starts again');
  clearFailures(key);
});

test('accounts: never remove the last one, or your own', async () => {
  const { addStaff, removeStaff, seedStaff } = await import('../src/auth.js');
  const db = openDb(':memory:');
  seedStaff(db);
  assert.equal(removeStaff(db, 'admin', 'office@example.org').error, 'last', 'signed in by email link, still the last account');
  addStaff(db, 'office', 'a long enough password');
  assert.equal(removeStaff(db, 'admin', 'admin').error, 'self');
  assert.equal(removeStaff(db, 'admin', 'office').value, 'admin');
  assert.equal(removeStaff(db, 'office', 'someone@example.org').error, 'last');
  assert.equal(removeStaff(db, 'ghost', 'office').error, 'not_found');
  db.close();
});

test('logins are logged, newest first', async () => {
  const { logLogin, recentLogins } = await import('../src/auth.js');
  const db = openDb(':memory:');
  for (let i = 0; i < 12; i++) logLogin(db, `u${i}`, '203.0.113.9', 'password', NOW + i);
  const last = recentLogins(db, 10);
  assert.equal(last.length, 10);
  assert.equal(last[0].who, 'u11');
  db.close();
});

test('client IP: the last X-Forwarded-For entry, without a port', async () => {
  const { clientIp } = await import('../src/auth.js');
  const req = (xff) => new Request('https://x.org/', { headers: xff ? { 'x-forwarded-for': xff } : {} });
  assert.equal(clientIp(req('1.1.1.1, 203.0.113.9:51234')), '203.0.113.9', 'a client-sent first entry is ignored');
  assert.equal(clientIp(req('[2001:db8::1]:443')), '2001:db8::1');
  assert.equal(clientIp(req(null)), 'local');
});
