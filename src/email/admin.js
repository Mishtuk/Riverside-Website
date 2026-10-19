// The admin Email view: one <section id="email" class="a-view"> with its own script. The server embeds it at <!--rs:email-->.
// Layout and look come from the admin's shared classes (.a-head, .a-card, .a-list, .a-bar, .a-seg);
// it reuses the page's #toast / #confirm dialog when they are there.

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
    forbidden: 'You don’t have permission to change this. Ask an admin.', group: 'Choose a group.', emails: 'Paste at least one email address.', too_many: 'Up to 50 addresses at a time.' };

  async function api(method, path, body) {
    const r = await fetch(API + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || String(r.status)), { code: j.error, status: r.status });
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
  // Loading with no access to Email (a limited account): stay quiet; the page shows nothing to act on anyway.
  const quiet = (e) => (e.status === 403 ? undefined : oops(e));
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

  // ---------- counts ----------
  let counts = { news: 0, alerts: 0, total: 0, pending: 0, unsubscribed: 0, configured: true, groups: [] };
  async function loadCounts() {
    try { counts = await api('GET', 'counts'); } catch (e) { return quiet(e); }
    $('#em-n-news').textContent = counts.news;
    $('#em-n-alerts').textContent = counts.alerts;
    $('#em-n-total').textContent = counts.total;
    $('#em-subs-n').textContent = `${counts.total} confirmed`;
    $('#em-tally').textContent = `${counts.pending} waiting to confirm · ${counts.unsubscribed} unsubscribed`;
    $('#em-off').hidden = counts.configured;
    // Groups change in the Groups tab, so their lists are drawn from each fresh count (keeping what is ticked).
    const on = new Set(picked());
    const types = counts.groups;
    $('#em-to-groups').innerHTML = types.map((t) => `<p class="em-type">${esc(t.label)}</p>`
      + t.groups.map((g) => `<label class="check"><input type="checkbox" name="topics" value="${esc(g.key)}"${on.has(g.key) ? ' checked' : ''}> ${esc(g.name)}</label>`).join('')).join('');
    $('#em-group-lists').hidden = !types.length;
    const gs = types.flatMap((t) => t.groups.map((g) => ({ ...g, type: t.label })));
    const most = Math.max(1, ...gs.map((g) => g.n));
    $('#em-group-tiles').innerHTML = gs.map((g) => `<li><span class="a-list-text"><span class="a-list-main">${esc(g.name)}</span><span class="a-list-meta">${esc(g.type)}</span></span>`
      + `<span class="a-list-end">${g.n}</span><span class="a-bar" aria-hidden="true"><span style="width:${Math.round((g.n / most) * 100)}%"></span></span></li>`).join('');
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
    try { list = (await api('GET', 'campaigns')).campaigns; } catch (e) { return quiet(e); }
    $('#em-sent').innerHTML = list.length
      ? list.map((c) => `<li><span class="a-list-text"><span class="a-list-main">${esc(c.subject)}</span><span class="a-list-meta">${day(c.created_at)} · ${esc(c.topics)}</span></span>`
        + `<span class="a-list-end">${tally(c)}</span></li>`).join('')
      : '<li class="a-sub">Nothing sent yet.</li>';
    const c = list.find((x) => x.id === watching);
    const p = $('#em-progress');
    p.hidden = !c;
    if (c && c.queued) {
      p.innerHTML = `<p><strong>Sending… ${c.sent + c.failed} of ${c.recipients}</strong></p><progress max="${c.recipients}" value="${c.sent + c.failed}"></progress><p class="hint">You can close this page. Sending continues.</p>`;
    } else if (c) {
      p.innerHTML = `<p><strong>Sent to ${c.sent} ${c.sent === 1 ? 'person' : 'people'}.${c.failed ? ` ${c.failed} failed.` : ''}</strong></p>`
        + (c.failed ? `<details><summary>Show failed</summary><ul class="a-list" role="list">${c.failures.map((x) => `<li><span class="a-list-text"><span class="a-list-main em-email">${esc(x.email)}</span><span class="a-list-meta">${esc(x.reason)}</span></span></li>`).join('')}</ul></details>` : '')
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
    try { r = await api('GET', `subscribers?${qs}`); } catch (e) { return quiet(e); }
    const rows = r.rows.map((s) => `<li data-id="${s.id}"><span class="a-list-text"><span class="a-list-main em-email">${esc(s.email)}</span>`
      + `<span class="a-list-meta">${esc(s.topics)}${s.topics ? ' · ' : ''}${STATUS[s.status]} · since ${day(s.since)}</span></span>`
      + (s.status === 'unsubscribed' ? '' : `<span class="a-list-end em-acts"><button type="button" class="link" data-unsub="${s.id}" data-email="${esc(s.email)}">Unsubscribe</button>`
        + s.lists.map((g) => `<button type="button" class="link" data-rm="${s.id}" data-topic="${esc(g.key)}" data-name="${esc(g.name)}" data-email="${esc(s.email)}">Remove from ${esc(g.name)}</button>`).join('') + '</span>')
      + '</li>').join('');
    const list = $('#em-rows');
    if (reset) list.innerHTML = rows || `<li class="a-sub">${$('#em-q').value || status ? 'No one matches.' : 'No subscribers yet. People join on the Subscribe page.'}</li>`;
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
        + (r.skipped.length ? `<p>Not sent:</p><ul class="a-list" role="list">${r.skipped.map((x) => `<li><span class="a-list-text"><span class="a-list-main em-email">${esc(x.email)}</span><span class="a-list-meta">${esc(x.why)}</span></span></li>`).join('')}</ul>` : '');
      inv.elements.emails.value = r.skipped.map((x) => x.email).join('\n');
      loadCounts();
      loadSubs(true);
    } catch (err) { out.textContent = ''; oops(err); }
  });

  // "Jump to: Subscribers" (narrow screens) scrolls within the view; the hash stays on #email so the view doesn't change.
  sec.querySelector('.em-jump a').addEventListener('click', (e) => {
    e.preventDefault();
    const t = $('#em-subs');
    t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    t.focus({ preventScroll: true });
  });

  loadCounts(); loadSent(); loadSubs(true); preview();
  // Fresh numbers each time the Email view is opened again.
  addEventListener('hashchange', () => { if (location.hash === '#email') { loadCounts(); loadSent(); loadSubs(true); } });
}

