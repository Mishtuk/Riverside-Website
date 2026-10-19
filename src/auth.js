// Staff sign-in: a username + password, or a one-time emailed link; either way a signed cookie. No third-party login.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'rs_admin';
export const SESSION_DAYS = 7;
export const TOKEN_MINUTES = 15;

const b64u = (b) => Buffer.from(b).toString('base64url');
const mac = (secret, data) => createHmac('sha256', secret).update(data).digest();

/** Cookie value: base64url("name.exp.version") + "." + base64url(HMAC). exp is in ms. The version is the account's
 *  session_v: bumping it (new password, account removed) ends every session that account has, everywhere. */
export const signSession = (name, exp, secret, version = 0) => {
  const data = b64u(`${name}.${exp}.${version}`);
  return `${data}.${b64u(mac(secret, data))}`;
};

/** The signed-in email, or null if the cookie is missing, forged, expired or the address is no longer allowed. */
/** The signed-in name, or null if the cookie is missing, forged, expired, from an older session version, or the
 *  account/address is no longer allowed. `allowed`: { has(name), version?(name) }. */
export function verifySession(value, secret, allowed, now = Date.now()) {
  const [data, sig, extra] = String(value ?? '').split('.');
  if (!data || !sig || extra !== undefined) return null;
  const want = mac(secret, data);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const parts = Buffer.from(data, 'base64url').toString().split('.');
  const version = Number(parts.pop());
  const exp = Number(parts.pop());
  const name = parts.join('.');
  if (!(exp > now) || !allowed.has(name)) return null;
  return version === (allowed.version?.(name) ?? 0) ? name : null;
}

export const cookieHeader = (value, { secure, maxAge = SESSION_DAYS * 86400 }) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
export const readCookie = (header) => header?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? null;

