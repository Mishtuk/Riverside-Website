// The admin Email tab: one <section id="email"> with its own script. The server embeds it in the admin page.
// It reuses the admin page's classes, and its #toast / #confirm dialog when they are there.

/** Browser code. Stringified into the page as-is, so it must not use anything from this module. */
function client() {
  const $ = (s) => document.querySelector(s);
  const sec = $('#email');
  const API = '/api/admin/email/';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const day = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const STATUS = { confirmed: 'Confirmed', pending: 'Waiting to confirm', unsubscribed: 'Unsubscribed' };
  const ERR = { topic: 'Choose at least one topic.', subject: 'Add a subject.', body: 'Write a message.', no_recipients: 'Nobody is subscribed to that yet.',
    email_not_configured: 'Email isn’t configured, so nothing can be sent yet.', no_email: 'Your account has no email address, so tests can’t be sent. Sign in with an emailed link to send a test.',
    group: 'Choose a group.', emails: 'Paste at least one email address.', too_many: 'Up to 50 addresses at a time.' };

  async function api(method, path, body) {
    const r = await fetch(API + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || String(r.status)), { code: j.error });
    return j;
  }
  const live = $('#em-live');
  let tt = 0;
  function toast(msg, isErr) {
    const t = (isErr ? $('#toast-err') : $('#toast')) || live;
    t.textContent = msg;
    clearTimeout(tt);
    tt = setTimeout(() => (t.textContent = ''), 5000);
  }
  const oops = (e) => toast(ERR[e.code] || 'That didn’t work. Check your connection and try again.', true);
  function ask(title, text, verb) {
    const d = $('#confirm');
    if (!d || !$('#c-ok')) return Promise.resolve(window.confirm(`${title}\n${text}`));
    $('#c-title').textContent = title;
    $('#c-text').textContent = text;
    $('#c-ok').textContent = verb;
    d.returnValue = '';
    d.showModal();
    $('#c-cancel')?.focus();
    return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
  }
  const debounce = (fn, ms) => { let t = 0; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };

  // ---------- tabs ----------
  sec.querySelectorAll('[data-em-tab]').forEach((b) => b.addEventListener('click', () => {
    sec.querySelectorAll('[data-em-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#em-send').hidden = b.dataset.emTab !== 'send';
    $('#em-subs').hidden = b.dataset.emTab !== 'subs';
    if (b.dataset.emTab === 'subs') loadSubs(true);
  }));

  // ---------- counts ----------
  let counts = { news: 0, alerts: 0, total: 0, pending: 0, unsubscribed: 0, configured: true, groups: [] };
  async function loadCounts() {
    try { counts = await api('GET', 'counts'); } catch (e) { return oops(e); }
    $('#em-n-news').textContent = counts.news;
    $('#em-n-alerts').textContent = counts.alerts;
    $('#em-n-total').textContent = counts.total;
    $('#em-tally').textContent = `${counts.pending} waiting to confirm · ${counts.unsubscribed} unsubscribed`;
    $('#em-off').hidden = counts.configured;
    // Groups change in the Groups tab, so their lists are drawn from each fresh count (keeping what is ticked).
    const on = new Set(picked());
    const types = counts.groups;
    $('#em-to-groups').innerHTML = types.map((t) => `<p class="em-type">${esc(t.label)}</p>`
      + t.groups.map((g) => `<label class="check"><input type="checkbox" name="topics" value="${esc(g.key)}"${on.has(g.key) ? ' checked' : ''}> ${esc(g.name)}</label>`).join('')).join('');
    $('#em-group-lists').hidden = !types.length;
    $('#em-group-tiles').innerHTML = types.flatMap((t) => t.groups).map((g) => `<li class="card em-tile"><span class="em-n">${g.n}</span><span class="muted">${esc(g.name)}</span></li>`).join('');
    const sel = $('#em-inv-group');
    const was = sel.value;
    sel.innerHTML = '<option value="">Choose a group</option>' + types.map((t) => `<optgroup label="${esc(t.label)}">${t.groups.map((g) => `<option value="${esc(g.key)}">${esc(g.name)}</option>`).join('')}</optgroup>`).join('');
    sel.value = was;
    $('#em-invite').hidden = !types.length;
    $('#em-no-groups').hidden = Boolean(types.length);
    syncCount();
  }

  // ---------- compose ----------
  const f = $('#em-form');
  const picked = () => [...f.querySelectorAll('[name=topics]:checked')].map((b) => b.value);
  // The server counts each person once, however many of the ticked lists they are on.
  let goes = 0;
  const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;
  async function goesTo() {
    const t = picked();
    goes = t.length ? (await api('GET', `count?topics=${encodeURIComponent(t.join(','))}`)).n : 0;
    return goes;
  }
  const syncCount = debounce(async () => {
    if (!picked().length) { $('#em-count').textContent = 'Choose at least one topic.'; return; }
    try { $('#em-count').innerHTML = `Goes to <strong>${people(await goesTo())}</strong>`; } catch { /* next change retries */ }
  }, 200);
  const draft = () => ({ topics: picked(), subject: f.elements.subject.value.trim(), body: f.elements.body.value });
  const preview = debounce(async () => {
    try { $('#em-preview').srcdoc = (await api('POST', 'preview', draft())).html; } catch { /* the preview catches up on the next keystroke */ }
  }, 300);
  f.addEventListener('input', () => { syncCount(); preview(); });
  function check() {
    const d = draft();
    const err = !d.topics.length ? 'topic' : !d.subject ? 'subject' : !d.body.trim() ? 'body' : '';
    $('#em-err').hidden = !err;
    $('#em-err').textContent = ERR[err] || '';
    if (err) (err === 'subject' ? f.elements.subject : err === 'body' ? f.elements.body : f.querySelector('[name=topics]')).focus();
    return err ? null : d;
  }
  $('#em-test').addEventListener('click', async () => {
    try { toast(`Test sent to ${(await api('POST', 'test', draft())).to}.`); } catch (e) { oops(e); }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = check();
    if (!d) return;
    let n;
    try { n = await goesTo(); } catch (err) { return oops(err); }
    if (!n) { $('#em-err').hidden = false; $('#em-err').textContent = ERR.no_recipients; return; }
    if (!(await ask(`Email ${n} ${n === 1 ? 'person' : 'people'}?`, `Subject: ${d.subject}. Emails can’t be unsent.`, `Send to ${n}`))) return;
    try {
      const r = await api('POST', 'send', d);
      watching = r.campaignId;
      f.hidden = true;
      await loadSent();
    } catch (err) { oops(err); }
  });

  // ---------- progress + sent list ----------
  let watching = 0;
  let poll = 0;
  const tally = (c) => (c.queued ? `Sending… ${c.sent + c.failed} of ${c.recipients}` : `${c.sent} sent · ${c.failed} failed`);
  async function loadSent() {
    let list;
    try { list = (await api('GET', 'campaigns')).campaigns; } catch (e) { return oops(e); }
    $('#em-sent').innerHTML = list.length
      ? list.map((c) => `<li class="card em-row"><span class="hint">${day(c.created_at)} · ${esc(c.topics)}</span><strong>${esc(c.subject)}</strong><span>${tally(c)}</span></li>`).join('')
      : '<li class="muted">Nothing sent yet.</li>';
    const c = list.find((x) => x.id === watching);
    const p = $('#em-progress');
    p.hidden = !c;
    if (c && c.queued) {
      p.innerHTML = `<p><strong>Sending… ${c.sent + c.failed} of ${c.recipients}</strong></p><progress max="${c.recipients}" value="${c.sent + c.failed}"></progress><p class="hint">You can close this page. Sending continues.</p>`;
    } else if (c) {
      p.innerHTML = `<p><strong>Sent to ${c.sent} ${c.sent === 1 ? 'person' : 'people'}.${c.failed ? ` ${c.failed} failed.` : ''}</strong></p>`
        + (c.failed ? `<details><summary>Show failed</summary><ul class="em-list">${c.failures.map((x) => `<li><span class="em-email">${esc(x.email)}</span> ${esc(x.reason)}</li>`).join('')}</ul></details>` : '')
        + '<p><button type="button" class="btn btn-sm" id="em-again">Write another email</button></p>';
      $('#em-again').onclick = () => { watching = 0; p.hidden = true; f.reset(); f.hidden = false; syncCount(); preview(); f.elements.subject.focus(); };
    }
    clearTimeout(poll);
    if (list.some((x) => x.queued)) poll = setTimeout(loadSent, 10000);
  }

  // ---------- subscribers ----------
  let status = '';
  let offset = 0;
  async function loadSubs(reset) {
    if (reset) offset = 0;
    const qs = new URLSearchParams({ q: $('#em-q').value.trim(), status, offset: String(offset) });
    let r;
    try { r = await api('GET', `subscribers?${qs}`); } catch (e) { return oops(e); }
    const rows = r.rows.map((s) => `<li class="card em-row" data-id="${s.id}"><span class="em-email">${esc(s.email)}</span>`
      + `<span>${esc(s.topics)}${s.topics ? ' · ' : ''}${STATUS[s.status]} · <span class="muted">since ${day(s.since)}</span></span>`
      + (s.status === 'unsubscribed' ? '' : `<span class="em-acts"><button type="button" class="link" data-unsub="${s.id}" data-email="${esc(s.email)}">Unsubscribe</button>`
        + s.lists.map((g) => `<button type="button" class="link" data-rm="${s.id}" data-topic="${esc(g.key)}" data-name="${esc(g.name)}" data-email="${esc(s.email)}">Remove from ${esc(g.name)}</button>`).join('') + '</span>')
      + '</li>').join('');
    const list = $('#em-rows');
    if (reset) list.innerHTML = rows || `<li class="muted">${$('#em-q').value || status ? 'No one matches.' : 'No subscribers yet. People join on the Subscribe page.'}</li>`;
    else list.insertAdjacentHTML('beforeend', rows);
    $('#em-more').hidden = !r.more;
  }
  $('#em-q').addEventListener('input', debounce(() => loadSubs(true), 250));
  sec.querySelectorAll('[data-em-status]').forEach((b) => b.addEventListener('click', () => {
    sec.querySelectorAll('[data-em-status]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    status = b.dataset.emStatus;
    loadSubs(true);
  }));
  $('#em-more').addEventListener('click', () => { offset += 50; loadSubs(false); });
  $('#em-rows').addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      if (!(await ask(`Remove ${rm.dataset.email} from ${rm.dataset.name}?`, 'They stop getting this group’s emails. Their other emails don’t change.', 'Remove'))) return;
      try {
        await api('POST', 'subscribers/remove-topic', { id: +rm.dataset.rm, topic: rm.dataset.topic });
        toast(`Removed from ${rm.dataset.name}.`);
        loadSubs(true); loadCounts();
      } catch (err) { oops(err); }
      return;
    }
    const b = e.target.closest('[data-unsub]');
    if (!b || !(await ask(`Unsubscribe ${b.dataset.email}?`, 'They stop getting all Riverside emails.', 'Unsubscribe'))) return;
    try {
      await api('POST', 'subscribers/unsubscribe', { id: +b.dataset.unsub });
      toast(`${b.dataset.email} is unsubscribed.`);
      loadSubs(true); loadCounts();
    } catch (err) { oops(err); }
  });

  // ---------- invite to a group ----------
  const inv = $('#em-invite');
  inv.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('#em-inv-out');
    try {
      const r = await api('POST', 'invite', { topic: inv.elements.group.value, emails: inv.elements.emails.value });
      out.innerHTML = `<p><strong>Sent ${r.sent.length} ${r.sent.length === 1 ? 'invite' : 'invites'}.</strong> They join when they tap the link in the email.</p>`
        + (r.skipped.length ? `<p>Not sent:</p><ul class="em-list">${r.skipped.map((x) => `<li><span class="em-email">${esc(x.email)}</span> ${esc(x.why)}</li>`).join('')}</ul>` : '');
      inv.elements.emails.value = r.skipped.map((x) => x.email).join('\n');
      loadCounts();
      if (!$('#em-subs').hidden) loadSubs(true);
    } catch (err) { out.textContent = ''; oops(err); }
  });

  loadCounts(); loadSent(); preview();
}

