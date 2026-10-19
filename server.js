// The whole website server (App Service, `node server.js`). It serves the static Astro build in dist/,
// fills live data into the HTML at <!--rs:*--> markers (alerts, title edits, groups board, live switch),
// answers /api/*, runs staff sign-in, and hosts the email module. No framework; Node 22+ built-ins only.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';
import { openDb, getState, setState, backup, logActivity, recentActivity } from './src/db.js';
import {
  allow, allowList, addStaff, resetPassword, checkLogin, clearFailures, clientIp, consumeToken, cookieHeader, defaultInUse, issueToken, locked, logLogin,
  needsChange, readCookie, recentLogins, recordFailure, removeStaff, sameOrigin, seedStaff, setPassword, signSession, staffList, staffRow,
  verifySession, MUST_CHANGE_ROUTES, SESSION_DAYS, USERNAME,
} from './src/auth.js';
import {
  ALERT_CSS, ALERT_TYPES, EMAIL, VIDEO_ID, PHOTO_FILE, activeAlerts, siteAlerts, majorAlerts, popupHtml, carryPopKey, upcomingItems, homeEventsHtml,
  eventsPageHtml, currentEvents, validateChurchEvent, teamHtml, teamSeed, validateTeam, etDay, addNews, alertsHtml, boardHtml, esc, imageType, text,
  validateAlert, validateGroups, validateLive, validateNews,
} from './src/lib/state.js';
import { CHURCH } from './src/lib/church.js';
import { createEmail } from './src/email/index.js';
import { createStats } from './src/stats/index.js';
import { helpSection } from './src/help/index.js';

