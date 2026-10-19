import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createEmail, signToken, verifyToken } from '../src/email/index.js';
import { bodyHtml, bodyText } from '../src/email/template.js';
import { CHURCH } from '../src/lib/church.js';

const MIN = 6e4, HOUR = 36e5;

function setup({ fail = {}, env = {}, groups = [] } = {}) {
  const db = new DatabaseSync(':memory:');
  const sent = [];
  const transport = { async sendMail(m) { if (fail[m.to]) throw fail[m.to]; sent.push(m); return {}; } };
  const email = createEmail({ db, env: { TOKEN_SECRET: 'test-secret', SEND_RATE_PER_HOUR: '5', SEND_RATE_PER_MIN: '3', ...env }, church: CHURCH,
    publicUrl: 'https://www.example.org', renderPage: (t, inner) => `<title>${t}</title>${inner}`, log: () => {}, transport, getGroups: () => groups });
  email.migrate();
  const add = (addr, topics, status = 'confirmed') => db.prepare('INSERT INTO subscribers (email, topics, status, created_at) VALUES (?, ?, ?, 0)').run(addr, topics, status).lastInsertRowid;
  return { db, sent, email, add, groups };
}

test('tokens: sign, verify, tamper, wrong kind, expiry', () => {
  const t = signToken('k', 'p', 42);
  assert.deepEqual(verifyToken('k', 'p', t), { id: 42, topics: [] });
  assert.equal(verifyToken('other-secret', 'p', t), null);
  assert.equal(verifyToken('k', 'c', t), null, 'a preferences token is not a confirm token');
  const forged = `${Buffer.from('p.43.0.').toString('base64url')}.${t.split('.')[1]}`;
  assert.equal(verifyToken('k', 'p', forged), null, 'changing the id breaks the signature');
  assert.equal(verifyToken('k', 'p', `${t}x`), null);
  assert.equal(verifyToken('k', 'p', 'garbage'), null);
  const c = signToken('k', 'c', 7, { exp: 1000, topics: ['alerts', 'bogus'] });
  assert.deepEqual(verifyToken('k', 'c', c, 999), { id: 7, topics: ['alerts'] });
  assert.equal(verifyToken('k', 'c', c, 1001), null, 'confirm links expire');
});

test('message format: paragraphs, bold, links; everything else escaped', () => {
  const h = bodyHtml('Hi <b>all</b> & "you"\nline two\n\n**Snow** day: see https://example.org/a?x=1&y=2. Or [the page](https://example.org/p)');
  assert.match(h, /^<p[^>]*>Hi &lt;b&gt;all&lt;\/b&gt; &amp; &quot;you&quot;<br>line two<\/p><p/);
  assert.match(h, /<strong>Snow<\/strong> day/);
  assert.match(h, /href="https:\/\/example.org\/a\?x=1&amp;y=2"[^>]*>https:\/\/example.org\/a\?x=1&amp;y=2<\/a>\./, 'trailing dot stays outside the link');
  assert.match(h, /href="https:\/\/example.org\/p"[^>]*>the page<\/a>/);
  for (const bad of ['[x](javascript:alert(1))', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '**<i>x</i>**', '[<b>](https://e.org/"onmouseover=x)']) {
    const out = bodyHtml(bad);
    assert.doesNotMatch(out, /<(script|img|i|b)\b|href="(?!https?:)|"onmouseover/, bad);
  }
  assert.equal(bodyText('**Hi** [page](https://e.org/p) https://e.org'), 'Hi page (https://e.org/p) https://e.org');
});

