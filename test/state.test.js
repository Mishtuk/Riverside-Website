// node --test: the pure logic behind alerts, groups (types, news, events), and overrides.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeAlerts, addNews, groupAlerts, siteAlerts, applyOverride, bodyHtml, boardHtml, groupStatus, imageType, slugify, upcomingEvents,
  validateAlert, validateEvent, validateGroups, validateNews, MAX_NEWS,
} from '../src/lib/state.js';

const NOW = Date.parse('2026-10-18T15:00:00Z');
const C = { email: 'office@example.org', phone: '555-0100', involved: '/get-involved', groups: '/groups' };

test('groups: slug from the name, unique, never a page id, kept on rename', () => {
  assert.equal(slugify('Sunday Prayer Group!'), 'sunday-prayer-group');
  assert.equal(slugify('Café  Night'), 'cafe-night');
  assert.equal(slugify('Main'), 'main-group'); // would clash with the skip link target
  assert.equal(slugify('ESL', new Set(['esl', 'esl-2'])), 'esl-3');
  assert.equal(slugify('!!!'), 'group');
  const [first] = validateGroups([{ name: 'Tuesday ESL', type: 'esl', day: 2, status: { kind: 'meeting' } }], [], new Date(NOW)).value;
  assert.equal(first.id, 'tuesday-esl');
  const [renamed] = validateGroups([{ ...first, name: 'Evening ESL' }], [first], new Date(NOW)).value;
  assert.equal(renamed.id, 'tuesday-esl', 'shared /groups#slug links keep working');
  assert.equal(validateGroups([{ ...first, type: 'nonsense' }], [first]).value[0].type, 'other');
  assert.equal(validateGroups([first, first], [first]).error, 'group', 'no duplicate ids');
});

test('groups: news is kept server-side, newest first, capped', () => {
  const g = { id: 'prayer', name: 'Prayer', type: 'prayer', day: 0, status: { kind: 'meeting' }, news: [{ id: 'n1', date: '2026-10-01T12:00:00Z', title: 'Old' }] };
  // The client cannot rewrite news through a group save.
  assert.deepEqual(validateGroups([{ ...g, news: [{ id: 'x', title: 'forged' }] }], [g]).value[0].news, g.news);
  const v = validateNews({ title: '  Prayer walk <script>x</script> ', body: 'Line one\r\nline two\n\nSee https://example.org/a?b=1&c=2.' }, new Date(NOW));
  assert.equal(v.value.title, 'Prayer walk x');
  assert.equal(v.value.date, new Date(NOW).toISOString(), 'date is stamped by the server');
  assert.equal(validateNews({ title: ' ' }).error, 'title');
  let news = [];
  for (let i = 0; i < MAX_NEWS + 1; i++) news = addNews(news, { id: `n${i}` });
  assert.equal(news.length, MAX_NEWS);
  assert.equal(news[0].id, `n${MAX_NEWS}`);
  assert.equal(news.at(-1).id, 'n1', 'the oldest drops off');
});

test('post bodies: paragraphs, line breaks, links; everything else escaped', () => {
  assert.equal(bodyHtml('Hi <b>there</b>\nline 2\n\nSecond'), '<p>Hi &lt;b&gt;there&lt;/b&gt;<br>line 2</p><p>Second</p>');
  assert.equal(bodyHtml('Go to https://example.org/a?b=1&c=2.'),
    '<p>Go to <a class="link" href="https://example.org/a?b=1&amp;c=2" rel="noopener">https://example.org/a?b=1&amp;c=2</a>.</p>');
  assert.equal(bodyHtml('javascript:alert(1)'), '<p>javascript:alert(1)</p>');
  assert.equal(bodyHtml('"https://x.org" onmouseover=1'), '<p>&quot;<a class="link" href="https://x.org" rel="noopener">https://x.org</a>&quot; onmouseover=1</p>');
});