const ROOT = import.meta.dirname;
const PROD = process.env.NODE_ENV === 'production' || Boolean(process.env.WEBSITE_SITE_NAME); // App Service sets WEBSITE_SITE_NAME
if (!PROD && existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const env = process.env;
const PORT = Number(env.PORT) || 8080;
if (PROD) {
  const missing = ['SESSION_SECRET', 'TOKEN_SECRET', 'ADMIN_EMAILS', 'PUBLIC_URL'].filter((k) => !env[k]);
  if (missing.length) { console.error(`Refusing to start: set ${missing.join(', ')} in the App Service settings.`); process.exit(1); }
}
const PUBLIC_URL = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SESSION_SECRET = env.SESSION_SECRET || (await import('node:crypto')).randomBytes(32).toString('hex'); // dev: new secret each start
const ADMINS = allowList(env.ADMIN_EMAILS);
// Testing period only: the seeded admin/admin works without the forced change. Remove before launch.
const ALLOW_DEFAULT_ADMIN = env.ALLOW_DEFAULT_ADMIN === '1';
const DIST = join(ROOT, 'dist');
const DATA = env.DATA_DIR || (PROD ? '/home/data' : join(ROOT, '.data'));
const SEED = JSON.parse(readFileSync(join(ROOT, 'src/content/groups.json'), 'utf8'));
const STAFF_SEED = teamSeed(JSON.parse(readFileSync(join(ROOT, 'src/content/staff.json'), 'utf8')));
const CONTACT = { email: CHURCH.email, phone: CHURCH.phone, times: CHURCH.times, involved: '/get-involved', groups: '/groups', events: '/events' };
const log = (...a) => console.log(new Date().toISOString(), ...a);

const db = openDb(DATA);
const shell = () => readFileSync(join(DIST, 'shell/index.html'), 'utf8');
/** Site chrome (header, footer, styles) around server-made pages such as sign-in and email confirmation. */
const renderPage = (title, inner) => shell().replaceAll('RS_TITLE', esc(title)).replace('<!--rs:content-->', () => inner);

// Email (list, queue, public pages, admin tab) is its own module; the server only uses its interface.
// getGroups: each group's slug is also its email list id (topic "group:<slug>"), so slugs never change after the first save.
const email = createEmail({ db, env: { ...env, DATA_DIR: DATA }, church: CHURCH, publicUrl: PUBLIC_URL, renderPage, log,
  getGroups: () => (getState(db).groups ?? SEED).map((g) => ({ slug: g.id, name: g.name, type: g.type })) });
email.migrate();
email.start();
// Statistics: counted by the server itself (no cookies, no client script), see src/stats.
const stats = createStats({ db, env, log, getGroups: () => (getState(db).groups ?? SEED).map((g) => ({ slug: g.id, name: g.name, type: g.type })) });
stats.migrate();
stats.start();
// Same rule as the email module: SMTP settings in production; development writes emails to DATA_DIR/outbox.
const emailOn = email.configured ?? (Boolean(env.SMTP_URL && env.MAIL_FROM) || !PROD);

const runBackup = () => { try { backup(db, DATA); } catch (e) { log('backup failed', e.message); } };
runBackup();
if (seedStaff(db)) log('Created the first staff account: admin / admin. Sign in at /admin and change the password.');
if (defaultInUse(db)) log(`Warning: the default admin password is still in use${ALLOW_DEFAULT_ADMIN ? ' (ALLOW_DEFAULT_ADMIN=1: no forced change)' : ''}.`);
setInterval(runBackup, 3600e3).unref(); // makes today's copy once per day, keeps 7

// ---------- responses ----------
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const bad = (error, status = 400) => json({ error }, status);
const page = (title, inner, status = 200, headers = {}) => new Response(renderPage(title, inner), { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
const TEXT = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

function baseHeaders(url) {
  const h = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };
  if (url.protocol === 'https:') h['Strict-Transport-Security'] = 'max-age=31536000';
  return h;
}

/** Brotli or gzip for text, when the browser accepts it. */
function compress(nreq, buf, type, headers) {
  if (!TEXT.test(type) || buf.length < 1024) return buf;
  const ae = String(nreq.headers['accept-encoding'] ?? '');
  headers.Vary = 'Accept-Encoding';
  if (/\bbr\b/.test(ae)) { headers['Content-Encoding'] = 'br'; return brotliCompressSync(buf, { params: { [zc.BROTLI_PARAM_QUALITY]: 5 } }); }
  if (/\bgzip\b/.test(ae)) { headers['Content-Encoding'] = 'gzip'; return gzipSync(buf); }
  return buf;
}

async function send(nreq, nres, url, r) {
  const headers = baseHeaders(url);
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
  const cookies = r.headers.getSetCookie();
  if (cookies.length) headers['Set-Cookie'] = cookies;
  let body = r.body ? Buffer.from(await r.arrayBuffer()) : null;
  if (body) body = compress(nreq, body, headers['content-type'] ?? '', headers);
  nres.writeHead(r.status, headers);
  nres.end(nreq.method === 'HEAD' ? undefined : body);
}

// ---------- live data in the static HTML ----------
const HERO = /<div class="container hero-content"[^>]*>/;
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '';
const setAttr = (tag, name, value) => tag.replace(new RegExp(`\\b${name}="[^"]*"`), () => `${name}="${esc(value)}"`);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Staff title/thumbnail edits, applied to the data-vid / data-pod hooks in the built markup. */
function applyItemOverrides(html, videos, podcast) {
  if (!Object.keys(videos).length && !Object.keys(podcast).length) return html;
  // ponytail: tag-level regex over our own markup; assumes no ">" inside these attribute values (titles are escaped).
  return html.replace(/<(h3|span|img|a|input)\b([^>]*?)\bdata-(vid|pod)="([^"]*)"([^>]*)>([^<]*)/g, (m, tag, pre, kind, id, post, inner) => {
    const o = (kind === 'vid' ? videos : podcast)[unesc(id)];
    if (!o) return m;
    let open = `<${tag}${pre}data-${kind}="${id}"${post}>`;
    if (tag === 'img') return (o.thumb ? setAttr(open, 'src', `/api/thumb/${o.thumb}`) : open) + inner;
    if (!o.title) return m;
    if (tag === 'a' && kind === 'vid') return setAttr(open, 'data-title', `${o.title}, ${unesc(attr(open, 'data-date'))}`) + inner;
    if (tag === 'a' || tag === 'input') return setAttr(open, 'aria-label', `${attr(open, 'aria-label').split(' ')[0]} ${o.title}`) + inner;
    return open + esc(o.title);
  });
}