test('queue: alerts first, both rate caps, one copy per person per campaign', async () => {
  const { sent, email, add } = setup();
  add('both@x.org', 'news,alerts'); add('news@x.org', 'news'); add('n2@x.org', 'news'); add('alerts@x.org', 'alerts');
  add('waiting@x.org', 'news,alerts', 'pending'); add('left@x.org', 'news,alerts', 'unsubscribed');
  assert.equal(email.countRecipients(['news', 'alerts']), 4, 'distinct confirmed people');
  const news = await email.enqueueBlast({ topics: ['news'], subject: 'News', body: 'n' });
  const alert = await email.enqueueBlast({ topics: ['news', 'alerts'], subject: 'Snow', body: 'closed', priority: 1, label: 'Important' });
  assert.equal(news.recipients, 3);
  assert.equal(alert.recipients, 4, 'someone on both topics gets one copy');
  const subjects = () => sent.map((m) => m.subject).join(',');
  const t0 = Date.now();
  await email.tick(t0); // 3 a minute: the later alert campaign still goes first
  assert.equal(subjects(), 'Snow,Snow,Snow');
  await email.tick(t0 + 30e3);
  assert.equal(sent.length, 3, 'minute cap');
  await email.tick(t0 + MIN + 1); // 5 an hour: 2 more
  assert.equal(subjects(), 'Snow,Snow,Snow,Snow,News');
  await email.tick(t0 + 30 * MIN);
  assert.equal(sent.length, 5, 'hour cap');
  await email.tick(t0 + HOUR + 1);
  assert.equal(subjects(), 'Snow,Snow,Snow,Snow,News,News,News');
  assert.equal(sent.filter((m) => m.to === 'both@x.org').length, 2);
  assert.ok(!sent.some((m) => /waiting|left/.test(m.to)), 'only confirmed people');
});

test('queue: 5xx address errors fail at once; others retry at 1m, 5m, 30m, 2h, then fail', async () => {
  const bounce = Object.assign(new Error('550 no such user'), { responseCode: 550 });
  const busy = Object.assign(new Error('421 try later'), { responseCode: 421, response: '421 try later' });
  const { db, email, add } = setup({ fail: { 'gone@x.org': bounce, 'flaky@x.org': busy }, env: { SEND_RATE_PER_HOUR: '100', SEND_RATE_PER_MIN: '30' } });
  add('gone@x.org', 'news'); add('flaky@x.org', 'news');
  await email.enqueueBlast({ topics: ['news'], subject: 'S', body: 'b' });
  const row = (to) => db.prepare('SELECT q.* FROM queue q JOIN subscribers s ON s.id = q.subscriber_id WHERE s.email = ?').get(to);
  let t = Date.now();
  await email.tick(t);
  assert.deepEqual([row('gone@x.org').status, row('gone@x.org').last_error], ['failed', 'Mailbox doesn’t exist']);
  for (const [i, wait] of [MIN, 5 * MIN, 30 * MIN, 2 * HOUR].entries()) {
    assert.deepEqual([row('flaky@x.org').status, row('flaky@x.org').attempts, row('flaky@x.org').next_at], ['queued', i + 1, t + wait]);
    await email.tick(t + wait - 1);
    assert.equal(row('flaky@x.org').attempts, i + 1, 'not before it is due');
    t += wait;
    await email.tick(t);
  }
  assert.deepEqual([row('flaky@x.org').status, row('flaky@x.org').attempts, row('flaky@x.org').last_error], ['failed', 5, '421 try later']);
});

test('blasts carry one-click unsubscribe headers, a text part and the footer', async () => {
  const { sent, email, add } = setup();
  add('a@x.org', 'alerts');
  await email.enqueueBlast({ topics: ['alerts'], subject: 'Closed today', body: 'Stay safe.', priority: 1, label: 'Important' });
  await email.tick();
  const m = sent[0];
  assert.match(m.headers['List-Unsubscribe'], /^<https:\/\/www\.example\.org\/email\/unsubscribe\?t=[\w.-]+>, <mailto:[^>]+\?subject=unsubscribe>$/);
  assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(m.text, /IMPORTANT: Closed today[\s\S]*Stay safe\.[\s\S]*239 Columbia Avenue, Horsham, PA 19044 · 215-441-0404[\s\S]*Weather & closing alerts at example\.org[\s\S]*Unsubscribe: https:/);
  assert.match(m.html, /Riverside Community Church[\s\S]*Unsubscribe<\/a> · <a[^>]*>Manage topics<\/a>/);
});