const CSS = `#email .em-tiles{grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));margin-bottom:.75rem;padding:0}
#email .em-tile{padding:1rem 1.25rem}
#email .em-n{display:block;font-size:var(--step-2);font-weight:700;line-height:1.2}
#email .em-list{list-style:none;padding:0;display:grid;gap:.5rem}
#email .em-row{display:grid;gap:.2rem;padding:.9rem 1rem}
#email .em-email{font-weight:700;overflow-wrap:anywhere}
#email .em-controls{margin-block:1rem}
#email iframe{width:100%;height:480px;border:1px solid var(--line);border-radius:var(--radius-s);background:var(--cream)}
#email progress{width:100%;height:12px;accent-color:var(--gold-ink)}
#email #em-progress{display:grid;gap:.6rem;margin-top:1.5rem}
#email #em-progress[hidden],#email [hidden]{display:none}
#email .em-type{margin-top:.4rem;font-size:var(--step--1);font-weight:700;color:var(--muted)}
#email .em-acts{display:flex;flex-wrap:wrap;gap:0 1.25rem}
#email .em-acts .link{min-height:44px}`;

/** `topics` = TOPICS (key -> label). */
export function adminSection({ topics }) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const boxes = Object.entries(topics).map(([k, label]) => `<label class="check"><input type="checkbox" name="topics" value="${k}"> ${esc(label)}</label>`).join('');
  const tile = (id, label) => `<li class="card em-tile"><span class="em-n" id="em-n-${id}">0</span><span class="muted">${esc(label)}</span></li>`;
  const chip = (v, label) => `<li><button type="button" class="chip" data-em-status="${v}" aria-pressed="${v === ''}">${label}</button></li>`;
  return `<section id="email" aria-labelledby="email-h"><style>${CSS}</style>
<h2 id="email-h" class="h2">Email</h2>
<p class="note" id="em-off" hidden>Email isn&rsquo;t configured, so nothing can be sent yet.</p>
<ul class="chips seg" role="list"><li><button type="button" class="chip" data-em-tab="send" aria-pressed="true">Send an email</button></li><li><button type="button" class="chip" data-em-tab="subs" aria-pressed="false">Subscribers</button></li></ul>
<div id="em-send">
<form id="em-form" class="card form" novalidate>
<h3 class="h3">Send an email</h3>
<fieldset><legend>Send to</legend>${boxes}<div id="em-to-groups"></div></fieldset>
<p class="hint" id="em-count" aria-live="polite">Choose at least one topic.</p>
<label>Subject <input name="subject" required maxlength="100" autocomplete="off"></label>
<label>Message <textarea name="body" rows="10" required maxlength="10000" aria-describedby="em-help"></textarea></label>
<p class="hint" id="em-help">Blank line = new paragraph. **bold** for bold. Paste links as-is, or [words](https://&hellip;).</p>
<p class="err" id="em-err" role="alert" hidden></p>
<p class="label">Preview</p>
<iframe id="em-preview" title="Email preview" sandbox></iframe>
<div class="btn-row"><button class="btn" type="submit">Send&hellip;</button><button class="btn btn-sm btn-outline" type="button" id="em-test">Send test to me</button></div>
</form>
<div id="em-progress" class="card" role="status" hidden></div>
<h3 class="h3">Sent emails</h3>
<ul id="em-sent" class="em-list" role="list"></ul>
</div>
<div id="em-subs" hidden>
<ul class="cards-grid em-tiles" role="list">${tile('news', topics.news)}${tile('alerts', topics.alerts)}${tile('total', 'Confirmed in total')}</ul>
<p class="muted" id="em-tally"></p>
<div id="em-group-lists" hidden><h3 class="h3">Group lists</h3><ul class="cards-grid em-tiles" id="em-group-tiles" role="list"></ul></div>
<form id="em-invite" class="card form" novalidate hidden>
<h3 class="h3">Invite to a group</h3>
<label>Group <select name="group" id="em-inv-group" required></select></label>
<label>Email addresses <textarea name="emails" rows="4" required aria-describedby="em-inv-help"></textarea></label>
<p class="hint" id="em-inv-help">One per line, or separated by commas. Up to 50. Each person gets an email asking them to confirm; nobody is added until they tap it.</p>
<p><button class="btn btn-sm" type="submit">Send invites</button></p>
<div id="em-inv-out" role="status"></div>
</form>
<p class="muted" id="em-no-groups">Add a group in Groups to invite people to its email list.</p>
<div class="form em-controls"><label>Search by email <input type="search" id="em-q" autocomplete="off"></label>
<ul class="chips" role="list">${chip('', 'All')}${chip('confirmed', 'Confirmed')}${chip('pending', 'Waiting to confirm')}${chip('unsubscribed', 'Unsubscribed')}</ul></div>
<ul id="em-rows" class="em-list" role="list"></ul>
<p><button type="button" class="btn btn-sm btn-outline" id="em-more" hidden>Show more</button></p>
</div>
<p class="sr-only" role="status" id="em-live"></p>
<script>(${client})()</script>
</section>`;
}
