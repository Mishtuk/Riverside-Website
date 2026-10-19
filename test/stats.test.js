import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createStats, etMidnight, isBot, rangeOf, snapshotDiff } from '../src/stats/index.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const IP = '203.0.113.77';

function setup(start = '2026-10-19T16:00:00Z') {
  const db = new DatabaseSync(':memory:');
  let now = new Date(start);
  const stats = createStats({ db, log: () => {}, now: () => now });
  stats.migrate();
  const req = (path, headers = {}, method = 'GET') => ({ method, url: path, headers: { host: 'www.example.org', 'user-agent': UA, 'x-forwarded-for': `${IP}:51000`, ...headers } });
  const html = { statusCode: 200, getHeader: () => 'text/html; charset=utf-8' };
  return { db, stats, req, html, tick: (ms) => { now = new Date(+now + ms); }, at: (iso) => { now = new Date(iso); } };
}

test('visitors: once a day per person, new code each day, no IP or browser stored', () => {
  const { db, stats, req, html, at } = setup();
  stats.record(req('/'), html);
  stats.record(req('/groups/'), html);
  stats.record(req('/'), html, {});
  stats.record(req('/', { 'user-agent': `${UA} other` }), html); // a different browser = a different person
  at('2026-10-20T15:00:00Z');
  stats.record(req('/'), html); // next day: the salt is new, so the same person counts again
  const d = stats.summary('7d');
  assert.equal(d.views, 5);
  assert.equal(d.visitors, 3);
  assert.deepEqual(d.pages.map((p) => [p.name, p.n]), [['Home', 4], ['Groups', 1]]);
  const dump = JSON.stringify(db.prepare('SELECT * FROM stats_daily').all()) + JSON.stringify(db.prepare('SELECT * FROM stats_labels').all());
  assert.ok(!dump.includes(IP) && !dump.includes('203.0') && !dump.includes('iPhone'), 'only counts are stored');
  assert.deepEqual(Object.keys(db.prepare('SELECT * FROM stats_daily LIMIT 1').get()), ['day', 'metric', 'item', 'n']);
});

test('skipped: bots, Global Privacy Control, Do Not Track, staff, prefetch, admin, API, errors, non-HTML, non-GET', () => {
  const { stats, req, html } = setup();
  const not = (r, res = html) => assert.equal(stats.record(r, res), false, JSON.stringify(r.headers));
  not(req('/', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }));
  not(req('/', { 'user-agent': 'curl/8.4.0' }));
  not(req('/', { 'user-agent': '' }));
  not(req('/', { 'sec-gpc': '1' }));
  not(req('/', { dnt: '1' }));
  not(req('/', { cookie: 'a=1; rs_admin=abc.def' }));
  not(req('/', { 'sec-purpose': 'prefetch' }));
  not(req('/admin/'));
  not(req('/api/alerts'));
  not(req('/', {}, 'HEAD'));
  not(req('/'), { statusCode: 404, getHeader: () => 'text/html' });
  not(req('/media/hero.mp4'), { statusCode: 200, getHeader: () => 'video/mp4' });
  not(req('/<script>'));
  assert.equal(stats.record(req('/'), { status: 200, headers: new Headers({ 'content-type': 'text/html' }) }, { staff: true }), false);
  assert.equal(stats.record(req('/'), html), true);
  assert.ok(isBot('Mozilla/5.0 (compatible; bingbot/2.0)') && !isBot(UA));
  // Speed tests: Lighthouse, headless Chrome and WebPageTest don't count as visitors.
  for (const ua of ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 PTST/250101.123456']) not(req('/', { 'user-agent': ua }));
});

test('ranges: Eastern days, "Last day" is today, all time starts at the first count, DST-safe midnights', () => {
  const now = new Date('2026-10-20T03:30:00Z'); // still Oct 19 in New York
  assert.deepEqual(rangeOf('day', now), { range: 'day', start: '2026-10-19', end: '2026-10-19', unit: 'hour' });
  assert.deepEqual(rangeOf('7d', now), { range: '7d', start: '2026-10-13', end: '2026-10-19', unit: 'day' });
  assert.equal(rangeOf('30d', now).start, '2026-09-20');
  assert.deepEqual(rangeOf('12m', now), { range: '12m', start: '2025-10-20', end: '2026-10-19', unit: 'month' });
  assert.equal(rangeOf('all', now, '2026-10-01').start, '2026-10-01');
  assert.equal(rangeOf('nonsense', now).range, 'all');
  assert.equal(new Date(etMidnight('2026-07-01')).toISOString(), '2026-07-01T04:00:00.000Z'); // EDT
  assert.equal(new Date(etMidnight('2026-12-01')).toISOString(), '2026-12-01T05:00:00.000Z'); // EST
});

test('YouTube: views in a range = difference between daily lifetime snapshots', () => {
  const rows = [{ day: '2026-10-01', n: 1000 }, { day: '2026-10-10', n: 1300 }, { day: '2026-10-19', n: 1450 }];
  assert.deepEqual(snapshotDiff(rows, '2026-10-11', '2026-10-19'), { n: 150, since: null });
  assert.deepEqual(snapshotDiff(rows, '2026-10-02', '2026-10-10'), { n: 300, since: null });
  assert.deepEqual(snapshotDiff(rows, '2026-09-01', '2026-10-19'), { n: 450, since: '2026-10-01' }, 'no earlier snapshot: counts from the first and says so');
  assert.equal(snapshotDiff(rows, '2026-08-01', '2026-08-31'), null);
  assert.deepEqual(snapshotDiff([{ day: '2026-10-19', n: 5 }, { day: '2026-10-18', n: 9 }], '2026-10-19', '2026-10-19'), { n: 0, since: null }, 'never negative');
});

test('play beacon: our pages only, known kinds only, rate-limited, private visitors not counted', async () => {
  const { stats, tick } = setup();
  const url = new URL('https://www.example.org/api/stats/play');
  const send = (body, headers = {}, method = 'POST') => stats.handle(new Request(url, { method, body: method === 'POST' ? body : undefined,
    headers: { origin: 'https://www.example.org', 'user-agent': UA, 'x-forwarded-for': IP, 'content-type': 'text/plain', ...headers } }), url);
  assert.equal(await stats.handle(new Request('https://www.example.org/api/other'), new URL('https://www.example.org/api/other')), null);
  assert.equal((await send(null, {}, 'GET')).status, 405);
  assert.equal((await send('video', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await send('video', { origin: '' })).status, 403);
  assert.equal((await send('download')).status, 400);
  assert.equal((await send('video'.repeat(20))).status, 413);
  assert.equal((await send('video', { 'sec-gpc': '1' })).status, 204);
  for (let i = 0; i < 20; i++) assert.equal((await send(i % 2 ? 'live' : 'podcast')).status, 204);
  assert.equal((await send('video')).status, 429, '20 an hour per person');
  tick(61 * 60e3);
  assert.equal((await send('video')).status, 204);
  const d = stats.summary('day');
  assert.deepEqual(d.plays, { video: 11, podcast: 10 }, 'live counts as a video play; the GPC one was not counted');
  assert.equal(d.series.reduce((t, b) => t + b.p, 0), 21, 'the graph has the same plays, by hour');
  assert.equal(stats.summary('7d').series.at(-1).p, 21, 'and by day');
});