// Only what the shared admin classes don't cover: the two-panel layout, the preview frame, progress bar and small helpers.
// Two panels side by side when the view itself is 900px or wider (container query); stacked below that. No inner scroll, so Invite is reached by scrolling the page.
const CSS = `#email{container-type:inline-size}
#email .em-panels{display:grid;gap:24px;align-items:start}
#email .em-jump{margin:-.5rem 0 1rem;font-size:14px}
@container (min-width:900px){
  #email .em-panels{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)}
  #email .em-jump{display:none}
}
#email .em-part{display:grid;gap:1rem;padding-top:1.5rem;margin-top:1.5rem;border-top:1px solid var(--a-border)}
#email iframe{width:100%;height:560px;border:1px solid var(--a-border);border-radius:var(--a-radius-s);background:var(--a-sunken)}
@media (max-width:699px){#email iframe{height:440px}}
#email progress{width:100%;height:12px;accent-color:var(--a-accent)}
#email #em-progress{display:grid;gap:.75rem}
#email [hidden]{display:none}
#email .em-type{margin-top:.5rem;font-size:14px;font-weight:600;color:var(--a-muted)}
#email .em-email{overflow-wrap:anywhere}
#email .em-acts{display:flex;flex-wrap:wrap;gap:0 1.25rem}
#email .em-acts .link{min-height:44px}
#email .em-controls{display:grid;gap:.75rem}
#email .em-controls .a-seg{display:grid;grid-template-columns:1fr 1fr}
#email .em-controls .a-seg button:nth-child(odd){border-left:0}
#email .em-controls .a-seg button:nth-child(n+3){border-top:1px solid var(--a-border-strong)}
#email .em-counts .a-list-end{font-variant-numeric:tabular-nums;font-weight:600}`;