test('subscribe -> confirm -> one-click unsubscribe; GET never unsubscribes', async () => {
  const { db, sent, email } = setup();
  const post = (path, body, headers = {}) => email.handle(new Request(`https://www.example.org${path}`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers } }), new URL(`https://www.example.org${path}`));
  const get = (path) => email.handle(new Request(`https://www.example.org${path}`), new URL(`https://www.example.org${path}`));

  assert.equal((await post('/api/subscribe', 'email=bad&topic=news')).status, 400);
  assert.equal((await post('/api/subscribe', 'email=a@x.org&website=spam&topic=news')).status, 200);
  assert.equal(sent.length, 0, 'honeypot: pretend, send nothing');
  assert.equal((await post('/api/subscribe', 'email=A@x.org&topic=news&topic=alerts')).status, 200);
  assert.equal((await post('/api/subscribe', 'email=a@x.org&topic=news')).status, 200);
  assert.equal(sent.length, 1, 'a resubmit within 10 minutes sends no second email');
  assert.equal(email.countRecipients(['news']), 0, 'pending people get nothing');

  const link = sent[0].text.match(/https:\/\/\S+\/subscribe\/confirm\?t=\S+/)[0];
  const ok = await get(new URL(link).pathname + new URL(link).search);
  assert.match(await ok.text(), /You’re subscribed\.[\s\S]*Latest happenings · Weather &amp; closing alerts/);
  assert.equal(email.countRecipients(['alerts']), 1);
  assert.match(await (await get('/subscribe/confirm?t=nope')).text(), /That link has expired/);

  const { id } = db.prepare('SELECT id FROM subscribers').get();
  const t = signToken('test-secret', 'p', id);
  const prefs = await get(`/email/preferences?t=${t}&u=1`);
  assert.match(await prefs.text(), /Unsubscribe from all<\/button>/);
  assert.equal(email.countRecipients(['news']), 1, 'opening the page changes nothing');
  assert.equal((await get(`/email/unsubscribe?t=${t}`)).status, 303, 'GET only redirects to the page');
  assert.equal((await post(`/email/unsubscribe?t=${t}x`, 'List-Unsubscribe=One-Click')).status, 400);
  const one = await post(`/email/unsubscribe?t=${t}`, 'List-Unsubscribe=One-Click');
  assert.equal(one.status, 200);
  assert.equal(db.prepare('SELECT status FROM subscribers WHERE id = ?').get(id).status, 'unsubscribed');
  assert.equal(email.countRecipients(['news', 'alerts']), 0);
});

test('group lists: recipients, de-dup with a topic, a removed group is ignored, footer names the group', async () => {
  const groups = [{ slug: 'prayer', name: 'Sunday prayer', type: 'prayer' }, { slug: 'esl', name: 'ESL class', type: 'esl' }];
  const { sent, email, add } = setup({ groups, env: { SEND_RATE_PER_HOUR: '100', SEND_RATE_PER_MIN: '30' } });
  add('pray@x.org', 'group:prayer'); add('both@x.org', 'news,group:prayer'); add('news@x.org', 'news'); add('gone@x.org', 'group:old');
  add('waiting@x.org', 'group:prayer', 'pending');
  assert.equal(email.countRecipients(['group:prayer']), 2, 'confirmed group members only');
  assert.equal(email.countRecipients(['news', 'group:prayer']), 3, 'someone on both counts once');
  assert.equal(email.countRecipients(['group:old']), 0, 'a group that no longer exists counts nobody');
  const r = await email.enqueueBlast({ topics: ['group:prayer'], subject: 'Prayer night moved', body: 'Now Thursday.', priority: 1 });
  assert.equal(r.recipients, 2);
  await email.tick();
  assert.deepEqual(sent.map((m) => m.to).sort(), ['both@x.org', 'pray@x.org']);
  assert.match(sent[0].text, /signed up for the Sunday prayer list at example\.org/);
  await assert.rejects(email.enqueueBlast({ topics: ['group:old'], subject: 's', body: 'b' }), /required/, 'stale group alone is no list');
  await email.enqueueBlast({ topics: ['group:prayer'], subject: 'Second', body: 'b' });
  groups.shift(); // the prayer group is removed after the send was queued
  await email.tick();
  assert.equal(sent.length, 2, 'queued mail to a removed group is not sent');
  assert.equal(email.countRecipients(['group:prayer']), 0);
});

