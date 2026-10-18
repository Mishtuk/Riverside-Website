// node --test: the pure logic behind alerts, groups, overrides and the admin token check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAlerts, applyOverride, boardHtml, checkClaims, groupStatus, imageType, upcomingEvents, validateAlert, validateEvent, validateGroups, verifyAccessJwt } from '../src/lib/state.js';

const TEAM = 'https://riverside.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const NOW = Date.parse('2026-10-18T15:00:00Z');

const b64u = (x) => Buffer.from(typeof x === 'string' ? x : new Uint8Array(x)).toString('base64url');
async function keypair(kid) {
  const k = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  return { ...k, jwk: { ...(await crypto.subtle.exportKey('jwk', k.publicKey)), kid, alg: 'RS256' } };
}
async function sign(privateKey, claims, head = { alg: 'RS256', kid: 'k1' }) {
  const data = `${b64u(JSON.stringify(head))}.${b64u(JSON.stringify(claims))}`;
  return `${data}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(data)))}`;
}
const good = { iss: TEAM, aud: [AUD], exp: NOW / 1000 + 600, iat: NOW / 1000, email: 'staff@example.org' };

test('Access claims: issuer, audience and expiry', () => {
  const o = { team: TEAM, aud: AUD, now: NOW };
  assert.ok(checkClaims(good, o));
  assert.ok(checkClaims(good, { ...o, team: `${TEAM}/` }));
  assert.ok(!checkClaims({ ...good, iss: 'https://evil.cloudflareaccess.com' }, o));
  assert.ok(!checkClaims({ ...good, aud: ['other-app'] }, o));
  assert.ok(!checkClaims({ ...good, exp: NOW / 1000 - 1 }, o));
  assert.ok(!checkClaims({ ...good, exp: undefined }, o));
  assert.ok(!checkClaims({ ...good, nbf: NOW / 1000 + 3600 }, o));
});

test('Access JWT: real token passes; missing, forged, tampered and alg=none fail', async () => {
  const real = await keypair('k1');
  const forger = await keypair('k1');
  let fetches = 0;
  const fetchFn = async () => { fetches++; return Response.json({ keys: [real.jwk] }); };
  const opts = { team: TEAM, aud: AUD, now: NOW, fetchFn };

  assert.equal((await verifyAccessJwt(await sign(real.privateKey, good), opts))?.email, 'staff@example.org');
  assert.equal(await verifyAccessJwt(undefined, opts), null);
  assert.equal(await verifyAccessJwt('', opts), null);
  assert.equal(await verifyAccessJwt('not.a.jwt', opts), null);
  assert.equal(await verifyAccessJwt(await sign(forger.privateKey, good), opts), null);
  const [h, , s] = (await sign(real.privateKey, good)).split('.');
  assert.equal(await verifyAccessJwt(`${h}.${b64u(JSON.stringify({ ...good, email: 'attacker@example.org' }))}.${s}`, opts), null);
  assert.equal(await verifyAccessJwt(`${b64u(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${b64u(JSON.stringify(good))}.`, opts), null);
  assert.equal(await verifyAccessJwt(await sign(real.privateKey, { ...good, aud: ['other-app'] }), opts), null);
  assert.equal(await verifyAccessJwt(await sign(real.privateKey, good, { alg: 'RS256', kid: 'unknown' }), opts), null);
  assert.equal(fetches, 1, 'certs are cached; an unknown kid does not refetch within a minute');
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
  const [saved] = validateGroups([g], [], t1).value;
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