/** `topics` = TOPICS (key -> label). */
export function adminSection({ topics }) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const boxes = Object.entries(topics).map(([k, label]) => `<label class="check"><input type="checkbox" name="topics" value="${k}"> ${esc(label)}</label>`).join('');
  const count = (id, label) => `<li><span class="a-list-main">${esc(label)}</span><span class="a-list-end" id="em-n-${id}">0</span></li>`;
  const seg = (v, label) => `<button type="button" data-em-status="${v}" aria-pressed="${v === ''}">${label}</button>`;
  return `<section id="email" class="a-view" aria-labelledby="email-h" hidden><style>${CSS}</style>
<div class="a-head"><div><h1 id="email-h" class="a-title" tabindex="-1">Email</h1><p class="a-sub">Send news to your lists, and see who gets it.</p></div></div>
<p class="em-jump">Jump to: <a class="link" href="#em-subs">Subscribers</a></p>
<p class="note" id="em-off" hidden>Email isn&rsquo;t configured, so nothing can be sent yet.</p>
<div class="em-panels">
<div class="a-card" id="em-send">
<form id="em-form" class="form" novalidate>
<div class="a-card-h"><h2 class="a-h2">Send an email</h2></div>
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
<div id="em-progress" class="a-sunken" role="status" hidden></div>
<div class="em-part"><h3 class="a-h2">Sent emails</h3><ul id="em-sent" class="a-list" role="list"></ul></div>
</div>
<div class="a-card" id="em-subs" tabindex="-1" aria-labelledby="em-subs-h">
<div class="a-card-h"><h2 class="a-h2" id="em-subs-h">Subscribers</h2><span class="a-sub" id="em-subs-n"></span></div>
<ul class="a-list em-counts" role="list">${count('news', topics.news)}${count('alerts', topics.alerts)}${count('total', 'Confirmed in total')}</ul>
<p class="a-sub" id="em-tally"></p>
<div class="em-part" id="em-group-lists" hidden><h3 class="a-h2">Group lists</h3><ul class="a-list" id="em-group-tiles" role="list"></ul></div>
<div class="em-part"><div class="form em-controls"><label>Search by email <input type="search" id="em-q" autocomplete="off"></label>
<div class="a-seg" role="group" aria-label="Show">${seg('', 'All')}${seg('confirmed', 'Confirmed')}${seg('pending', 'Waiting to confirm')}${seg('unsubscribed', 'Unsubscribed')}</div></div>
<ul id="em-rows" class="a-list" role="list"></ul>
<p><button type="button" class="btn btn-sm btn-outline" id="em-more" hidden>Show more</button></p></div>
<form id="em-invite" class="form em-part" novalidate hidden>
<h3 class="a-h2">Invite to a group</h3>
<label>Group <select name="group" id="em-inv-group" required></select></label>
<label>Email addresses <textarea name="emails" rows="4" required aria-describedby="em-inv-help"></textarea></label>
<p class="hint" id="em-inv-help">One per line, or separated by commas. Up to 50. Each person gets an email asking them to confirm; nobody is added until they tap it.</p>
<p><button class="btn btn-sm" type="submit">Send invites</button></p>
<div id="em-inv-out" role="status"></div>
</form>
<p class="a-sub em-part" id="em-no-groups">Add a group in Groups to invite people to its email list.</p>
</div>
</div>
<p class="sr-only" role="status" id="em-live"></p>
<script>(${client})()</script>
</section>`;
}