test('board: a section per type in fixed order, each card anchored, latest post shown', () => {
  const now = new Date(NOW);
  const groups = [
    { id: 'kids', type: 'kids', name: 'Kids', day: 0, status: { kind: 'meeting' } },
    { id: 'tuesday-esl', type: 'esl', name: 'ESL <i>', day: 2, status: { kind: 'meeting' }, news: [{ id: 'a', date: '2026-10-16T14:00:00Z', title: 'Room change', body: 'Now in **Room 2**' }] },
    { id: 'prayer', type: 'prayer', name: 'Prayer', day: 0, status: { kind: 'meeting' } },
  ];
  const html = boardHtml(groups, now, C);
  const order = [...html.matchAll(/<h2 class="h2" id="t-(\w+)">/g)].map((m) => m[1]);
  assert.deepEqual(order, ['prayer', 'esl', 'kids']);
  assert.match(html, /<article class="card group" id="tuesday-esl" tabindex="-1">/);
  assert.match(html, /<h3 class="h3">ESL &lt;i&gt;<\/h3>/);
  assert.match(html, /Latest<\/span> Oct 16 &middot; Room change/);
  assert.match(html, /News &amp; updates \(1\)/);
  assert.match(html, /href="\/groups#tuesday-esl"/);
  assert.match(boardHtml([groups[0]], now, C), /No updates yet\. Questions\? <a class="link" href="mailto:office@example.org">Contact us<\/a>/);
  assert.doesNotMatch(boardHtml(groups, null, C), /board-summary/, 'static fallback makes no claims');
});

test('group alerts: pinned on the right group, site-wide only when ticked, gone after expiry', () => {
  const now = new Date(NOW);
  const ids = ['prayer', 'kids'];
  const base = { type: 'urgent', message: 'Not meeting this Sunday.', expires: '2026-10-19T03:59:00Z' };
  assert.equal(validateAlert({ ...base, group: 'nope' }, now, ids).error, 'group', 'the group must exist');
  const pinned = validateAlert({ ...base, group: 'prayer' }, now, ids).value;
  assert.equal(pinned.link, '/groups#prayer', 'links to its own section by default');
  assert.equal(pinned.sitewide, false);
  const wide = validateAlert({ ...base, group: 'kids', sitewide: true, link: '/groups#kids' }, now, ids).value;
  const plain = validateAlert({ ...base, type: 'news', message: 'Picnic' }, now, ids).value;
  assert.equal(plain.group, undefined);
  assert.equal(validateAlert({ ...base, link: '//evil.example' }, now, ids).error, 'link');
  const all = [pinned, wide, plain];
  assert.deepEqual(siteAlerts(all, now).map((a) => a.id).sort(), [wide.id, plain.id].sort(), 'banner: site-wide ones only');
  assert.deepEqual(groupAlerts(all, 'prayer', now).map((a) => a.id), [pinned.id]);
  assert.deepEqual(groupAlerts(all, 'kids', now).map((a) => a.id), [wide.id]);
  const groups = [{ id: 'prayer', type: 'prayer', name: 'Prayer', day: 0, status: { kind: 'meeting' } }, { id: 'kids', type: 'kids', name: 'Kids', day: 0, status: { kind: 'meeting' } }];
  const html = boardHtml(groups, now, C, all);
  const prayerCard = html.slice(html.indexOf('id="prayer"'), html.indexOf('id="t-kids"'));
  assert.match(prayerCard, /<div class="group-alerts"><article class="alert alert-urgent"[\s\S]*Not meeting this Sunday\./);
  assert.doesNotMatch(prayerCard, /Learn more/, 'no link back to the card it is on');
  assert.doesNotMatch(prayerCard, /Picnic/, 'plain alerts are not pinned to groups');
  const later = new Date('2026-10-19T04:00:00Z');
  assert.doesNotMatch(boardHtml(groups, later, C, all), /group-alerts/, 'expired: gone from the card');
  assert.equal(siteAlerts(all, later).length, 0);
});

test('alerts: expired ones stop showing; urgent first, then newest', () => {
  const now = new Date(NOW);
  const list = [
    { id: 'a', type: 'news', created: '2026-10-17T10:00:00Z', expires: '2026-10-19T00:00:00Z' },
    { id: 'b', type: 'urgent', created: '2026-10-16T10:00:00Z', expires: '2026-10-19T00:00:00Z' },
    { id: 'c', type: 'news', created: '2026-10-18T10:00:00Z', expires: '2026-10-25T00:00:00Z' },
    { id: 'old', type: 'urgent', created: '2026-10-10T10:00:00Z', expires: '2026-10-18T14:59:59Z' },
  ];
  assert.deepEqual(activeAlerts(list, now).map((a) => a.id), ['b', 'c', 'a']);
  assert.deepEqual(activeAlerts(list, new Date('2026-10-20T00:00:00Z')).map((a) => a.id), ['c']);
  assert.deepEqual(activeAlerts(undefined, now), []);
});

