// Our own email: double opt-in signup, preferences/unsubscribe, the admin Email tab, and a rate-limited send queue.
// The server imports only createEmail(). Tables live in the site's one SQLite db; the queue doubles as the send log.
// Env: SMTP_URL (smtps://user:pass@host:port), MAIL_FROM ("Riverside Community Church <news@domain>"), MAIL_REPLY_TO,
// SEND_RATE_PER_HOUR (100), SEND_RATE_PER_MIN (30), PUBLIC_URL, TOKEN_SECRET, DATA_DIR.
// Without SMTP settings: in development every email is written to DATA_DIR/outbox/*.eml; in production nothing is sent.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { EMAIL, esc } from '../lib/state.js';
import { TOPICS, TOPIC_SHAPE, cleanTopics, groupsByType, topicLabels, whyLabels } from './topics.js';
import { renderEmail } from './template.js';
import { adminSection } from './admin.js';

const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
const RETRY = [MIN, 5 * MIN, 30 * MIN, 2 * HOUR]; // wait after failed attempt 1..4; the 5th failure is final
const CONFIRM_TTL = 7 * DAY;
const KEEP = 180 * DAY;

// ---------- Tokens: HMAC(TOKEN_SECRET, v1|kind.subscriberId.expiry.topics) ----------
// kind 'c' = confirm (7 days, carries the topics asked for, group lists included); kind 'p' = preferences + unsubscribe (no expiry).
const mac = (secret, payload) => createHmac('sha256', secret).update(`v1|${payload}`).digest();

export function signToken(secret, kind, id, { exp = 0, topics = [] } = {}) {
  const payload = `${kind}.${id}.${exp}.${topics.join(',')}`;
  return `${Buffer.from(payload).toString('base64url')}.${mac(secret, payload).toString('base64url')}`;
}

/** { id, topics } for a valid, unexpired token of `kind`; otherwise null. Topics are shape-checked only; callers check the groups still exist. */
export function verifyToken(secret, kind, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 4000) return null;
  const [p, sig] = token.split('.');
  if (!p || !sig) return null;
  const payload = Buffer.from(p, 'base64url').toString();
  const want = mac(secret, payload);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const [k, id, exp, topics] = payload.split('.');
  if (k !== kind || !/^\d+$/.test(id) || (+exp && +exp < now)) return null;
  return { id: +id, topics: topics ? topics.split(',').filter((t) => TOPIC_SHAPE.test(t)) : [] };
}

// ---------- Input checks ----------
const line = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const multiline = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '');
const okEmail = (v) => { const e = line(v, 255); return e.length <= 254 && EMAIL.test(e) ? e : null; };
const posInt = (v, d) => (Number.isInteger(+v) && +v > 0 ? +v : d);
/** SQL test "subscriber has any of these topics"; topics are known keys (cleanTopics) and bound as params. */
const hasTopic = (topics) => `(${topics.map(() => "instr(','||topics||',', ','||?||',')>0").join(' OR ')})`;

// ponytail: in-memory limits reset on restart and assume one instance (the ruling); a table if that changes.
const hits = new Map();
function limited(key, max, win, now) {
  if (hits.size > 10000) hits.clear();
  const a = (hits.get(key) ?? []).filter((t) => t > now - win);
  a.push(now);
  hits.set(key, a);
  return a.length > max;
}

// SMTP replies that mean the address itself is bad: fail at once, no retries.
const PERMANENT = { 550: 'Mailbox doesn’t exist', 551: 'Mailbox doesn’t exist', 552: 'Mailbox is full', 553: 'Address isn’t valid' };
const reason = (e) => PERMANENT[e?.responseCode] ?? String(e?.response || e?.message || 'Send failed').slice(0, 200);

