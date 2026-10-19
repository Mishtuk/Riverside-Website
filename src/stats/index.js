// Statistics for the staff admin: visitors, plays started on our site, YouTube views and email subscribers.
// Visitors are counted on the server from HTML page requests: no cookies, no client script, no third party.
// A visitor code = sha256(today's salt + host + IP + browser), the salt lives in memory for one Eastern day and is
// never written down, so the code can't be reversed or followed across days. Only daily totals are stored.
// The server imports only createStats(). Env: YOUTUBE_API_KEY (optional), YOUTUBE_CHANNEL_ID (optional, else site facts).
import { createHash, randomBytes } from 'node:crypto';
import { TZ, etDay } from '../lib/state.js';
import { COOKIE } from '../auth.js';
import { CHURCH } from '../lib/church.js';
import { TOPICS, groupsByType } from '../email/topics.js';
import { statsSection } from './admin.js';

const MIN = 6e4, HOUR = 36e5;
export const KINDS = ['video', 'live', 'podcast']; // live = someone opened the live hero; counted with video
// Things that aren't people. Cheap and honest, not exhaustive.
const BOT = /bot|crawl|spider|slurp|scrap|preview|curl|wget|python|httpclient|java\/|go-http|okhttp|axios|node-fetch|monitor|uptime|pingdom|headless|lighthouse|ptst|facebookexternalhit|embedly|whatsapp|scan/i;
export const isBot = (ua) => !ua || ua.length < 12 || BOT.test(ua);