/** ADMIN_EMAILS="a@x.org, b@y.org" -> Set of lowercased addresses. */
export const allowList = (env) => new Set(String(env ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

const sha = (s) => createHash('sha256').update(s).digest('hex');

/** New single-use link token: 32 random bytes; only its SHA-256 is stored. Returns the raw token for the link. */
export function issueToken(db, email, now = Date.now()) {
  const raw = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM login_tokens WHERE expires_at < ?').run(now - 86400e3);
  db.prepare('INSERT INTO login_tokens (hash, email, expires_at) VALUES (?, ?, ?)').run(sha(raw), email, now + TOKEN_MINUTES * 60e3);
  return raw;
}

/** Uses the token up (once, before it expires) and returns its email, else null. */
export function consumeToken(db, raw, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > 100) return null;
  const hash = sha(raw);
  const r = db.prepare('UPDATE login_tokens SET used = 1 WHERE hash = ? AND used = 0 AND expires_at > ?').run(hash, now);
  return r.changes === 1 ? db.prepare('SELECT email FROM login_tokens WHERE hash = ?').get(hash).email : null;
}

// ponytail: in-memory limiter, resets on restart; fine for one instance and a handful of staff.
const hits = new Map();
/** True if `key` has used fewer than `max` tries in the last hour (and records this try). */
export function allow(key, max, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => t > now - 3600e3);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/** Writes must come from our own pages: the browser's Origin header has to match this site's origin. */
export const sameOrigin = (req, origin) => req.headers.get('origin') === origin;

// ---------- Username + password accounts ----------
// scrypt (node:crypto) with a per-user salt. The seeded admin/admin must be changed on first sign-in, unless
// ALLOW_DEFAULT_ADMIN=1 (owner's testing period); a warning shows in the admin while any default password is in use.
const SCRYPT = { N: 16384, r: 8, p: 1 };
export const USERNAME = /^[a-z0-9._-]{3,32}$/;
export const hashPassword = (pw, salt = randomBytes(16)) => ({ salt: salt.toString('hex'), hash: scryptSync(String(pw), salt, 64, SCRYPT).toString('hex') });
export function verifyPassword(pw, salt, hash) {
  const got = scryptSync(String(pw), Buffer.from(salt, 'hex'), 64, SCRYPT);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
const DUMMY = hashPassword('no-such-account-placeholder');

/** null if acceptable, else a short reason. */
export function passwordProblem(pw, username) {
  if (typeof pw !== 'string' || pw.length < 12) return 'too_short';
  if (pw.length > 200) return 'too_long';
  const l = pw.trim().toLowerCase();
  if (l === 'admin' || l === String(username).toLowerCase()) return 'too_easy';
  return null;
}

export const staffRow = (db, username) => db.prepare('SELECT * FROM staff WHERE username = ?').get(String(username).toLowerCase());
export const staffList = (db) => db.prepare('SELECT username, must_change, default_pw, created_at, updated_at, role, areas FROM staff ORDER BY username').all();
export const defaultInUse = (db) => Boolean(db.prepare('SELECT 1 FROM staff WHERE default_pw = 1').get());

/** First boot only: one account, admin/admin, marked as the default password. */
export function seedStaff(db, now = Date.now()) {
  if (db.prepare('SELECT COUNT(*) n FROM staff').get().n) return false;
  const { salt, hash } = hashPassword('admin');
  db.prepare('INSERT INTO staff (username, salt, hash, must_change, default_pw, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)').run('admin', salt, hash, now, now);
  return true;
}

// ---------- Permissions: Admin (everything) or Limited (only the ticked areas). Checked on the server for every admin route. ----------
export const AREAS = ['alerts', 'events', 'groups', 'email', 'media', 'live', 'team', 'stats', 'staff', 'activity', 'backup'];
export const NEW_ACCOUNT_AREAS = ['alerts', 'events', 'groups'];
// First part of /api/admin/<section>/… → area. state, me and password are open to every signed-in account.
const AREA_OF = { alerts: 'alerts', recipients: 'alerts', events: 'events', groups: 'groups', email: 'email', items: 'media', thumb: 'media',
  youtube: 'media', added: 'media', audio: 'media', live: 'live', team: 'team', photo: 'team', stats: 'stats', staff: 'staff', activity: 'activity', backup: 'backup' };
const OPEN = new Set(['state', 'me', 'password']);
/** The area an admin API path belongs to; null = any signed-in account; 'admin-only' for anything not listed (fails closed). */
export function areaFor(pathname) {
  const section = String(pathname).replace(/^\/api\/admin\//, '').split('/')[0];
  return AREA_OF[section] ?? (OPEN.has(section) ? null : 'admin-only');
}
/** user: { kind, role, areas }. Emailed-link staff (ADMIN_EMAILS) are always admins. */
export const canUse = (user, area) => !area || user.kind === 'email' || user.role === 'admin' || (area !== 'admin-only' && (user.areas ?? []).includes(area));
const cleanAccess = (role, areas) => ({ role: role === 'admin' ? 'admin' : 'limited', areas: role === 'admin' ? [] : [...new Set((Array.isArray(areas) ? areas : []).filter((a) => AREAS.includes(a)))] });
export const accessOf = (row) => (row ? { role: row.role === 'limited' ? 'limited' : 'admin', areas: String(row.areas || '').split(',').filter((a) => AREAS.includes(a)) } : null);
const adminCount = (db) => db.prepare("SELECT COUNT(*) n FROM staff WHERE role = 'admin'").get().n;

/** Change an account's role and areas. There must always be at least one admin account. */
export function setAccess(db, username, role, areas, now = Date.now()) {
  const row = staffRow(db, username);
  if (!row) return { error: 'not_found' };
  const v = cleanAccess(role, areas);
  if (row.role === 'admin' && v.role !== 'admin' && adminCount(db) <= 1) return { error: 'last_admin' };
  db.prepare('UPDATE staff SET role = ?, areas = ?, updated_at = ? WHERE username = ?').run(v.role, v.areas.join(','), now, row.username);
  return { value: { username: row.username, ...v } };
}

export function addStaff(db, username, pw, now = Date.now(), access = { role: 'limited', areas: NEW_ACCOUNT_AREAS }) {
  const u = String(username ?? '').trim().toLowerCase();
  if (!USERNAME.test(u)) return { error: 'username' };
  const problem = passwordProblem(pw, u);
  if (problem) return { error: problem };
  if (staffRow(db, u)) return { error: 'taken' };
  const { salt, hash } = hashPassword(pw);
  const v = cleanAccess(access?.role, access?.areas);
  db.prepare('INSERT INTO staff (username, salt, hash, must_change, default_pw, created_at, updated_at, role, areas) VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?)').run(u, salt, hash, now, now, v.role, v.areas.join(','));
  return { value: u };
}

/** The account if username and password match, else null. Always does the same work, so timing doesn't reveal usernames. */
export function checkLogin(db, username, pw) {
  const row = staffRow(db, String(username ?? '').trim()) ?? null;
  const ok = verifyPassword(String(pw ?? ''), row?.salt ?? DUMMY.salt, row?.hash ?? DUMMY.hash);
  return row && ok ? row : null;
}

/** Another staff member sets a temporary password: the account must choose a new one at next sign-in, and every
 *  session it has ends. Never for your own account (use "Change my password"). */
export function resetPassword(db, username, temp, me, now = Date.now()) {
  const row = staffRow(db, username);
  if (!row) return { error: 'not_found' };
  if (row.username === String(me).toLowerCase()) return { error: 'self' };
  const problem = passwordProblem(temp, row.username);
  if (problem) return { error: problem };
  const { salt, hash } = hashPassword(temp);
  db.prepare('UPDATE staff SET salt = ?, hash = ?, must_change = 1, default_pw = 0, session_v = session_v + 1, updated_at = ? WHERE username = ?').run(salt, hash, now, row.username);
  return { value: row.username };
}

export function setPassword(db, username, pw, now = Date.now()) {
  const row = staffRow(db, username);
  if (!row) return { error: 'not_found' };
  const problem = passwordProblem(pw, row.username);
  if (problem) return { error: problem };
  if (verifyPassword(pw, row.salt, row.hash)) return { error: 'same' };
  const { salt, hash } = hashPassword(pw);
  // session_v + 1 signs this account out everywhere; the caller gives the person who changed it a fresh cookie.
  db.prepare('UPDATE staff SET salt = ?, hash = ?, must_change = 0, default_pw = 0, session_v = session_v + 1, updated_at = ? WHERE username = ?').run(salt, hash, now, row.username);
  return { value: row.username };
}

/** Never the last account, and not your own (someone else removes you). */
export function removeStaff(db, username, me) {
  const row = staffRow(db, username);
  if (!row) return { error: 'not_found' };
  if (row.username === String(me).toLowerCase()) return { error: 'self' };
  if (db.prepare('SELECT COUNT(*) n FROM staff').get().n <= 1) return { error: 'last' };
  if (row.role === 'admin' && adminCount(db) <= 1) return { error: 'last_admin' };
  db.prepare('DELETE FROM staff WHERE username = ?').run(row.username);
  return { value: row.username };
}

/** Must this account choose a new password before doing anything else? */
export const needsChange = (row, allowDefault) => Boolean(row?.must_change) && !(allowDefault && row.default_pw);
/** The only admin routes a must-change session may use. */
export const MUST_CHANGE_ROUTES = new Set(['/api/admin/me', '/api/admin/password']);

export function logLogin(db, who, ip, method, now = Date.now()) {
  db.prepare('INSERT INTO staff_logins (who, at, ip, method) VALUES (?, ?, ?, ?)').run(who, now, ip, method);
  db.prepare('DELETE FROM staff_logins WHERE id NOT IN (SELECT id FROM staff_logins ORDER BY id DESC LIMIT 500)').run();
}
export const recentLogins = (db, n = 10) => db.prepare('SELECT who, at, ip, method FROM staff_logins ORDER BY id DESC LIMIT ?').all(n);

// Lockout: 5 failed sign-ins for an IP or a username, then 15 minutes of refusals. In memory, like the rate limit.
export const LOCK = { max: 5, ms: 15 * 60e3 };
const fails = new Map();
export const locked = (key, now = Date.now()) => (fails.get(key)?.until ?? 0) > now;
export function recordFailure(key, now = Date.now()) {
  const f = fails.get(key) ?? { n: 0, first: now, until: 0 };
  if (now - f.first > LOCK.ms) Object.assign(f, { n: 0, first: now });
  if (++f.n >= LOCK.max) f.until = now + LOCK.ms;
  fails.set(key, f);
}
export const clearFailures = (key) => fails.delete(key);

/** Client address behind App Service: the last X-Forwarded-For entry (the one Azure adds), without a port. */
export function clientIp(req) {
  const last = String(req.headers.get('x-forwarded-for') ?? 'local').split(',').pop().trim();
  return last.replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1').replace(/^\[(.+)\]:\d+$/, '$1');
}