function inject(html, state, path) {
  const now = new Date();
  const live = state.live ?? { mode: 'auto' };
  if (live.mode !== 'auto' || live.video) {
    const a = `${live.mode !== 'auto' ? ` data-live-force="${live.mode}"` : ''}${live.video ? ` data-live-video="${esc(live.video)}"` : ''}`;
    html = html.replace('<html', () => `<html${a}`);
  }
  const alerts = siteAlerts(state.alerts, now);
  if (activeAlerts(state.alerts, now).length) html = html.replace('<!--rs:head-->', () => `<style>${ALERT_CSS}</style>`); // banner or group alerts
  const majors = majorAlerts(state.alerts, now);
  let top = popupHtml(majors); // the pop-up dialog (shown once per alert per browser by its own script)
  if (alerts.length) {
    // Home: in flow at the top of the hero copy (before the live button), so it never covers it. Elsewhere: top of <main>.
    if (path === '/' && HERO.test(html)) html = html.replace(HERO, (m) => m + alertsHtml(alerts, true));
    else top = alertsHtml(alerts, false) + top;
  }
  if (top) html = html.replace('<!--rs:alerts-->', () => top);
  html = applyItemOverrides(html, state.videos ?? {}, state.podcast ?? {});
  const groups = state.groups ?? SEED;
  if (html.includes('<!--rs:coming-up-->')) html = html.replace('<!--rs:coming-up-->', () => homeEventsHtml(upcomingItems(state.events, groups, now), majors, now, CONTACT));
  if (html.includes('<!--rs:events-->')) html = html.replace('<!--rs:events-->', () => eventsPageHtml(upcomingItems(state.events, groups, now, 90), CONTACT));
  if (state.team) html = html.replace(/<!--rs:team-->[\s\S]*?<!--\/rs:team-->/, () => teamHtml(state.team));
  return html.replace(/<!--rs:board-->[\s\S]*?<!--\/rs:board-->/, () => boardHtml(groups, now, CONTACT, state.alerts));
}

// ---------- static files ----------
function resolveFile(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  const file = normalize(join(DIST, p));
  if (file !== DIST && !file.startsWith(DIST + sep)) return null;
  return file;
}