test('alert input is validated', () => {
  const now = new Date(NOW);
  const ok = { type: 'urgent', message: '  Closed today  ', expires: '2026-10-19T03:59:00Z', link: 'https://example.org/x' };
  assert.equal(validateAlert(ok, now).value.message, 'Closed today');
  assert.equal(validateAlert({ ...ok, type: 'red' }, now).error, 'type');
  assert.equal(validateAlert({ ...ok, message: ' ' }, now).error, 'message');
  assert.equal(validateAlert({ ...ok, expires: '2026-10-18T00:00:00Z' }, now).error, 'expires');
  assert.equal(validateAlert({ ...ok, link: 'javascript:alert(1)' }, now).error, 'link');
  assert.equal(validateAlert({ ...ok, message: 'x'.repeat(500) }, now).value.message.length, 200);
  assert.notEqual(validateAlert(ok, now).value.id, validateAlert(ok, now).value.id, 'every post gets a new id');
});

test('groups: exceptions clear themselves after their date (ET)', () => {
  const at = (iso) => new Date(iso);
  const off = { status: { kind: 'off', date: '2026-10-21' } }; // Wednesday
  assert.equal(groupStatus(off, at('2026-10-19T12:00:00Z')).label, 'Not meeting this week'); // Monday
  assert.equal(groupStatus(off, at('2026-10-22T03:30:00Z')).label, 'Not meeting this week'); // still Wed 11:30pm ET
  assert.equal(groupStatus(off, at('2026-10-22T12:00:00Z')).label, 'Meeting this week'); // Thursday: cleared
  assert.equal(groupStatus(off, at('2026-10-17T12:00:00Z')).label, 'Meeting this week'); // previous week: not yet
  const brk = { status: { kind: 'break', date: '2026-11-01' } };
  assert.equal(groupStatus(brk, at('2026-10-19T12:00:00Z')).label, 'On break until Nov 1');
  assert.equal(groupStatus(brk, at('2026-11-01T12:00:00Z')).label, 'Meeting this week'); // clears on the date
  assert.equal(groupStatus({}, at('2026-10-19T12:00:00Z')).kind, 'meeting');
  assert.equal(groupStatus(off, null).label, 'Check with the office'); // static fallback never claims
});

test('group events: soonest first, past ones drop off (ET), input validated', () => {
  const g = { events: [
    { id: 'c', title: 'Study night', date: '2026-10-28', start: '19:00' },
    { id: 'a', title: 'Picnic', date: '2026-10-21', start: '12:00', end: '14:00' },
    { id: 'b', title: 'Prayer walk', date: '2026-10-21', start: '09:00' },
    { id: 'd', title: 'Later', date: '2026-11-04', start: '19:00' },
  ] };
  const ids = (iso, max) => upcomingEvents(g, new Date(iso), max).map((e) => e.id);
  assert.deepEqual(ids('2026-10-19T12:00:00Z'), ['b', 'a', 'c']); // next 3
  assert.deepEqual(ids('2026-10-22T03:30:00Z', 9), ['b', 'a', 'c', 'd']); // Wed 11:30pm ET: still that day
  assert.deepEqual(ids('2026-10-22T12:00:00Z', 9), ['c', 'd']); // Thursday: Wednesday's events gone
  assert.deepEqual(upcomingEvents(g, null), []); // static fallback shows none
  const today = '2026-10-18';
  assert.equal(validateEvent({ title: 'Picnic <script>x</script>', date: '2026-10-21', start: '12:00' }, today).value.title, 'Picnic x');
  assert.equal(validateEvent({ title: 'Old', date: '2026-10-17', start: '12:00' }, today).value, null);
  assert.equal(validateEvent({ title: 'X', date: '2026-02-31', start: '12:00' }, today).error, 'event');
  assert.equal(validateEvent({ title: 'X', date: '2026-10-21', start: '25:00' }, today).error, 'event');
  assert.equal(validateEvent({ title: 'X', date: '2026-10-21', start: '12:00', end: '11:00' }, today).error, 'event');
  assert.equal(validateEvent({ title: '', date: '2026-10-21', start: '12:00' }, today).error, 'event');
  const html = boardHtml([{ id: 'p', name: 'Prayer', day: 0, time: '9:30am', place: 'Counseling Office', status: { kind: 'meeting' }, events: [{ title: '<b>Night</b>', date: '2026-10-21', start: '18:30' }] }],
    new Date('2026-10-19T12:00:00Z'), { email: 'e@x.org', phone: '1', involved: '/' });
  assert.match(html, /&lt;b&gt;Night&lt;\/b&gt;<\/strong><span>Wed, Oct 21, 6:30pm &middot; Counseling Office/);
});