// Friendly names for the top-pages list; anything else is named from its last path segment.
const PAGES = {
  '/': 'Home', '/im-new': 'I’m New', '/about': 'About', '/about/beliefs': 'Beliefs', '/about/core-values': 'Core values', '/about/gospel': 'The gospel',
  '/about/faith-and-politics': 'Faith and politics', '/about/partnerships': 'Partnerships', '/watch': 'Watch', '/podcast': 'Podcast',
  '/get-involved': 'Get Involved', '/groups': 'Groups', '/events': 'Events', '/give': 'Give', '/connect': 'Connect', '/subscribe': 'Subscribe',
};
export const pageName = (p) => PAGES[p] ?? (p.split('/').filter(Boolean).pop() ?? '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const etHour = (now) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now).padStart(2, '0');
/** The instant Eastern midnight starts on `ymd` (handles daylight saving). */
export const etMidnight = (ymd) => { const g = Date.parse(`${ymd}T05:00:00Z`); return g - +etHour(g) * HOUR; };

/** Range key -> first and last Eastern day and the chart unit. "Last day" = today so far. */
export function rangeOf(range, now = new Date(), firstDay = null) {
  const end = etDay(now);
  const back = { day: 0, '7d': 6, '30d': 29, '12m': 364 }[range];
  const start = back === undefined ? (firstDay && firstDay < end ? firstDay : end) : addDays(end, -back);
  return { range: back === undefined ? 'all' : range, start, end, unit: range === 'day' ? 'hour' : back === undefined || range === '12m' ? 'month' : 'day' };
}

/** Lifetime counters sampled once a day: views in [start, end] = last sample on/before end minus last sample before start.
 *  With no sample before the range, it counts from the first sample in it, and says so (`since`). */
export function snapshotDiff(rows, start, end) {
  const inRange = rows.filter((r) => r.day <= end).sort((a, b) => a.day.localeCompare(b.day));
  const last = inRange.at(-1);
  const before = inRange.filter((r) => r.day < start).at(-1);
  const first = before ?? inRange.find((r) => r.day >= start);
  if (!last || !first) return null;
  return { n: Math.max(0, last.n - first.n), since: before ? null : first.day };
}

const header = (r, name) => String((typeof r?.headers?.get === 'function' ? r.headers.get(name) : r?.headers?.[name]) ?? '');

export function createStats({ db, env = {}, log = console, getGroups = () => [], now: clock = () => new Date() }) {
  const say = (...a) => (typeof log === 'function' ? log : log?.log ?? console.log)(...a);
  const q = (sql) => db.prepare(sql);
  const groups = () => { try { return getGroups() ?? []; } catch { return []; } };

  // ---------- today's visitors (memory only) ----------
  let today = { day: '', salt: null, seen: new Set() };
  function visitor(req, now) {
    const day = etDay(now);
    if (today.day !== day) today = { day, salt: randomBytes(32), seen: new Set() }; // yesterday's salt is gone for good
    // Azure's front end appends the client address last ("ip:port"); direct connections fall back to the socket.
    const ip = header(req, 'x-forwarded-for').split(',').pop().trim().replace(/:\d+$/, '') || req.socket?.remoteAddress || '';
    const id = createHash('sha256').update(today.salt).update(`|${header(req, 'host')}|${ip}|${header(req, 'user-agent')}`).digest('base64url').slice(0, 22);
    const fresh = !today.seen.has(id);
    if (fresh) today.seen.add(id);
    return { id, fresh, day };
  }
  const isStaff = (req) => new RegExp(`(^|;\\s*)${COOKIE}=`).test(header(req, 'cookie'));
  const skip = (req, staff) => staff || isStaff(req) || header(req, 'sec-gpc') === '1' || header(req, 'dnt') === '1'
    || /prefetch|prerender/i.test(header(req, 'sec-purpose') + header(req, 'purpose')) || isBot(header(req, 'user-agent'));

  // Counts wait in memory and are written once a minute (fewer writes on the App Service file share).
  const pending = new Map();
  const add = (day, metric, item = '') => { const k = `${day}\u0000${metric}\u0000${item}`; pending.set(k, (pending.get(k) ?? 0) + 1); };
  function flush() {
    if (!pending.size) return;
    const up = q('INSERT INTO stats_daily (day, metric, item, n) VALUES (?, ?, ?, ?) ON CONFLICT (day, metric, item) DO UPDATE SET n = n + excluded.n');
    db.exec('BEGIN');
    try { for (const [k, n] of pending) up.run(...k.split('\u0000'), n); db.exec('COMMIT'); pending.clear(); }
    catch (e) { db.exec('ROLLBACK'); say(`stats: flush failed: ${e.message}`); }
  }

  /** A page view. Call after serving an HTML response. Counts GET 200 HTML pages only, never /admin or /api. */
  function record(req, res, { staff = false } = {}) {
    try {
      if ((req?.method ?? 'GET') !== 'GET') return false;
      if ((res?.status ?? res?.statusCode ?? 200) !== 200) return false;
      const type = String((typeof res?.getHeader === 'function' ? res.getHeader('content-type') : header(res, 'content-type')) ?? '');
      if (type && !type.includes('text/html')) return false;
      let path = new URL(req.url, 'http://x').pathname.toLowerCase();
      path = path.length > 1 ? path.replace(/\/(index\.html)?$/, '') || '/' : path;
      if (path.length > 100 || !/^\/[a-z0-9/_-]*$/.test(path) || /^\/(admin|api|shell)(\/|$)/.test(path)) return false;
      if (skip(req, staff)) return false;
      const now = clock();
      const v = visitor(req, now);
      add(v.day, 'views');
      add(v.day, 'page', path);
      if (v.fresh) { add(v.day, 'visitors'); add(v.day, 'hour', etHour(now)); }
      return true;
    } catch (e) { say(`stats: ${e.message}`); return false; } // counting must never break a page
  }

  // ---------- play beacon: POST /api/stats/play, body = kind ----------
  const plays = new Map(); // visitor code -> recent play times (memory only, cleared daily with the codes)
  async function handle(req, url) {
    if (url.pathname !== '/api/stats/play') return null;
    const done = (status) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
    if (req.method !== 'POST') return done(405);
    let origin;
    try { origin = new URL(header(req, 'origin')).host; } catch { origin = ''; }
    if (!origin || origin !== url.host) return done(403); // only our own pages
    if (+header(req, 'content-length') > 64) return done(413);
    const body = await req.text();
    if (body.length > 64) return done(413);
    const kind = body.trim();
    if (!KINDS.includes(kind)) return done(400);
    if (skip(req)) return done(204);
    const now = clock();
    const v = visitor(req, now);
    if (plays.size > 20000 || plays.day !== v.day) { plays.clear(); plays.day = v.day; }
    const recent = (plays.get(v.id) ?? []).filter((t) => t > +now - HOUR);
    if (recent.length >= 20) return done(429); // one person, 20 plays an hour at most
    plays.set(v.id, [...recent, +now]);
    add(v.day, 'play', kind);
    return done(204);
  }

  // ---------- YouTube: one lifetime snapshot a day (API key only, no owner sign-in) ----------
  const channelId = () => env.YOUTUBE_CHANNEL_ID || String(CHURCH.socials?.youtube ?? '').match(/channel\/(UC[\w-]{22})/)?.[1] || '';
  async function snapshot(now = clock()) {
    const key = env.YOUTUBE_API_KEY;
    const ch = channelId();
    if (!key || !ch) return false;
    const day = etDay(now);
    if (q("SELECT 1 FROM stats_daily WHERE day = ? AND metric = 'yt' AND item = 'channel'").get(day)) return false;
    const api = async (path) => {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(key)}`);
      if (!r.ok) throw new Error(`YouTube API ${r.status}`);
      return r.json();
    };
    const c = (await api(`channels?part=statistics,contentDetails&id=${ch}`)).items?.[0];
    if (!c) throw new Error('YouTube channel not found');
    const uploads = c.contentDetails?.relatedPlaylists?.uploads;
    const ids = uploads ? (await api(`playlistItems?part=contentDetails&maxResults=10&playlistId=${uploads}`)).items.map((i) => i.contentDetails?.videoId).filter((id) => /^[\w-]{11}$/.test(id ?? '')) : [];
    const vids = ids.length ? (await api(`videos?part=statistics,snippet&id=${ids.join(',')}`)).items : [];
    const set = q("INSERT INTO stats_daily (day, metric, item, n) VALUES (?, 'yt', ?, ?) ON CONFLICT (day, metric, item) DO UPDATE SET n = excluded.n");
    const name = q('INSERT INTO stats_labels (item, label) VALUES (?, ?) ON CONFLICT (item) DO UPDATE SET label = excluded.label');
    set.run(day, 'channel', +c.statistics?.viewCount || 0);
    for (const v of vids) { set.run(day, v.id, +v.statistics?.viewCount || 0); name.run(v.id, String(v.snippet?.title ?? '').slice(0, 200)); }
    return true;
  }

  // ---------- the board's numbers ----------
  const sum = (metric, start, end, item) => q(`SELECT COALESCE(SUM(n), 0) n FROM stats_daily WHERE metric = ? AND day BETWEEN ? AND ?${item ? ' AND item = ?' : ''}`)
    .get(...[metric, start, end, ...(item ? [item] : [])]).n;
  const has = (topic) => "instr(','||topics||',', ','||?||',') > 0";

  function subscribers(start) {
    try {
      const from = etMidnight(start);
      const one = (sql, ...a) => q(sql).get(...a).n ?? 0;
      const total = one("SELECT COUNT(*) n FROM subscribers WHERE status = 'confirmed'");
      const added = one('SELECT COUNT(*) n FROM subscribers WHERE confirmed_at >= ?', from);
      const removed = one("SELECT COUNT(*) n FROM subscribers WHERE status = 'unsubscribed' AND unsub_at >= ?", from);
      // ponytail: per-list change counts confirmations and unsubscribes only; topic edits on the preferences page aren't dated.
      const list = (key, label) => ({ key, label, n: one(`SELECT COUNT(*) n FROM subscribers WHERE status = 'confirmed' AND ${has()}`, key),
        change: one(`SELECT COUNT(*) n FROM subscribers WHERE confirmed_at >= ? AND ${has()}`, from, key) - one(`SELECT COUNT(*) n FROM subscribers WHERE status = 'unsubscribed' AND unsub_at >= ? AND ${has()}`, from, key) });
      return { total, change: added - removed, added, removed,
        lists: Object.entries(TOPICS).map(([k, label]) => list(k, label)),
        groups: groupsByType(groups()).map((t) => ({ label: t.label, lists: t.groups.map((g) => list(g.key, g.name)) })) };
    } catch { return { total: 0, change: 0, added: 0, removed: 0, lists: [], groups: [] }; } // email tables not made yet
  }

  function series(r) {
    if (r.unit === 'hour') {
      const rows = Object.fromEntries(q("SELECT item, n FROM stats_daily WHERE metric = 'hour' AND day = ?").all(r.end).map((x) => [x.item, x.n]));
      return Array.from({ length: +etHour(clock()) + 1 }, (_, h) => ({ key: String(h).padStart(2, '0'), n: rows[String(h).padStart(2, '0')] ?? 0 }));
    }
    const rows = q("SELECT day, n FROM stats_daily WHERE metric = 'visitors' AND day BETWEEN ? AND ?").all(r.start, r.end);
    if (r.unit === 'day') {
      const by = Object.fromEntries(rows.map((x) => [x.day, x.n]));
      const out = [];
      for (let d = r.start; d <= r.end; d = addDays(d, 1)) out.push({ key: d, n: by[d] ?? 0 });
      return out;
    }
    const by = {};
    for (const x of rows) by[x.day.slice(0, 7)] = (by[x.day.slice(0, 7)] ?? 0) + x.n;
    const out = [];
    for (let m = r.start.slice(0, 7); m <= r.end.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) out.push({ key: m, n: by[m] ?? 0 });
    return out;
  }

  function summary(rangeKey) {
    flush();
    const first = q("SELECT MIN(day) d FROM stats_daily WHERE metric IN ('views', 'play')").get().d ?? null;
    const r = rangeOf(rangeKey, clock(), first);
    const yt = (item) => snapshotDiff(q("SELECT day, n FROM stats_daily WHERE metric = 'yt' AND item = ?").all(item), r.start, r.end);
    const ytOn = Boolean(env.YOUTUBE_API_KEY && channelId());
    const ytTop = ytOn ? q("SELECT DISTINCT d.item, l.label FROM stats_daily d JOIN stats_labels l ON l.item = d.item WHERE d.metric = 'yt' AND d.item != 'channel' AND d.day = (SELECT MAX(day) FROM stats_daily WHERE metric = 'yt')").all()
      .map((v) => ({ title: v.label, ...yt(v.item) })).filter((v) => v.n !== undefined).sort((a, b) => b.n - a.n).slice(0, 5) : [];
    return {
      ...r, first,
      views: sum('views', r.start, r.end), visitors: sum('visitors', r.start, r.end),
      plays: { video: sum('play', r.start, r.end, 'video') + sum('play', r.start, r.end, 'live'), podcast: sum('play', r.start, r.end, 'podcast') },
      series: series(r.unit === 'day' && first > r.start ? { ...r, start: first } : r), // no flat line before counting began
      pages: q("SELECT item path, SUM(n) n FROM stats_daily WHERE metric = 'page' AND day BETWEEN ? AND ? GROUP BY item ORDER BY n DESC, item LIMIT 8").all(r.start, r.end)
        .map((p) => ({ name: pageName(p.path), path: p.path, n: p.n })),
      subscribers: subscribers(r.start),
      youtube: { on: ytOn, channel: ytOn ? yt('channel') : null, top: ytTop },
    };
  }

  async function adminHandle(req, url) {
    if (!url.pathname.startsWith('/api/admin/stats/')) return null;
    if (req.method === 'GET' && url.pathname === '/api/admin/stats/summary') {
      const range = ['day', '7d', '30d', '12m', 'all'].includes(url.searchParams.get('range')) ? url.searchParams.get('range') : '30d';
      return Response.json(summary(range), { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const timers = [];
  return {
    migrate() {
      db.exec(`CREATE TABLE IF NOT EXISTS stats_daily (day TEXT NOT NULL, metric TEXT NOT NULL, item TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL,
          PRIMARY KEY (day, metric, item)) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS stats_labels (item TEXT PRIMARY KEY, label TEXT NOT NULL);`);
    },
    record, handle, adminHandle, summary, flush, snapshot,
    adminPartial: () => statsSection(),
    start() {
      if (timers.length) return;
      const yt = () => snapshot().catch((e) => say(`stats: ${e.message}`));
      timers.push(setInterval(flush, MIN), setInterval(yt, HOUR), setTimeout(yt, 10000));
      timers.forEach((t) => t.unref?.());
    },
    stop() { timers.splice(0).forEach((t) => { clearInterval(t); clearTimeout(t); }); flush(); },
  };
}