export function createEmail({ db, env = {}, church, publicUrl, renderPage, getGroups = () => [], log = console, transport }) {
  const say = (...a) => (typeof log === 'function' ? log : log?.log ?? console.log)(...a);
  // The server owns groups; read them fresh every time and never keep a copy.
  const groups = () => { try { return getGroups() ?? []; } catch (e) { say(`email: getGroups failed: ${e?.message}`); return []; } };
  const clean = (v, gs = groups()) => cleanTopics(v, gs);
  const base = String(publicUrl || env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '');
  const site = new URL(base).hostname.replace(/^www\./, '');
  const logo = `${base}/brand/email-seal.png`; // served from dist/brand
  const prod = env.NODE_ENV === 'production' || Boolean(env.WEBSITE_SITE_NAME); // Azure App Service always sets WEBSITE_SITE_NAME
  const secret = env.TOKEN_SECRET || (prod ? '' : 'dev-only-token-secret');
  if (!secret) throw new Error('TOKEN_SECRET is required in production');
  const perHour = posInt(env.SEND_RATE_PER_HOUR, 100);
  const perMin = posInt(env.SEND_RATE_PER_MIN, 30);
  const smtp = Boolean(env.SMTP_URL && env.MAIL_FROM);
  const mode = transport ? 'custom' : smtp ? 'smtp' : prod ? 'off' : 'outbox';
  const from = env.MAIL_FROM || `${church.name} <news@localhost>`;
  const replyTo = env.MAIL_REPLY_TO || undefined;
  const unsubMailbox = (replyTo || from).match(/<([^>]+)>/)?.[1] ?? (replyTo || from).trim();
  const outbox = join(env.DATA_DIR || 'data', 'outbox');
  let mailer = transport ?? null;
  if (mode === 'smtp') {
    const u = new URL(env.SMTP_URL);
    u.searchParams.set('pool', 'true');
    u.searchParams.set('maxConnections', '2');
    mailer = nodemailer.createTransport(u.href);
  } else if (mode === 'outbox') {
    mailer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    say(`email: no SMTP_URL/MAIL_FROM, writing emails to ${outbox}`);
  }
  const notConfigured = () => Object.assign(new Error('Email isn’t configured'), { code: 'not_configured' });
  const direct = []; // times of sendNow/confirmation sends: they use the same relay quota as the queue
  let seq = 0;

  async function deliver({ to, subject, text, html, headers }) {
    if (!mailer) throw notConfigured();
    const info = await mailer.sendMail({ from, replyTo, to, subject, text, html, headers });
    if (mode === 'outbox') {
      mkdirSync(outbox, { recursive: true });
      writeFileSync(join(outbox, `${Date.now()}-${++seq}.eml`), info.message);
      say(`email (outbox): ${to} | ${subject}`);
    }
  }

  const prefsUrl = (id) => `${base}/email/preferences?t=${signToken(secret, 'p', id)}`;
  const q = (sql) => db.prepare(sql);
  const subscriber = (id) => q('SELECT * FROM subscribers WHERE id = ?').get(id);
  const unsubscribe = (id, now = Date.now()) => q("UPDATE subscribers SET status = 'unsubscribed', unsub_at = ? WHERE id = ? AND status != 'unsubscribed'").run(now, id).changes;

  // ---------- Pages (B's site shell wraps them) ----------
  const HEAD = { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...HEAD, 'Content-Type': 'application/json' } });
  const page = (title, inner, status = 200) => new Response(renderPage(title, `<section class="section"><div class="container-narrow"><div class="card email-card">${inner}</div></div></section><style>${PAGE_CSS}</style>`),
    { status, headers: { ...HEAD, 'Content-Type': 'text/html; charset=utf-8' } });
  const contact = `<a class="link" href="mailto:${esc(church.email)}">contact us</a>`;
  const box = (on, k, label) => `<label class="topic"><input type="checkbox" name="topic" value="${esc(k)}"${on.includes(k) ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  const topicBoxes = (on, gs) => {
    const types = groupsByType(gs);
    return `<fieldset><legend>What would you like to get?</legend>${Object.entries(TOPICS).map(([k, label]) => box(on, k, label)).join('')}</fieldset>`
      + (types.length ? `<fieldset><legend>My groups <span class="muted">(optional)</span></legend>${types.map((t) =>
        `<p class="topic-type">${esc(t.label)}</p>${t.groups.map((g) => box(on, g.key, g.name)).join('')}`).join('')}</fieldset>` : '');
  };
  const unsubscribedPage = () => page('Unsubscribed', '<h1 class="h2">You’re unsubscribed.</h1><p>You won’t get any more Riverside emails.</p><p><a class="link" href="/subscribe">Changed your mind? Subscribe again</a></p>');
  const deadLink = () => page('Link not working', `<h1 class="h2">That link doesn’t work.</h1><p>Use the link in a recent Riverside email, or ${contact}.</p>`, 400);

  function prefsPage(row, t, { saved = false, first = false } = {}) {
    const action = `/email/preferences?t=${encodeURIComponent(t)}`;
    const unsub = `<p><button class="btn btn-outline" name="do" value="unsub"${first ? ' autofocus' : ''}>Unsubscribe from all</button></p>`;
    return page('Your email settings', `<h1 class="h2">Your email settings</h1><p>For <strong>${esc(row.email)}</strong></p>`
      + `<form method="post" action="${esc(action)}">${first ? `${unsub}<hr>` : ''}${topicBoxes(row.topics.split(','), groups())}`
      + '<p><button class="btn" name="do" value="save">Save</button></p>'
      + `<p role="status">${saved ? '<strong>Saved.</strong>' : ''}</p>${first ? '' : `<hr>${unsub}`}</form>`);
  }

  async function readForm(req) {
    const type = req.headers.get('content-type') ?? '';
    if (type.startsWith('multipart/form-data')) {
      const f = await req.formData();
      return { get: (k) => f.get(k), all: (k) => f.getAll(k) };
    }
    const raw = await req.text();
    if (raw.length > 20000) return null;
    if (type.includes('json')) {
      let o;
      try { o = JSON.parse(raw); } catch { return null; }
      return { get: (k) => (typeof o?.[k] === 'string' ? o[k] : null), all: (k) => (Array.isArray(o?.[k]) ? o[k] : o?.[k] ? [o[k]] : []) };
    }
    const f = new URLSearchParams(raw);
    return { get: (k) => f.get(k), all: (k) => f.getAll(k) };
  }

  // Azure's front end appends the client address last ("ip:port"); B's server also trusts X-Forwarded-*.
  const clientIp = (req) => (req.headers.get('x-forwarded-for') ?? '').split(',').pop().trim().replace(/:\d+$/, '') || 'local';

  // ---------- Public routes ----------
  async function subscribe(req) {
    const wantsJson = /json/.test(req.headers.get('accept') ?? '') || /json/.test(req.headers.get('content-type') ?? '');
    const reply = (error, status = 400) => (wantsJson ? json(error ? { error } : { ok: true }, error ? status : 200)
      : error ? page('Subscribe', `<h1 class="h2">That didn’t work.</h1><p>${error === 'email' ? 'Enter an email like name@example.com.' : error === 'topic' ? 'Choose at least one topic.' : `Please try again, or ${contact}.`}</p><p><a class="btn" href="/subscribe">Back to Subscribe</a></p>`, status)
        : page('Check your email', '<h1 class="h2">Check your email to confirm.</h1><p>We sent you a link. Tap it to start getting emails. Not there? Check spam, or <a class="link" href="/subscribe">try again</a>.</p>'));
    const f = await readForm(req);
    if (!f) return reply('bad');
    if (f.get('website')) return reply(null); // honeypot: bots fill the hidden field; tell them it worked
    const email = okEmail(f.get('email') ?? f.get('EMAIL'));
    if (!email) return reply('email');
    const gs = groups();
    const topics = clean([...f.all('topic'), ...f.all('topics')], gs);
    if (!topics.length) return reply('topic');
    if (!mailer) return reply('not_configured', 503);
    if (limited(`ip:${clientIp(req)}`, 30, HOUR, Date.now())) return reply('rate', 429);
    const r = await requestConfirm(email, topics, gs);
    return r.failed ? reply('send', 502) : reply(null); // "already sent recently" gets the normal reply: no enumeration
  }

  /** One confirmation email for `topics` (a signup or a staff invite). Nothing is subscribed until the link is clicked.
   *  Returns { ok } or { why, failed }. */
  async function requestConfirm(email, topics, gs, invite = false) {
    const now = Date.now();
    const key = email.toLowerCase();
    let row = q('SELECT * FROM subscribers WHERE email = ?').get(email);
    if (invite && row?.status === 'unsubscribed') return { why: 'Unsubscribed earlier, so only they can sign up again' };
    // One confirmation per request: a resubmit within 10 minutes (or past 3 a day) sends nothing.
    if (limited(`10m:${key}`, 1, 10 * MIN, now) || limited(`day:${key}`, 3, DAY, now)) return { why: 'Already sent a confirmation recently' };
    if (!row) {
      row = subscriber(q("INSERT INTO subscribers (email, topics, status, created_at) VALUES (?, ?, 'pending', ?)").run(email, topics.join(','), now).lastInsertRowid);
    } else if (row.status !== 'confirmed') {
      // A confirmed person's lists change only when they click the new link (the token carries the topics).
      const asked = row.status === 'pending' ? [...row.topics.split(','), ...topics] : topics;
      q("UPDATE subscribers SET topics = ?, status = 'pending' WHERE id = ?").run(clean(asked, gs).join(','), row.id);
    }
    const t = signToken(secret, 'c', row.id, { exp: now + CONFIRM_TTL, topics });
    const subject = 'Confirm your Riverside emails';
    const m = renderEmail({ church, logo, subject,
      body: invite ? `You’re invited to get emails for ${whyLabels(topics, gs)} from ${church.name}. Tap the button to say yes.`
        : `Tap the button to start getting ${whyLabels(topics, gs)} from ${church.name}.`,
      button: { text: 'Yes, sign me up', url: `${base}/subscribe/confirm?t=${t}` },
      after: 'The link works for 7 days. If you didn’t ask for this, ignore this email.' });
    try { await deliver({ to: row.email, subject, ...m }); direct.push(now); return { ok: true }; }
    catch (e) { hits.delete(`10m:${key}`); say(`email: confirmation to ${row.email} failed: ${reason(e)}`); return { why: reason(e), failed: true }; }
  }

  function confirm(req, url) {
    const t = url.searchParams.get('t');
    const v = verifyToken(secret, 'c', t);
    const row = v && subscriber(v.id);
    const gs = groups();
    const asked = clean(v?.topics ?? [], gs);
    if (!row || row.status === 'unsubscribed' || !asked.length) {
      return page('Link expired', '<h1 class="h2">That link has expired.</h1><p>Links last 7 days.</p><p><a class="btn" href="/subscribe">Sign up again</a></p>', 400);
    }
    // Confirming adds to what someone already confirmed; it never drops a list they chose before.
    const topics = clean([...(row.status === 'confirmed' ? row.topics.split(',') : []), ...asked], gs);
    q("UPDATE subscribers SET status = 'confirmed', topics = ?, confirmed_at = ?, confirmed_ip = ?, unsub_at = NULL WHERE id = ?")
      .run(topics.join(','), Date.now(), clientIp(req), row.id);
    return page('You’re subscribed', `<h1 class="h2">You’re subscribed.</h1><p>You’ll get: ${esc(topicLabels(topics, gs))}.</p>`
      + `<p><a class="link link-arrow" href="${esc(prefsUrl(row.id).slice(base.length))}">Manage topics</a></p>`);
  }

  async function preferences(req, url) {
    const t = url.searchParams.get('t');
    const v = verifyToken(secret, 'p', t);
    const row = v && subscriber(v.id);
    if (!row) return deadLink();
    if (req.method === 'GET') return row.status === 'unsubscribed' ? unsubscribedPage() : prefsPage(row, t, { first: url.searchParams.get('u') === '1' });
    const f = await readForm(req);
    const topics = clean(f?.all('topic') ?? []);
    if (!f || f.get('do') === 'unsub' || !topics.length) { unsubscribe(row.id); return unsubscribedPage(); }
    if (row.status === 'unsubscribed') return unsubscribedPage(); // coming back needs a fresh opt-in on /subscribe
    q('UPDATE subscribers SET topics = ? WHERE id = ?').run(topics.join(','), row.id);
    return prefsPage(subscriber(row.id), t, { saved: true });
  }

  // RFC 8058 one-click: the mail client POSTs "List-Unsubscribe=One-Click"; no page, no second step.
  function oneClick(url) {
    const v = verifyToken(secret, 'p', url.searchParams.get('t'));
    if (!v || !subscriber(v.id)) return new Response('Bad link', { status: 400, headers: HEAD });
    unsubscribe(v.id);
    return new Response('Unsubscribed', { status: 200, headers: { ...HEAD, 'Content-Type': 'text/plain' } });
  }

  // ---------- Queue ----------
  function enqueueBlast({ topics, subject, body, priority = 0, createdBy = '', label = '' }) {
    if (!mailer) throw notConfigured();
    const tp = clean(topics);
    const s = line(subject, 100);
    const b = multiline(body, 10000);
    if (!tp.length || !s || !b) throw Object.assign(new Error('topics, subject and body are required'), { code: 'invalid' });
    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      const id = q('INSERT INTO campaigns (subject, body, topics, priority, label, created_by, created_at, recipients) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
        .run(s, b, tp.join(','), priority ? 1 : 0, line(label, 24), line(createdBy, 254), now).lastInsertRowid;
      // One row per confirmed person, however many of the topics they have: that is the de-dup.
      const n = q(`INSERT OR IGNORE INTO queue (campaign_id, subscriber_id, status, attempts, next_at) SELECT ?, id, 'queued', 0, ? FROM subscribers WHERE status = 'confirmed' AND ${hasTopic(tp)}`)
        .run(id, now, ...tp).changes;
      q('UPDATE campaigns SET recipients = ? WHERE id = ?').run(n, id);
      db.exec('COMMIT');
      return { campaignId: id, recipients: n };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  const countRecipients = (topics) => {
    const tp = clean(topics);
    return tp.length ? q(`SELECT COUNT(*) n FROM subscribers WHERE status = 'confirmed' AND ${hasTopic(tp)}`).get(...tp).n : 0;
  };

  /** The email for one queue row, or null when the person is on none of its lists any more (or the group is gone). */
  function blastMessage(r, gs) {
    const mine = clean(r.ctopics, gs).filter((k) => r.stopics.split(',').includes(k));
    if (!mine.length) return null;
    const prefs = prefsUrl(r.sid);
    const unsub = `${base}/email/unsubscribe?t=${new URL(prefs).searchParams.get('t')}`;
    const m = renderEmail({ church, logo, subject: r.subject, body: r.body, label: r.label, footer: { topics: whyLabels(mine, gs), site, unsub: `${prefs}&u=1`, prefs } });
    return { to: r.email, subject: r.subject, ...m,
      headers: { 'List-Unsubscribe': `<${unsub}>, <mailto:${unsubMailbox}?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
  }

  /** How many may go now under both caps; queue sends and direct sends share the relay's quota. */
  function budget(now) {
    while (direct.length && direct[0] <= now - HOUR) direct.shift();
    const sent = (since) => q("SELECT COUNT(*) n FROM queue WHERE status = 'sent' AND sent_at > ?").get(since).n + direct.filter((t) => t > since).length;
    return Math.max(0, Math.min(perHour - sent(now - HOUR), perMin - sent(now - MIN)));
  }

  let busy = false;
  let pruned = 0;
  /** One drain pass. Alerts-topic campaigns (priority 1) first, then oldest campaign, then queue order. */
  async function tick(now = Date.now()) {
    if (busy || !mailer) return 0;
    busy = true;
    try {
      if (now - pruned > HOUR) { // the send log keeps 180 days
        pruned = now;
        q('DELETE FROM queue WHERE campaign_id IN (SELECT id FROM campaigns WHERE created_at < ?)').run(now - KEEP);
        q('DELETE FROM campaigns WHERE created_at < ?').run(now - KEEP);
      }
      const n = budget(now);
      if (!n) return 0;
      const rows = q(`SELECT q.id, q.attempts, c.subject, c.body, c.label, c.topics ctopics, s.id sid, s.email, s.topics stopics, s.status sstatus
        FROM queue q JOIN campaigns c ON c.id = q.campaign_id JOIN subscribers s ON s.id = q.subscriber_id
        WHERE q.status = 'queued' AND q.next_at <= ? ORDER BY c.priority DESC, c.id, q.id LIMIT ?`).all(now, n);
      const done = q("UPDATE queue SET status = ?, attempts = ?, next_at = ?, last_error = ?, sent_at = ? WHERE id = ?");
      const gs = groups();
      for (const r of rows) {
        const msg = r.sstatus === 'confirmed' && blastMessage(r, gs);
        if (!msg) { done.run('failed', r.attempts, now, r.sstatus === 'confirmed' ? 'No longer on this list' : 'Unsubscribed before it was sent', null, r.id); continue; }
        try {
          await deliver(msg);
          done.run('sent', r.attempts + 1, now, null, now, r.id);
        } catch (e) {
          const a = r.attempts + 1;
          const final = a >= 5 || e?.responseCode in PERMANENT;
          done.run(final ? 'failed' : 'queued', a, final ? now : now + RETRY[a - 1], reason(e), null, r.id);
          if (e?.code === 'ECONNECTION' || e?.code === 'EAUTH') { say(`email: relay problem: ${reason(e)}`); break; }
        }
      }
      return rows.length;
    } finally { busy = false; }
  }

  // ---------- Admin (/api/admin/email/*; B has checked the session and Origin) ----------
  const counts = () => {
    const c = q(`SELECT SUM(status = 'confirmed' AND instr(','||topics||',', ',news,') > 0) news, SUM(status = 'confirmed' AND instr(','||topics||',', ',alerts,') > 0) alerts,
      SUM(status = 'confirmed') total, SUM(status = 'pending') pending, SUM(status = 'unsubscribed') unsubscribed FROM subscribers`).get();
    const types = groupsByType(groups()).map((t) => ({ label: t.label, groups: t.groups.map((g) => ({ key: g.key, name: g.name, n: countRecipients([g.key]) })) }));
    return { news: c.news ?? 0, alerts: c.alerts ?? 0, total: c.total ?? 0, pending: c.pending ?? 0, unsubscribed: c.unsubscribed ?? 0, configured: Boolean(mailer), groups: types };
  };
  const compose = (b) => ({ topics: clean(b?.topics), subject: line(b?.subject, 100), body: multiline(b?.body, 10000) });
  const sample = (b) => renderEmail({ church, logo, subject: b.subject || 'Subject', body: b.body, footer: { topics: whyLabels(b.topics.length ? b.topics : Object.keys(TOPICS), groups()), site, unsub: '#', prefs: '#' } });

  async function adminHandle(req, url, adminEmail) {
    const PRE = '/api/admin/email/';
    if (!url.pathname.startsWith(PRE)) return null;
    const route = `${req.method} ${url.pathname.slice(PRE.length)}`;
    let b = null;
    if (req.method === 'POST') {
      const raw = await req.text();
      try { b = raw.length <= 50000 ? JSON.parse(raw) : null; } catch { b = null; }
      if (!b || typeof b !== 'object') return json({ error: 'bad_request' }, 400);
    }
    switch (route) {
      case 'GET counts': return json(counts());
      case 'GET subscribers': {
        const p = url.searchParams;
        const status = ['pending', 'confirmed', 'unsubscribed'].includes(p.get('status')) ? p.get('status') : null;
        const like = `%${line(p.get('q') ?? '', 100).replace(/[\\%_]/g, '\\$&')}%`;
        const offset = Math.max(0, parseInt(p.get('offset'), 10) || 0);
        const rows = q(`SELECT id, email, topics, status, COALESCE(CASE status WHEN 'confirmed' THEN confirmed_at WHEN 'unsubscribed' THEN unsub_at END, created_at) since
          FROM subscribers WHERE (? IS NULL OR status = ?) AND email LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 51 OFFSET ?`).all(status, status, like, offset);
        const gs = groups();
        return json({ rows: rows.slice(0, 50).map((r) => ({ ...r, topics: topicLabels(r.topics, gs),
          lists: clean(r.topics, gs).filter((k) => k.startsWith('group:')).map((k) => ({ key: k, name: topicLabels([k], gs) })) })), more: rows.length > 50 });
      }
      case 'GET count': return json({ n: countRecipients(String(url.searchParams.get('topics') ?? '').split(',')) });
      case 'POST subscribers/remove-topic': { // take someone off one list (for people who phone the office)
        const row = Number.isInteger(b.id) && subscriber(b.id);
        if (!row || typeof b.topic !== 'string') return json({ error: 'id' }, 400);
        const left = row.topics.split(',').filter((k) => k && k !== b.topic);
        q('UPDATE subscribers SET topics = ? WHERE id = ?').run(left.join(','), row.id);
        if (!clean(left).length) unsubscribe(row.id); // off their last list = no more emails at all
        return json({ ok: true });
      }
      case 'POST invite': { // each address gets a normal confirmation email; nobody is added until they click it
        const gs = groups();
        const topic = clean([b.topic], gs).find((k) => k.startsWith('group:'));
        if (!topic) return json({ error: 'group' }, 400);
        const list = [...new Set((Array.isArray(b.emails) ? b.emails : String(b.emails ?? '').split(/[\s,;]+/)).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
        if (!list.length) return json({ error: 'emails' }, 400);
        if (list.length > 50) return json({ error: 'too_many' }, 400);
        if (!mailer) return json({ error: 'email_not_configured' }, 503);
        const sent = [];
        const skipped = [];
        for (const e of list) {
          const email = okEmail(e);
          // ponytail: invites go out at once within the relay's spare quota; the rest come back to retry, a queue if staff invite hundreds.
          const r = !email ? { why: 'Not an email address' } : !budget(Date.now()) ? { why: 'Sending limit reached. Try these again in a minute.' }
            : await requestConfirm(email, [topic], gs, true);
          if (r.ok) sent.push(email); else skipped.push({ email: e.slice(0, 254), why: r.why });
        }
        return json({ sent, skipped });
      }
      case 'POST subscribers/unsubscribe':
        if (!Number.isInteger(b.id)) return json({ error: 'id' }, 400);
        unsubscribe(b.id);
        return json({ ok: true });
      case 'POST preview': return json({ html: sample(compose(b)).html });
      case 'POST test': {
        const c = compose(b);
        if (!okEmail(adminEmail)) return json({ error: 'no_email' }, 400);
        try { await sendNow({ to: adminEmail, subject: `[Test] ${c.subject || 'Subject'}`, ...sample(c) }); }
        catch (e) { return json({ error: e.code === 'not_configured' ? 'email_not_configured' : 'send_failed', detail: reason(e) }, e.code === 'not_configured' ? 503 : 502); }
        return json({ ok: true, to: adminEmail });
      }
      case 'POST send': {
        const c = compose(b);
        if (!c.topics.length) return json({ error: 'topic' }, 400);
        if (!c.subject) return json({ error: 'subject' }, 400);
        if (!c.body) return json({ error: 'body' }, 400);
        if (!mailer) return json({ error: 'email_not_configured' }, 503);
        if (!countRecipients(c.topics)) return json({ error: 'no_recipients' }, 400);
        return json(enqueueBlast({ ...c, priority: 0, createdBy: adminEmail }));
      }
      case 'GET campaigns': { // last 10 sends with progress, and why each failure failed
        const list = q(`SELECT c.id, c.subject, c.topics, c.created_at, c.recipients, COALESCE(SUM(q.status = 'sent'), 0) sent,
          COALESCE(SUM(q.status = 'failed'), 0) failed, COALESCE(SUM(q.status = 'queued'), 0) queued
          FROM campaigns c LEFT JOIN queue q ON q.campaign_id = c.id GROUP BY c.id ORDER BY c.id DESC LIMIT 10`).all();
        const fails = q(`SELECT s.email, q.last_error reason FROM queue q JOIN subscribers s ON s.id = q.subscriber_id WHERE q.campaign_id = ? AND q.status = 'failed' LIMIT 200`);
        const gs = groups();
        return json({ campaigns: list.map((c) => ({ ...c, topics: topicLabels(c.topics, gs) || 'A list that was removed', failures: c.failed ? fails.all(c.id) : [] })) });
      }
    }
    return json({ error: 'not_found' }, 404);
  }

  /** Direct send, not queued (sign-in links, tests). Counts toward the rate caps. */
  async function sendNow({ to, subject, text, html }) {
    if (!okEmail(to)) throw Object.assign(new Error('Bad address'), { code: 'invalid' });
    await deliver({ to, subject: line(subject, 200), text, html });
    direct.push(Date.now());
  }

  let timer = null;
  const run = () => tick().catch((e) => say(`email: queue: ${e?.message}`));
  return {
    configured: Boolean(mailer),
    migrate() {
      db.exec(`CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, topics TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')), created_at INTEGER NOT NULL, confirmed_at INTEGER, confirmed_ip TEXT, unsub_at INTEGER);
        CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL, topics TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
          label TEXT NOT NULL DEFAULT '', created_by TEXT, created_at INTEGER NOT NULL, recipients INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, subscriber_id INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')), attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL,
          last_error TEXT, sent_at INTEGER, UNIQUE (campaign_id, subscriber_id));
        CREATE INDEX IF NOT EXISTS queue_due ON queue (status, next_at);
        CREATE INDEX IF NOT EXISTS queue_sent ON queue (sent_at);`);
    },
    async handle(req, url) {
      const p = url.pathname;
      if (p === '/api/subscribe' && req.method === 'POST') return subscribe(req);
      if (p === '/api/email/groups' && req.method === 'GET') return json({ types: groupsByType(groups()) }); // "My groups" on /subscribe
      if (p === '/subscribe/confirm' && req.method === 'GET') return confirm(req, url);
      if (p === '/email/preferences' && (req.method === 'GET' || req.method === 'POST')) return preferences(req, url);
      if (p === '/email/unsubscribe' && req.method === 'POST') return oneClick(url);
      // Someone opening the List-Unsubscribe URL in a browser: show the page; never act on a GET.
      if (p === '/email/unsubscribe' && req.method === 'GET') return Response.redirect(`${base}/email/preferences?t=${encodeURIComponent(url.searchParams.get('t') ?? '')}&u=1`, 303);
      return null;
    },
    adminHandle,
    adminPartial: () => adminSection({ topics: TOPICS }),
    enqueueBlast: async (o) => enqueueBlast(o),
    countRecipients,
    sendNow,
    tick,
    start() { if (!timer) { timer = setInterval(run, 15000); timer.unref?.(); setTimeout(run, 1000).unref?.(); } },
    stop() { clearInterval(timer); timer = null; mailer?.close?.(); },
  };
}

const PAGE_CSS = `.email-card{display:grid;gap:1rem;max-width:36rem;margin-inline:auto}
.email-card form{display:grid;gap:1rem}
.email-card fieldset{border:0;padding:0;display:grid;gap:.25rem}
.email-card legend{padding:0;margin-bottom:.4rem;font-weight:700}
.email-card .topic{display:flex;gap:.75rem;align-items:center;min-height:48px;cursor:pointer;font-size:var(--step-0)}
.email-card .topic input{width:22px;height:22px;accent-color:var(--gold-ink)}
.email-card hr{border:0;border-top:1px solid var(--line);margin:.5rem 0}
.email-card .btn{justify-self:start}
.email-card .topic-type{margin-top:.5rem;font-size:var(--step--1);font-weight:700;color:var(--muted)}`;