async function serveStatic(nreq, nres, url) {
  const p = url.pathname;
  if (p === '/shell' || p.startsWith('/shell/')) return notFound(nreq, nres, url); // internal template for renderPage
  let file = resolveFile(p);
  let st = file && statSafe(file);
  if (st?.isDirectory()) {
    if (!p.endsWith('/')) { nres.writeHead(301, { ...baseHeaders(url), Location: `${p}/${url.search}` }); return nres.end(); }
    file = join(file, 'index.html');
    st = statSafe(file);
  }
  if (!st?.isFile()) return notFound(nreq, nres, url);
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const headers = { ...baseHeaders(url), 'Content-Type': type };

  if (type.startsWith('text/html')) {
    const isAdmin = p.startsWith('/admin');
    let html = readFileSync(file, 'utf8');
    try {
      if (!isAdmin) html = inject(html, getState(db), p);
      else { // the Email tab (and its script) only for a signed-in session that may use it
        const user = adminUser(new Request(url, { headers: { cookie: String(nreq.headers.cookie ?? '') } }), url);
        if (user && !user.mustChange) {
          html = html.replace('<!--rs:email-->', () => email.adminPartial()).replace('<!--rs:stats-->', () => stats.adminPartial()).replace('<!--rs:help-->', () => helpSection(CHURCH));
        }
      }
    }
    catch (e) { log('inject failed, serving the static page', e.message); } // fail open: static HTML is a correct default
    headers['Cache-Control'] = isAdmin ? 'no-store' : 'no-cache';
    if (isAdmin) headers['X-Robots-Tag'] = 'noindex, nofollow';
    const body = compress(nreq, Buffer.from(html), type, headers);
    nres.writeHead(200, headers);
    if (!isAdmin) stats.record(nreq, nres);
    return nres.end(nreq.method === 'HEAD' ? undefined : body);
  }

  headers['Cache-Control'] = p.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
  headers['Last-Modified'] = st.mtime.toUTCString();
  if (nreq.headers['if-modified-since'] && new Date(nreq.headers['if-modified-since']) >= new Date(st.mtime.toUTCString())) { nres.writeHead(304, headers); return nres.end(); }
  if (TEXT.test(type)) {
    const body = compress(nreq, readFileSync(file), type, headers);
    nres.writeHead(200, headers);
    return nres.end(nreq.method === 'HEAD' ? undefined : body);
  }
  // Video needs byte ranges (iPhone Safari will not play an mp4 without them).
  headers['Accept-Ranges'] = 'bytes';
  const range = /^bytes=(\d*)-(\d*)$/.exec(nreq.headers.range ?? '');
  let start = 0, end = st.size - 1, status = 200;
  if (range) {
    start = range[1] ? +range[1] : Math.max(0, st.size - +range[2]);
    end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { nres.writeHead(416, { ...headers, 'Content-Range': `bytes */${st.size}` }); return nres.end(); }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  nres.writeHead(status, headers);
  if (nreq.method === 'HEAD') return nres.end();
  createReadStream(file, { start, end }).pipe(nres);
}
const statSafe = (f) => { try { return statSync(f); } catch { return null; } };
function notFound(nreq, nres, url) {
  const f = join(DIST, '404.html');
  nres.writeHead(404, { ...baseHeaders(url), 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  nres.end(nreq.method === 'HEAD' || !existsSync(f) ? undefined : readFileSync(f));
}

// ---------- API ----------
async function route(req, url) {
  const p = url.pathname;
  const origin = url.origin;
  if (p.startsWith('/api/photo/') && req.method === 'GET') {
    const name = p.slice('/api/photo/'.length);
    const f = PHOTO_FILE.test(name) && join(DATA, 'photos', name);
    if (!f || !existsSync(f)) return bad('not_found', 404);
    return new Response(readFileSync(f), { headers: { 'Content-Type': TYPES[extname(name)], 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }
  if (p.startsWith('/api/thumb/') && req.method === 'GET') {
    const name = p.slice('/api/thumb/'.length);
    const ext = /^[\w-]{11}-[a-z0-9]{1,12}\.(jpg|png|webp)$/.exec(name)?.[1];
    const f = ext && join(DATA, 'thumbs', name);
    if (!f || !existsSync(f)) return bad('not_found', 404);
    return new Response(readFileSync(f), { headers: { 'Content-Type': TYPES[`.${ext}`], 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }
  if (p === '/api/login' && req.method === 'POST') return loginRequest(req, url);
  if (p === '/api/login/password' && req.method === 'POST') return passwordLogin(req, url);
  if (p === '/admin/login') return loginPage(req, url);
  if (p === '/api/logout' && req.method === 'POST') {
    if (!sameOrigin(req, origin)) return bad('origin', 403);
    return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', { secure: url.protocol === 'https:', maxAge: 0 }) });
  }
  if (p.startsWith('/api/admin/')) {
    const user = adminUser(req, url);
    if (!user) return bad('signed_out', 401);
    if (req.method !== 'GET' && !sameOrigin(req, origin)) return bad('origin', 403);
    // A new account (or admin/admin, unless ALLOW_DEFAULT_ADMIN=1) can only choose a new password until it does.
    if (user.mustChange && !MUST_CHANGE_ROUTES.has(p)) return bad('must_change', 403);
    const copy = req.method === 'GET' ? null : req.clone(); // read again below, for the activity log
    if (p.startsWith('/api/admin/stats/')) return (await stats.adminHandle(req, url)) ?? bad('not_found', 404);
    const res = p.startsWith('/api/admin/email/') ? (await email.adminHandle(req, url, user.name)) ?? bad('not_found', 404) : await adminApi(req, url, user);
    if (copy && res.ok) {
      const what = describe(req.method, p, await copy.json().catch(() => ({})), await res.clone().json().catch(() => ({})));
      if (what) logActivity(db, user.name, what);
    }
    return res;
  }
  const st = await stats.handle(req, url); // public POST /api/stats/play
  if (st) return st;
  return (await email.handle(req, url)) ?? bad('not_found', 404);
}

/** { name, kind: 'email'|'password', mustChange } for a signed-in staff member, else null.
 *  Sessions hold an email (sign-in link, checked against ADMIN_EMAILS) or a username (checked against the staff table). */
function adminUser(req, url) {
  // Local development only: DEV_ADMIN=1 is ignored in production and on any non-local hostname.
  if (env.DEV_ADMIN === '1' && !PROD && ['localhost', '127.0.0.1'].includes(url.hostname)) return { name: env.DEV_EMAIL || 'dev@localhost', kind: 'email' };
  const known = { has: (n) => (n.includes('@') ? ADMINS.has(n) : Boolean(staffRow(db, n))), version: sessionVersion };
  const name = verifySession(readCookie(req.headers.get('cookie')), SESSION_SECRET, known);
  if (!name) return null;
  if (name.includes('@')) return { name, kind: 'email' };
  return { name, kind: 'password', mustChange: needsChange(staffRow(db, name), ALLOW_DEFAULT_ADMIN) };
}
// Password accounts carry a session version; a new password or a removed account ends their other sessions.
const sessionVersion = (name) => (name.includes('@') ? 0 : staffRow(db, name)?.session_v ?? 0);
const sessionCookie = (name, url) => cookieHeader(signSession(name, Date.now() + SESSION_DAYS * 86400e3, SESSION_SECRET, sessionVersion(name)), { secure: url.protocol === 'https:' });

/** One line for the activity log, or '' for writes not worth listing. */
function describe(method, p, body, res) {
  const [section, a1, a2] = p.slice('/api/admin/'.length).split('/');
  const q = (t) => `“${String(t ?? '').slice(0, 80)}”`;
  switch (`${method} ${section}`) {
    case 'POST alerts': return `Posted alert ${q(body.message)}${body.group ? ` for ${body.group}` : ''}${body.popup ? ' (pop-up)' : ''}${res.recipients !== undefined ? `, emailing ${res.recipients}` : ''}`;
    case 'DELETE alerts': return 'Ended an alert';
    case 'PUT items': return `Changed a ${a1} title to ${q(body.title)}`;
    case 'DELETE items': return `Reset a ${a1} to the original`;
    case 'POST thumb': return 'Changed a video thumbnail';
    case 'PUT groups': return 'Saved the groups';
    case 'POST groups': return `Posted an update in ${a1}: ${q(body.title)}`;
    case 'DELETE groups': return `Deleted an update in ${a1}`;
    case 'PUT live': return `Set the livestream to ${body.mode}`;
    case 'POST password': return 'Changed their password';
    case 'POST staff': return a2 === 'reset' ? `Reset the password for ${a1}` : `Added the staff account ${String(body.username ?? '').toLowerCase()}`;
    case 'DELETE staff': return `Removed the staff account ${a1}`;
    case 'PUT events': return `Saved the event ${q(body.title)}`;
    case 'DELETE events': return 'Removed an event';
    case 'PUT team': return 'Updated Our team';
    case 'POST photo': return 'Uploaded a team photo';
    case 'POST email':
      if (a1 === 'send') return `Sent the email ${q(body.subject)}${res.recipients !== undefined ? ` to ${res.recipients}` : ''}`;
      if (a1 === 'test') return `Sent a test email ${q(body.subject)}`;
      if (a1 === 'subscribers' && a2 === 'unsubscribe') return 'Unsubscribed someone';
      return `Email: ${[a1, a2].filter(Boolean).join(' ')}`;
  }
  return '';
}

const WRONG = 'That username and password don’t match. Check them and try again.';
async function passwordLogin(req, url) {
  if (!sameOrigin(req, url.origin)) return bad('origin', 403);
  const b = await req.json().catch(() => null);
  const username = String(b?.username ?? '').trim().toLowerCase().slice(0, 64);
  const ip = clientIp(req);
  // Lockout after 5 failures, per IP and per username (existing or not, so it says nothing about who has an account).
  if (locked(`ip:${ip}`) || locked(`user:${username}`)) return json({ error: 'locked', message: 'Too many tries. Wait 15 minutes, then try again.' }, 429);
  const row = checkLogin(db, username, String(b?.password ?? '').slice(0, 200));
  if (!row) {
    recordFailure(`ip:${ip}`);
    recordFailure(`user:${username}`);
    return json({ error: 'wrong', message: WRONG }, 401);
  }
  clearFailures(`user:${username}`);
  logLogin(db, row.username, ip, 'password');
  logActivity(db, row.username, 'Signed in with a password');
  log('staff signed in', row.username);
  return json({ ok: true, mustChange: needsChange(row, ALLOW_DEFAULT_ADMIN) }, 200, { 'Set-Cookie': sessionCookie(row.username, url) });
}

const SENT = 'If that address is on the staff list, we sent a sign-in link. It works once, for 15 minutes.';
async function loginRequest(req, url) {
  if (!sameOrigin(req, url.origin)) return bad('origin', 403);
  const b = await req.json().catch(() => null);
  const addr = String(b?.email ?? '').trim().toLowerCase();
  if (addr.length > 254 || !EMAIL.test(addr)) return bad('email');
  const ip = clientIp(req);
  // Same reply for every address, allowed or not, limited or not, so the form can't be used to find staff emails.
  if (allow(`ip:${ip}`, 20) && allow(`email:${addr}`, 5) && ADMINS.has(addr)) {
    const link = `${PUBLIC_URL}/admin/login?t=${issueToken(db, addr)}`;
    if (!PROD) log(`[dev] sign-in link for ${addr}: ${link}`);
    email.sendNow({
      to: addr,
      subject: 'Your sign-in link for the Riverside website',
      text: `Open this link to sign in to the Riverside website admin. It works once, for 15 minutes.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
      html: `<p>Open this link to sign in to the Riverside website admin. It works once, for 15 minutes.</p><p><a href="${esc(link)}">Sign in to the website admin</a></p><p>If you didn't ask for this, you can ignore this email.</p>`,
    }).catch((e) => log('sign-in email failed', e.message));
  }
  return json({ ok: true, message: SENT });
}

// The emailed link opens a page with a button; only the POST uses the token up, because mail scanners open links.
async function loginPage(req, url) {
  const card = (inner) => `<section class="section"><div class="container-narrow"><div class="card login-card">${inner}</div></div></section>`;
  if (req.method === 'GET') {
    const t = url.searchParams.get('t') ?? '';
    return page('Staff sign in', card(`<h1 class="h3">Staff sign in</h1><p>Press the button to finish signing in to the website admin.</p><form method="post" action="/admin/login"><input type="hidden" name="t" value="${esc(t)}"><button class="btn" type="submit">Sign in</button></form>`));
  }
  if (req.method !== 'POST') return bad('method', 405);
  if (!sameOrigin(req, url.origin)) return bad('origin', 403);
  const f = await req.formData().catch(() => null);
  const addr = consumeToken(db, String(f?.get('t') ?? ''));
  if (!addr || !ADMINS.has(addr)) {
    return page('Staff sign in', card('<h1 class="h3">That link has expired or was already used.</h1><p>Sign-in links work once, for 15 minutes.</p><p><a class="btn" href="/admin/">Get a new link</a></p>'), 400);
  }
  logLogin(db, addr, clientIp(req), 'link');
  logActivity(db, addr, 'Signed in with an emailed link');
  log('staff signed in', addr);
  return new Response(null, { status: 303, headers: { Location: '/admin/', 'Set-Cookie': sessionCookie(addr, url) } });
}

async function adminApi(req, url, user) {
  const [section, a1, a2, a3] = url.pathname.slice('/api/admin/'.length).split('/');
  const key = `${req.method} ${section}`;
  if (key === 'POST thumb') return thumbRoute(req, a1);
  if (key === 'POST photo') return photoRoute(req);
  const body = ['POST', 'PUT'].includes(req.method) ? await req.json().catch(() => null) : null;
  const state = getState(db);
  const save = () => setState(db, state);

  switch (key) {
    case 'GET state':
      return json({ state: { ...state, groups: state.groups ?? SEED }, email: emailOn, user: user.name, defaultPassword: defaultInUse(db) });

    case 'GET activity':
      return json({ activity: recentActivity(db) });

    case 'GET backup': { // everything the church owns, as one JSON file (no passwords, tokens or secrets)
      let subscribers = [];
      try { subscribers = db.prepare('SELECT email, topics, status, created_at, confirmed_at, unsub_at FROM subscribers ORDER BY id').all(); } catch {}
      const data = { exported: new Date().toISOString(), site: PUBLIC_URL, state, staffAccounts: staffList(db).map((a) => a.username), subscribers };
      return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="riverside-backup-${etDay(new Date())}.json"` } });
    }

    case 'PUT events': { // /api/admin/events/<id or "new">
      const v = validateChurchEvent({ ...body, id: a1 === 'new' ? undefined : a1 }, etDay(new Date()));
      if (v.error) return bad(v.error);
      const events = currentEvents(state.events, new Date()).filter((e) => e.id !== v.value.id);
      state.events = [...events, v.value].sort((x, y) => x.date.localeCompare(y.date) || (x.start ?? '').localeCompare(y.start ?? ''));
      save();
      return json({ event: v.value, events: state.events });
    }

    case 'DELETE events':
      state.events = currentEvents(state.events, new Date()).filter((e) => e.id !== a1);
      save();
      return json({ events: state.events });

    case 'GET team':
      return json({ team: state.team ?? STAFF_SEED });

    case 'PUT team': {
      const v = validateTeam(body, state.team ?? STAFF_SEED);
      if (v.error) return bad(v.error);
      state.team = v.value;
      save();
      // Photos no longer used by anyone are deleted.
      const used = new Set(state.team.map((m) => m.photo));
      const dir = join(DATA, 'photos');
      if (existsSync(dir)) for (const f of readdirSync(dir)) if (!used.has(`/api/photo/${f}`)) rmSync(join(dir, f), { force: true });
      return json({ team: state.team });
    }

    case 'GET me':
      return json({ name: user.name, kind: user.kind, mustChange: Boolean(user.mustChange), defaultPassword: defaultInUse(db) });

    case 'POST password': { // your own password (password accounts only)
      if (user.kind !== 'password') return bad('no_password');
      const row = staffRow(db, user.name);
      // A forced change follows a sign-in seconds ago; otherwise prove it's you.
      if (!user.mustChange && !checkLogin(db, user.name, body?.current)) return bad('current');
      const r = setPassword(db, user.name, body?.password);
      if (r.error) return bad(r.error);
      log('password changed', row.username);
      // Every other session of this account just ended (new session version); keep this one.
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(user.name, url) });
    }

    case 'GET staff':
      return json({ me: user.name, kind: user.kind, accounts: staffList(db).map((a) => ({ username: a.username, mustChange: Boolean(a.must_change), defaultPassword: Boolean(a.default_pw), updated: a.updated_at })),
        logins: recentLogins(db, 10) });

    case 'POST staff': {
      if (a2 === 'reset') { // /api/admin/staff/<username>/reset {password}
        const rr = resetPassword(db, decodeURIComponent(a1 ?? ''), body?.password, user.name);
        if (rr.error) return bad(rr.error, rr.error === 'not_found' ? 404 : 400);
        log('password reset', rr.value, 'by', user.name);
        return json({ ok: true, username: rr.value });
      }
      const r = addStaff(db, body?.username, body?.password);
      if (r.error) return bad(r.error);
      log('staff account added', r.value, 'by', user.name);
      return json({ ok: true, username: r.value });
    }

    case 'DELETE staff': {
      let name = '';
      try { name = decodeURIComponent(a1 ?? ''); } catch {}
      if (!USERNAME.test(name)) return bad('not_found', 404);
      const r = removeStaff(db, name, user.name);
      if (r.error) return bad(r.error);
      log('staff account removed', r.value, 'by', user.name);
      return json({ ok: true });
    }

    case 'GET recipients': { // ?type=urgent|news[&group=<id>][&topics=a,b]
      const type = url.searchParams.get('type');
      if (!ALERT_TYPES[type]) return bad('type');
      const group = url.searchParams.get('group') || undefined;
      if (group && !(state.groups ?? SEED).some((g) => g.id === group)) return bad('group');
      const topics = alertTopics((url.searchParams.get('topics') ?? '').split(','), { type, group });
      return json({ count: email.countRecipients(topics), topics });
    }

    case 'POST alerts': {
      const groups = state.groups ?? SEED;
      const v = validateAlert(body, new Date(), groups.map((g) => g.id));
      if (v.error) return bad(v.error);
      if (body.email && !emailOn) return bad('email_not_configured', 503);
      const alert = v.value;
      // Editing = replace: the edited alert gets a new id, so visitors who dismissed the old one see it again.
      const replaced = (state.alerts ?? []).find((x) => x.id === body.replaces);
      Object.assign(alert, carryPopKey(alert, replaced, Boolean(body.showAgain)));
      state.alerts = [...activeAlerts(state.alerts).filter((x) => x.id !== body.replaces), alert];
      save();
      if (!body.email) return json({ alert });
      let recipients;
      try {
        ({ recipients } = await email.enqueueBlast({ topics: alertTopics(body.topics, alert), subject: `${alert.group ? `${groups.find((g) => g.id === alert.group).name}: ` : ''}${alert.message}`.slice(0, 90),
          body: `${alert.message}${alert.link ? `\n\n[Learn more →](${alert.link.startsWith('/') ? PUBLIC_URL + alert.link : alert.link})` : ''}`, label: ALERT_TYPES[alert.type].label, priority: 1, createdBy: user.name }));
      } catch (e) {
        log('alert email not queued', e.message); // the alert itself is already posted
        return json({ error: 'email_failed', alert }, 502);
      }
      alert.emailed = true;
      save();
      return json({ alert, recipients });
    }

    case 'DELETE alerts':
      state.alerts = (state.alerts ?? []).filter((x) => x.id !== a1);
      save();
      return json({ ok: true });

    case 'PUT items':
    case 'DELETE items': {
      const kind = a1 === 'video' ? 'videos' : a1 === 'podcast' ? 'podcast' : null;
      let id = '';
      try { id = decodeURIComponent(a2 ?? ''); } catch {}
      if (!kind || (kind === 'videos' ? !VIDEO_ID.test(id) : !id || id.length > 300)) return bad('item');
      const map = (state[kind] ??= {});
      const old = map[id] ?? {};
      if (req.method === 'DELETE') {
        if (old.thumb) rmSync(join(DATA, 'thumbs', old.thumb), { force: true });
        delete map[id];
      } else {
        const next = { ...old, title: text(body?.title, 120) || undefined };
        if (next.title || next.thumb) map[id] = next;
        else delete map[id];
      }
      save();
      return json({ item: map[id] ?? null });
    }

    case 'PUT groups': {
      const v = validateGroups(body, state.groups ?? SEED);
      if (v.error) return bad(v.error);
      state.groups = v.value;
      const ids = new Set(v.value.map((g) => g.id));
      state.alerts = (state.alerts ?? []).filter((a) => !a.group || ids.has(a.group)); // a removed group takes its alerts with it
      save();
      return json({ groups: state.groups, alerts: state.alerts });
    }

    case 'POST groups':
    case 'DELETE groups': { // /api/admin/groups/<id>/news[/<postId>]
      const groups = state.groups ?? structuredClone(SEED);
      const g = groups.find((x) => x.id === a1);
      if (!g || a2 !== 'news') return bad('not_found', 404);
      if (req.method === 'POST') {
        const v = validateNews(body);
        if (v.error) return bad(v.error);
        g.news = addNews(g.news, v.value);
      } else {
        g.news = (g.news ?? []).filter((n) => n.id !== a3);
      }
      g.updated = new Date().toISOString();
      state.groups = groups;
      save();
      return json({ group: g });
    }

    case 'PUT live': {
      const v = validateLive(body);
      if (v.error) return bad(v.error);
      state.live = v.value;
      save();
      return json({ live: state.live });
    }
  }
  return bad('not_found', 404);
}

/** Email topics for an alert: only "news", "alerts" and this alert's own group list are allowed. Default: the group's
 *  list for a group alert, otherwise the topic that matches the alert type. */
function alertTopics(asked, { type, group }) {
  const allowed = new Set(['news', 'alerts', ...(group ? [`group:${group}`] : [])]);
  const topics = [...new Set((Array.isArray(asked) ? asked : []).filter((t) => allowed.has(t)))];
  return topics.length ? topics : [group ? `group:${group}` : ALERT_TYPES[type].topic];
}

async function photoRoute(req) {
  if (+(req.headers.get('content-length') ?? 0) > 2 * 1024 * 1024) return bad('too_large', 413);
  const bytes = await req.arrayBuffer();
  const type = imageType(bytes);
  if (!type) return bad('image');
  const name = `team-${Date.now().toString(36)}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
  mkdirSync(join(DATA, 'photos'), { recursive: true });
  writeFileSync(join(DATA, 'photos', name), Buffer.from(bytes));
  return json({ photo: `/api/photo/${name}` }); // kept only if a team member uses it on the next save
}

async function thumbRoute(req, id) {
  if (!VIDEO_ID.test(id ?? '')) return bad('item');
  if (+(req.headers.get('content-length') ?? 0) > 2 * 1024 * 1024) return bad('too_large', 413);
  const bytes = await req.arrayBuffer();
  const type = imageType(bytes);
  if (!type) return bad('image');
  const state = getState(db);
  const map = (state.videos ??= {});
  const old = map[id] ?? {};
  const thumb = `${id}-${Date.now().toString(36)}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
  writeFileSync(join(DATA, 'thumbs', thumb), Buffer.from(bytes));
  if (old.thumb) rmSync(join(DATA, 'thumbs', old.thumb), { force: true });
  map[id] = { ...old, thumb };
  setState(db, state);
  return json({ item: map[id] });
}

// ---------- HTTP ----------
const SERVER_ROUTES = /^\/(api\/|admin\/login$|email\/|subscribe\/confirm)/;
const MAX_BODY = 2.5 * 1024 * 1024;

function readBody(nreq) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    nreq.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); nreq.destroy(); } else chunks.push(c); });
    nreq.on('end', () => resolve(Buffer.concat(chunks)));
    nreq.on('error', reject);
  });
}

const server = createServer(async (nreq, nres) => {
  let url;
  try {
    // App Service ends TLS in front of us and says so in X-Forwarded-Proto.
    const proto = String(nreq.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim() === 'https' ? 'https' : 'http';
    url = new URL(nreq.url, `${proto}://${nreq.headers.host ?? 'localhost'}`);
  } catch {
    nres.writeHead(400).end();
    return;
  }
  try {
    if (!SERVER_ROUTES.test(url.pathname)) {
      if (!['GET', 'HEAD'].includes(nreq.method)) { nres.writeHead(405, baseHeaders(url)).end(); return; }
      return await serveStatic(nreq, nres, url);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(nreq.headers)) for (const x of [v].flat()) headers.append(k, x);
    const body = ['GET', 'HEAD'].includes(nreq.method) ? undefined : await readBody(nreq);
    await send(nreq, nres, url, await route(new Request(url, { method: nreq.method, headers, body }), url));
  } catch (e) {
    if (e.status !== 413) log('error', nreq.method, url.pathname, e.stack ?? e);
    if (!nres.headersSent) { nres.writeHead(e.status ?? 500, { 'Content-Type': 'application/json' }); nres.end(JSON.stringify({ error: e.status === 413 ? 'too_large' : 'server' })); }
  }
});

server.listen(PORT, () => log(`Riverside site on ${PUBLIC_URL} (port ${PORT}, data in ${DATA}${PROD ? '' : ', development'})`));
const stop = () => { email.stop(); stats.stop(); server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 5000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