test('invite sends a confirmation for the group; nobody is subscribed until they click', async () => {
  const groups = [{ slug: 'esl', name: 'ESL class', type: 'esl' }];
  const { db, sent, email, add } = setup({ groups, env: { SEND_RATE_PER_HOUR: '100', SEND_RATE_PER_MIN: '30' } });
  add('member@x.org', 'news'); add('left@x.org', 'news', 'unsubscribed');
  const call = async (path, body) => (await email.adminHandle(new Request(`https://www.example.org/api/admin/email/${path}`, { method: 'POST', body: JSON.stringify(body) }),
    new URL(`https://www.example.org/api/admin/email/${path}`), 'staff@x.org')).json();
  assert.equal((await call('invite', { topic: 'group:nope', emails: 'a@x.org' })).error, 'group');
  assert.equal((await call('invite', { topic: 'group:esl', emails: Array.from({ length: 51 }, (_, i) => `p${i}@x.org`) })).error, 'too_many');
  const r = await call('invite', { topic: 'group:esl', emails: 'new@x.org, member@x.org\nleft@x.org not-an-email NEW@x.org' });
  assert.deepEqual(r.sent, ['new@x.org', 'member@x.org']);
  assert.deepEqual(r.skipped.map((x) => x.email), ['left@x.org', 'not-an-email']);
  assert.equal(sent.length, 2);
  assert.match(sent[0].text, /invited to get emails for the ESL class list[\s\S]*\/subscribe\/confirm\?t=/);
  assert.equal(email.countRecipients(['group:esl']), 0, 'an invite is not a subscription');
  assert.equal(db.prepare("SELECT status FROM subscribers WHERE email = 'new@x.org'").get().status, 'pending');
  const link = new URL(sent[1].text.match(/https:\/\/\S+\/subscribe\/confirm\?t=\S+/)[0]);
  await email.handle(new Request(link), link);
  assert.equal(db.prepare("SELECT topics FROM subscribers WHERE email = 'member@x.org'").get().topics, 'news,group:esl', 'confirming adds the group and keeps news');
  assert.equal(email.countRecipients(['group:esl']), 1);
  const row = db.prepare("SELECT id FROM subscribers WHERE email = 'member@x.org'").get();
  await call('subscribers/remove-topic', { id: row.id, topic: 'group:esl' });
  assert.equal(db.prepare('SELECT topics, status FROM subscribers WHERE id = ?').get(row.id).topics, 'news');
});

test('email header shows the seal (decorative) and a custom alert label as the lead', async () => {
  const { sent, email, add } = setup();
  add('a@x.org', 'alerts');
  await email.enqueueBlast({ topics: ['alerts'], subject: 'Lot B is closed', body: 'Use the street.', priority: 1, label: 'Parking' });
  await email.tick();
  const m = sent[0];
  assert.match(m.html, /<img src="https:\/\/www\.example\.org\/brand\/email-seal\.png" width="48" height="48" alt=""/);
  assert.match(m.html, /text-transform:uppercase[^>]*>Parking<\/p><h1[^>]*>Lot B is closed<\/h1>/);
  assert.match(m.text, /^Riverside Community Church\n\nPARKING: Lot B is closed\n/);
});