test('groups: "Updated" only changes when the group changed', () => {
  const t1 = new Date('2026-10-10T12:00:00Z');
  const t2 = new Date('2026-10-16T12:00:00Z');
  const g = { id: 'prayer', name: 'Sunday prayer group', day: 0, time: '9:30–10:30am', place: 'Counseling Office', note: '', status: { kind: 'meeting' } };
  const [saved] = validateGroups([g], [{ id: 'prayer' }], t1).value; // a known group keeps its id
  assert.equal(saved.updated, t1.toISOString());
  assert.equal(validateGroups([g], [saved], t2).value[0].updated, t1.toISOString());
  assert.equal(validateGroups([{ ...g, status: { kind: 'off', date: '2026-10-18' } }], [saved], t2).value[0].updated, t2.toISOString());
  assert.equal(validateGroups([{ ...g, status: { kind: 'off' } }], [], t2).error, 'date');
  assert.equal(validateGroups([{ ...g, day: 9 }], [], t2).error, 'group');
});

test('overrides win; removing one falls back to the feed', () => {
  const orig = { title: 'Sunday Service', thumb: 'https://i.ytimg.com/vi/x/hqdefault.jpg' };
  assert.deepEqual(applyOverride(orig, { title: 'Hope in Hard Times', thumb: 'abc-1' }), { title: 'Hope in Hard Times', thumb: '/api/thumb/abc-1' });
  assert.deepEqual(applyOverride(orig, { title: 'Hope' }), { title: 'Hope', thumb: orig.thumb });
  assert.deepEqual(applyOverride(orig, undefined), orig);
});

test('thumbnails: magic bytes and 2 MB limit', () => {
  const pad = (b) => new Uint8Array([...b, ...new Array(12).fill(0)]).buffer;
  assert.equal(imageType(pad([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(imageType(pad([0x89, 0x50, 0x4e, 0x47])), 'image/png');
  assert.equal(imageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ').buffer), 'image/webp');
  assert.equal(imageType(new TextEncoder().encode('<svg onload=alert(1)>').buffer), null);
  const big = new Uint8Array(2 * 1024 * 1024 + 1); big.set([0xff, 0xd8, 0xff]);
  assert.equal(imageType(big.buffer), null);
});

test('church events: validated at the boundary', async () => {
  const { validateChurchEvent } = await import('../src/lib/state.js');
  const today = '2026-10-19';
  const ok = { title: 'Fall picnic', date: '2026-10-24', start: '12:00', end: '14:00', major: true, link: '/events' };
  assert.equal(validateChurchEvent(ok, today).value.major, true);
  assert.equal(validateChurchEvent({ ...ok, title: ' ' }, today).error, 'title');
  assert.equal(validateChurchEvent({ ...ok, date: '2026-02-31' }, today).error, 'date');
  assert.equal(validateChurchEvent({ ...ok, date: '2026-10-18' }, today).error, 'past');
  assert.equal(validateChurchEvent({ ...ok, end: '11:00' }, today).error, 'time', 'end before start');
  assert.equal(validateChurchEvent({ ...ok, start: '' }, today).error, 'time', 'an end needs a start');
  assert.equal(validateChurchEvent({ ...ok, link: 'javascript:alert(1)' }, today).error, 'link');
  assert.equal(validateChurchEvent({ ...ok, title: '<b>Picnic</b>' }, today).value.title, 'Picnic');
});

test('coming up: church + group events + this week\'s meetings, soonest first, majors first on a day, past ones gone (ET)', async () => {
  const { upcomingItems, homeEventsHtml, eventsPageHtml } = await import('../src/lib/state.js');
  const events = [
    { id: 'b', title: 'Choir night', date: '2026-10-21', start: '19:00' },
    { id: 'a', title: 'Fall picnic', date: '2026-10-21', start: '20:00', major: true },
    { id: 'old', title: 'Yesterday', date: '2026-10-18' },
  ];
  const groups = [
    { id: 'prayer', name: 'Sunday prayer group', day: 0, time: '9:30–10:30am', place: 'Counseling Office', status: { kind: 'meeting' }, events: [{ id: 'g1', title: 'Prayer walk', date: '2026-10-20', start: '08:00' }] },
    { id: 'esl', name: 'ESL', day: 2, time: '7pm', status: { kind: 'off', date: '2026-10-20' } }, // not meeting this week
  ];
  const mon = new Date('2026-10-19T16:00:00Z'); // Monday noon ET
  const keys = upcomingItems(events, groups, mon).map((i) => i.key);
  assert.deepEqual(keys, ['gev-prayer-g1', 'ev-a', 'ev-b', 'meet-prayer'], 'major first on Wed; the prayer meeting is next Sunday; ESL is off');
  const thuLate = new Date('2026-10-22T03:30:00Z'); // Wed 11:30pm ET: Wednesday's events still on
  assert.ok(upcomingItems(events, groups, thuLate).some((i) => i.key === 'ev-a'));
  assert.ok(!upcomingItems(events, groups, new Date('2026-10-22T12:00:00Z')).some((i) => i.key === 'ev-a'), 'gone the next day');
  const c = { email: 'office@example.org', times: 'Sundays 9:00 & 10:30am', groups: '/groups', events: '/events' };
  const home = homeEventsHtml(upcomingItems(events, groups, mon), [], mon, c);
  assert.match(home, /<ul class="cu-cards"[\s\S]*Fall picnic/, 'major as a card');
  assert.match(home, /Major event/);
  assert.match(home, /href="\/groups#prayer">See the group<span class="sr-only"> Sunday prayer group<\/span>/);
  assert.match(home, /Wed, Oct 21 &middot; 8pm &middot;/, '12-hour times');
  assert.equal(homeEventsHtml([], [], mon, c), '', 'nothing on: no section at all');
  assert.match(eventsPageHtml([], c), /No special events right now\. Join us Sundays 9:00 &amp; 10:30am\./);
  assert.match(eventsPageHtml(upcomingItems(events, groups, mon), c), /October 2026[\s\S]*id="ev-a"/);
});

test('pop-up: only active site-wide alerts ticked "pop-up"; an edit keeps its seen-key unless "Show again"', async () => {
  const { majorAlerts, popupHtml, carryPopKey } = await import('../src/lib/state.js');
  const now = new Date(NOW);
  const ids = ['prayer'];
  const base = { type: 'urgent', message: 'Closed today: snow.', expires: '2026-10-19T03:59:00Z' };
  const pop = validateAlert({ ...base, popup: true }, now, ids).value;
  const plain = validateAlert(base, now, ids).value;
  const groupOnly = validateAlert({ ...base, group: 'prayer', popup: true }, now, ids).value;
  const groupWide = validateAlert({ ...base, group: 'prayer', sitewide: true, popup: true }, now, ids).value;
  assert.equal(groupOnly.popup, undefined, 'group-only alerts never pop up');
  assert.deepEqual(majorAlerts([pop, plain, groupOnly, groupWide], now).map((a) => a.id).sort(), [pop.id, groupWide.id].sort());
  assert.deepEqual(majorAlerts([pop], new Date('2026-10-19T04:00:00Z')), [], 'expired: no pop-up');
  const html = popupHtml([pop]);
  assert.match(html, /<dialog class="card alert-pop" id="alert-pop" aria-labelledby="alert-pop-h">/);
  assert.match(html, new RegExp(`data-key="${pop.popKey}"`));
  assert.equal(popupHtml([]), '');
  const edited = validateAlert({ ...base, message: 'Closed today and tomorrow.', popup: true }, now, ids).value;
  assert.equal(carryPopKey(edited, pop, false).popKey, pop.popKey, 'edit: people who closed it are not shown it again');
  assert.equal(carryPopKey(edited, pop, true).popKey, edited.id, '"Show again": new key');
});

test('team: one render for static + server; photos must be ours; ids kept', async () => {
  const { teamSeed, teamHtml, validateTeam } = await import('../src/lib/state.js');
  const seed = teamSeed([{ name: 'Ezra Strickhouser', title: 'Lead Pastor', bio: 'Bio.' }, { name: 'Paul Leese', title: 'Elder', bio: 'Bio 2.' }]);
  assert.deepEqual(seed.map((m) => m.id), ['ezra', 'paul']);
  assert.match(teamHtml(seed), /<article class="lead" id="ezra">[\s\S]*<ul class="team"><li class="member" id="paul">/);
  assert.equal(validateTeam([{ ...seed[1], photo: 'https://evil.example/x.jpg' }], seed).error, 'photo');
  assert.equal(validateTeam([{ ...seed[1], photo: '/api/photo/team-abc123.jpg' }], seed).value[0].photo, '/api/photo/team-abc123.jpg');
  const [first] = validateTeam([{ ...seed[1], name: 'Paul A. Leese' }, seed[0]], seed).value;
  assert.equal(first.id, 'paul', 'a rename keeps the anchor');
  assert.equal(validateTeam([], seed).error, 'team');
  assert.match(teamHtml([{ id: 'x', name: 'A <b>', role: 'R', bio: 'B', photo: '' }]), /class="lead no-photo"[\s\S]*A &lt;b&gt;/);
});
