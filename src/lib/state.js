// Live site data: alerts, title/thumbnail overrides, weekly groups, livestream toggle.
// One module, used at build time (static pages), at request time (src/worker.js) and by /admin,
// so the alert and group card markup has a single source. Plain JS so the worker can import it.

export const TZ = 'America/New_York';
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const VARIES = 7; // "Day varies"

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Calendar date "YYYY-MM-DD" in America/New_York. */
export const etDay = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const shortDate = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const stamp = (iso, o) => new Date(iso).toLocaleString('en-US', { ...o, timeZone: TZ });

// ---------- Alerts ----------
export const ALERT_TYPES = { urgent: { label: 'Important', topic: 'alerts' }, news: { label: 'News', topic: 'news' } };

/** Alerts still showing at `now`: urgent first, then newest. Expired alerts simply stop showing. */
export const activeAlerts = (alerts = [], now = new Date()) =>
  alerts
    .filter((a) => Date.parse(a.expires) > +now)
    .sort((a, b) => (a.type === b.type ? b.created.localeCompare(a.created) : a.type === 'urgent' ? -1 : 1));
/** The site-wide banner: every active alert except group alerts kept to their own group. */
export const siteAlerts = (alerts, now) => activeAlerts(alerts, now).filter((a) => a.sitewide !== false);
/** Active alerts pinned to one group's card on /groups. */
export const groupAlerts = (alerts, groupId, now) => activeAlerts(alerts, now).filter((a) => a.group === groupId);

const ICON = {
  urgent: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6"/>',
  news: '<path d="M3.5 10v4h3l7 4.5v-13l-7 4.5z"/><path d="M17 9.5a3.5 3.5 0 0 1 0 5"/>',
  meeting: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16 9.6"/>',
  off: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  break: '<path d="M9 6v12M15 6v12"/>',
  unknown: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (k, size) => `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICON[k]}</svg>`;

/** Alert types staff pick from (or write their own, up to 24 characters). The type is only the words on the alert;
 *  how urgent it looks (dark Important vs light News) is a separate choice. */
export const ALERT_PRESETS = ['Weather', 'Closing', 'Schedule change', 'Cancelled', 'Event', 'Prayer', 'News'];
export const URGENT_PRESETS = ['Weather', 'Closing', 'Cancelled'];
export const LABEL_MAX = 24;
export const alertLabel = (a) => a.label || (a.type === 'urgent' ? 'Important' : 'News');
// The church seal in a light disc: looks the same on the dark Important card and the light News card.
const seal = (base, px) => `<span class="alert-seal" aria-hidden="true"><img src="${base}/brand/alert-seal.png" alt="" width="${px}" height="${px}" decoding="async"></span>`;

/** One alert. Urgency shows three ways at once, never by colour alone: the card style, the icon, and a spoken prefix. */
export const alertCard = (a, base = '') => {
  const urgent = a.type === 'urgent';
  return `<article class="alert alert-${urgent ? 'urgent' : 'news'}" data-alert-id="${esc(a.id)}">${seal(base, 28)}`
    + `<div><p class="alert-label">${icon(urgent ? 'urgent' : 'news', 16)}<span>${esc(alertLabel(a))}</span></p><p class="alert-msg"><span class="sr-only">${urgent ? 'Important' : 'News'}: </span>${esc(a.message)}</p>`
    + (a.link ? `<p class="alert-more"><a class="link link-arrow" href="${esc(a.link)}">Learn more</a></p>` : '')
    + `</div><button class="alert-x" type="button" aria-label="Dismiss alert: ${esc(a.message.slice(0, 40))}">&#x2715;</button></article>`;
};

/** Banner block: first child of <main> on inner pages; on home (`home`), first child of .hero-content, in flow. */
export const alertsHtml = (alerts, home) =>
  `<div class="${home ? 'site-alerts-wrap is-home' : 'container site-alerts-wrap'}"><section class="site-alerts" aria-label="Church alerts">${alerts.map((a) => alertCard(a)).join('')}</section></div><script>${ALERT_JS}</script>`;

export const ALERT_CSS = `.site-alerts-wrap{margin-top:12px}
.site-alerts-wrap.is-home{margin:0 0 1.5rem}
.site-alerts{display:grid;gap:8px}
.alert{display:grid;grid-template-columns:auto 1fr auto;gap:.75rem;align-items:start;padding:.85rem 1rem;border-radius:var(--radius);box-shadow:var(--shadow-m);overflow:hidden;transition:height .25s var(--ease),opacity .25s var(--ease),padding .25s var(--ease)}
.alert .ic{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;flex:none}
.alert-seal{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:var(--paper);box-shadow:0 0 0 1.5px var(--gold)}
.alert-seal img{width:28px;height:28px}
@media (max-width:399px){.alert .alert-seal{width:28px;height:28px}.alert .alert-seal img{width:22px;height:22px}}
.alert-label{display:flex;align-items:center;gap:.4rem;font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;line-height:1.4}
.alert .alert-msg{font-size:1rem;line-height:1.45;font-weight:600;color:inherit}
.alert-more{margin-top:.3rem;font-size:1rem}
.alert-x{width:44px;height:44px;margin:-.5rem -.5rem 0 0;border:0;border-radius:50%;background:none;font-size:1rem;line-height:1}
.alert-x:hover{background:rgb(127 127 127/.18)}
.alert-urgent{background:var(--ink);color:var(--cream);border-left:4px solid var(--gold)}
.alert-urgent .alert-label,.alert-urgent .ic,.alert-urgent .link{color:var(--gold)}
.alert-urgent :focus-visible{outline-color:var(--gold)}
.alert-news{background:var(--parchment);color:var(--ink);border:1px solid var(--line-gold);border-left:4px solid var(--gold)}
.alert-news .alert-label,.alert-news .ic{color:var(--gold-ink-sm)}
.alert.is-leaving{height:0!important;opacity:0;padding-block:0}
@media (max-width:699px){.alert{padding:.75rem .85rem}}
.alert-pop{max-width:32rem;width:min(32rem,calc(100% - 2rem));margin:auto;padding:1.5rem;border:0;border-left:4px solid var(--gold);box-shadow:var(--shadow-l);color:var(--ink)}
.alert-pop:not([open]){display:none}
.alert-pop::backdrop{background:rgb(28 28 28/.5)}
.alert-pop-head{display:flex;align-items:center;gap:12px;margin:0 2.75rem 1rem 0}
.alert-pop .alert-seal{width:48px;height:48px}
.alert-pop .alert-seal img{width:38px;height:38px}
.alert-pop-x{position:absolute;top:.5rem;right:.5rem;width:44px;height:44px;border:0;border-radius:50%;background:none;font-size:1rem;line-height:1}
.alert-pop-x:hover{background:rgb(127 127 127/.18)}
.alert-pop-body{max-height:min(70vh,34rem);overflow:auto}
.alert-pop-row{display:grid;grid-template-columns:auto 1fr;gap:.75rem;padding-block:.9rem;border-top:1px solid var(--line)}
.alert-pop-row:first-child{border-top:0;padding-top:0}
.alert-pop .ic{fill:none;stroke:var(--gold-ink);stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;margin-top:.15rem}
.alert-pop .alert-label{color:var(--gold-ink-sm)}
.alert-pop .alert-pop-msg{font-size:var(--step-0);line-height:1.5;color:var(--ink)}
.alert-pop form{margin-top:1rem}
@media (max-width:479px){.alert-pop .btn{width:100%}}
@media (prefers-reduced-motion:no-preference){.alert-pop[open]{animation:pop-in .2s var(--ease)}@keyframes pop-in{from{opacity:0;transform:translateY(8px)}}}`;

// Dismiss: remembers ids in localStorage (an edited alert gets a new id, so it shows again).
const ALERT_JS = `(()=>{const w=document.currentScript.previousElementSibling,K='riverside-dismissed-alerts';let d=[];try{d=JSON.parse(localStorage.getItem(K))||[]}catch(e){}
const tidy=()=>{if(!w.querySelector('.alert'))w.remove()};
w.querySelectorAll('.alert').forEach(a=>{if(d.includes(a.dataset.alertId))a.remove()});tidy();
w.addEventListener('click',e=>{const b=e.target.closest('.alert-x');if(!b)return;const a=b.closest('.alert'),n=a.nextElementSibling;d.push(a.dataset.alertId);try{localStorage.setItem(K,JSON.stringify(d.slice(-30)))}catch(e){}
const fin=()=>{a.remove();if(n)n.querySelector('.alert-x').focus();else{const m=document.getElementById('main');m.tabIndex=-1;m.focus()}tidy()};
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return fin();a.style.height=a.offsetHeight+'px';a.offsetHeight;a.classList.add('is-leaving');setTimeout(fin,250)})})()`;

// ---------- Title / thumbnail overrides ----------
/** Effective title/thumbnail: the staff override wins, a removed override falls back to the feed value. */
export const applyOverride = (orig, o) => ({ title: o?.title || orig.title, thumb: o?.thumb ? `/api/thumb/${o.thumb}` : orig.thumb });

// ---------- Weekly groups (exceptions only: a group meets as usual unless staff flag this week) ----------
/** Status at `now`. "Not meeting" clears itself after its date; "On break" clears on its date (ET).
 *  now = null (static build fallback) -> "Check with the office", never a stale claim. */
export function groupStatus(g, now) {
  if (!now) return { kind: 'unknown', label: 'Check with the office' };
  const today = etDay(now);
  const sat = addDays(today, 6 - new Date(`${today}T00:00:00Z`).getUTCDay());
  const s = g.status ?? {};
  if (s.kind === 'break' && s.date > today) return { kind: 'break', label: `On break until ${shortDate(s.date)}` };
  if (s.kind === 'off' && s.date >= today && s.date <= sat) return { kind: 'off', label: 'Not meeting this week' };
  return { kind: 'meeting', label: 'Meeting this week' };
}

// ponytail: time sort parses the first "h:mm am/pm" in free text; add a real time field if staff need finer control.
const minutes = (t = '') => {
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  return m ? (+m[1] % 12 + (/pm/i.test(m[3] ?? '') ? 12 : 0)) * 60 + +(m[2] ?? 0) : 9999;
};
export const sortGroups = (gs) => [...gs].sort((a, b) => a.day - b.day || minutes(a.time) - minutes(b.time) || a.name.localeCompare(b.name));

// ---------- Group events (one-offs; the group's weekly day/time is the recurrence) ----------
const hm = (t) => { const [h, m] = t.split(':').map(Number); return { t: `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}`, ap: h < 12 ? 'am' : 'pm' }; };
/** "HH:MM" (+ optional end) as people write it: "7pm", "7:30pm", "12–3pm", "11am–1pm". */
export const timeLabel = (start, end) => {
  if (!start) return '';
  const a = hm(start);
  if (!end) return a.t + a.ap;
  const b = hm(end);
  return a.ap === b.ap ? `${a.t}&ndash;${b.t}${b.ap}` : `${a.t}${a.ap}&ndash;${b.t}${b.ap}`;
};
/** Next few events from today on (ET), soonest first. Past events drop off by themselves. */
export const upcomingEvents = (g, now, max = 3) => {
  if (!now) return [];
  const today = etDay(now);
  return (g.events ?? []).filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)).slice(0, max);
};
const eventsHtml = (g, now) => {
  const evs = upcomingEvents(g, now);
  if (!evs.length) return '';
  return `<div class="group-events"><h3 class="group-events-h">Coming up</h3><ul role="list">${evs.map((e) => {
    const place = e.place || g.place;
    const when = `${new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${timeLabel(e.start, e.end)}`;
    return `<li><strong>${esc(e.title)}</strong><span>${when}${place ? ` &middot; ${esc(place)}` : ''}</span>${e.note ? `<span class="group-event-note">${esc(e.note)}</span>` : ''}</li>`;
  }).join('')}</ul></div>`;
};

// ---------- Group types and news posts ----------
/** Fixed order of the type sections on /groups. */
export const GROUP_TYPES = [['prayer', 'Prayer'], ['discipleship', 'Discipleship'], ['esl', 'ESL classes'], ['men', 'Men'], ['women', 'Women'], ['kids', 'Kids'], ['other', 'Other groups']];
const TYPE_KEYS = GROUP_TYPES.map(([k]) => k);
// Page ids a group slug must not take (the skip link, the board itself, the type headings).
const RESERVED = new Set(['main', 'groups-board', 'live-banner', ...TYPE_KEYS.map((k) => `t-${k}`)]);

/** URL-safe id from the name, unique among `taken`. Set once on the first save, so shared links survive renames. */
export function slugify(name, taken = new Set()) {
  const base = String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'group';
  let slug = RESERVED.has(base) ? `${base}-group` : base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** Post body: blank line = new paragraph, single line break kept, bare https links linked; everything else escaped. */
export const bodyHtml = (body = '') => body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${p.split('\n').map((line) =>
  line.split(/(https?:\/\/[^\s<>"']+)/g).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    const [, url, tail] = part.match(/^(.*?)([.,;:!?)]*)$/);
    return `<a class="link" href="${esc(url)}" rel="noopener">${esc(url)}</a>${esc(tail)}`;
  }).join('')).join('<br>')}</p>`).join('');

export const MAX_NEWS = 20;
/** Newest first; posting the 21st drops the oldest. */
export const addNews = (news = [], post) => [post, ...news].slice(0, MAX_NEWS);

/** The board (summary line + one section per group type), rendered the same at build time and in the server.
 *  c = { email, phone, involved, groups } comes from site facts, so they stay in one place.
 *  alerts: the stored alerts; a group's active ones are pinned at the top of its card. */
export function boardHtml(groups, now, c, alerts = []) {
  const contact = (what) => `${what}: <a class="link" href="mailto:${esc(c.email)}">Contact us</a>`;
  if (!groups.length) {
    return `<article class="card group-empty"><h2 class="h3">No weekly groups are listed right now.</h2><p>Call ${esc(c.phone)} or email ${esc(c.email)} and we&rsquo;ll help you find a group.</p><p><a class="link link-arrow" href="${esc(c.involved)}">Ways to get involved</a></p></article>`;
  }
  const rows = sortGroups(groups).map((g) => ({ g, s: groupStatus(g, now) }));
  const last = groups.map((g) => g.updated).filter(Boolean).sort().pop();
  const meeting = rows.filter((r) => r.s.kind === 'meeting').length;
  const summary = now
    ? `<p class="board-summary"><strong>${meeting} of ${rows.length}</strong> groups meeting this week${last ? ` &middot; Board updated ${stamp(last, { weekday: 'short', month: 'short', day: 'numeric' })} at ${stamp(last, { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase()}` : ''}</p>`
    : '';
  const card = ({ g, s }) => {
    const day = g.day === VARIES ? 'Day varies' : `${DAYS[g.day]}s`;
    const when = !g.time && !g.place ? contact('When &amp; where')
      : `${day}, ${g.time ? esc(g.time) : contact('Time')} &middot; ${g.place ? esc(g.place) : contact('Place')}`;
    const news = (g.news ?? []).slice(0, 10);
    const date = (iso, o) => stamp(iso, o);
    const feed = news.length
      ? `<ol class="group-feed" role="list">${news.map((n) => `<li><p class="group-post-date">${date(n.date, { weekday: 'short', month: 'short', day: 'numeric' })}</p><h4>${esc(n.title)}</h4>${bodyHtml(n.body)}</li>`).join('')}</ol>`
      : `<p>No updates yet. Questions? <a class="link" href="mailto:${esc(c.email)}">Contact us</a></p>`;
    const pinned = now ? groupAlerts(alerts, g.id, now) : [];
    const self = `/groups#${g.id}`; // no "Learn more" pointing at the card it is already on
    return `<li><article class="card group" id="${esc(g.id)}" tabindex="-1">`
      + (pinned.length ? `<div class="group-alerts">${pinned.map((a) => alertCard({ ...a, link: a.link === self ? undefined : a.link })).join('')}</div>` : '')
      + `<p class="chip-status is-${s.kind}">${icon(s.kind, 16)}${s.label}</p>`
      + `<h3 class="h3">${esc(g.name)}</h3><p class="group-when">${icon('clock', 16)}<span>${when}</span></p>`
      + (news[0] ? `<p class="group-latest"><span class="group-events-h">Latest</span> ${date(news[0].date, { month: 'short', day: 'numeric' })} &middot; ${esc(news[0].title)}</p>` : '')
      + (g.about ? `<p class="group-about">${esc(g.about)}</p>` : '')
      + (g.note ? `<p class="group-note">${esc(g.note)}</p>` : '')
      + (g.contact ? `<p class="group-contact">Contact: ${esc(g.contact)}</p>` : '')
      + eventsHtml(g, now)
      + `<details class="readmore group-more"><summary><span>News &amp; updates (${news.length})</span><span class="sr-only"> for ${esc(g.name)}</span></summary>`
      + `<div class="readmore-body">${feed}<p><a class="btn btn-sm btn-outline group-share" href="${esc(c.groups)}#${esc(g.id)}" data-title="${esc(g.name)}">Share this group</a></p></div></details>`
      + (g.updated ? `<p class="group-updated">Updated ${stamp(g.updated, { month: 'short', day: 'numeric' })}</p>` : '')
      + '</article></li>';
  };
  const sections = GROUP_TYPES.map(([k, label]) => {
    const list = rows.filter((r) => (TYPE_KEYS.includes(r.g.type) ? r.g.type : 'other') === k);
    return list.length ? `<section class="group-type" aria-labelledby="t-${k}"><h2 class="h2" id="t-${k}">${label}</h2><ul class="cards-grid groups" role="list">${list.map(card).join('')}</ul></section>` : '';
  });
  return `${summary}${sections.join('')}`;
}

// ---------- Validation (everything staff or visitors send passes through here) ----------
const TAG = /<\/?[a-z!][^>]*>?/gi; // tag-like runs only, so "a < b" survives
/** Plain text only: control characters and anything tag-like are removed (and everything is escaped on render). */
export const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(TAG, '').trim() : '').slice(0, max);
const ymd = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : null);
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const okId = (id) => (typeof id === 'string' && /^[\w-]{1,40}$/.test(id) ? id : crypto.randomUUID());

/** One dated event. Past events are dropped on save; they also stop showing after their date. */
export function validateEvent(e, today) {
  const title = text(e?.title, 80);
  const date = ymd(e?.date);
  const start = HM.test(e?.start ?? '') ? e.start : null;
  const end = e?.end ? (HM.test(e.end) ? e.end : 'bad') : '';
  if (!title || !date || !start || end === 'bad' || (end && end <= start)) return { error: 'event' };
  if (date < today) return { value: null };
  return { value: { id: okId(e.id), title, date, start, end: end || undefined, place: text(e?.place, 80) || undefined, note: text(e?.note, 140) || undefined } };
}
export const VIDEO_ID = /^[\w-]{11}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** `groupIds`: the groups that exist now. A group alert must name one of them; its link defaults to the group's
 *  own section, and it shows site-wide only when `sitewide` is ticked. Plain alerts are always site-wide. */
export function validateAlert(b, now = new Date(), groupIds = []) {
  const message = text(b?.message, 200);
  const expires = Date.parse(b?.expires);
  let link = text(b?.link, 500);
  const group = b?.group ? String(b.group) : undefined;
  if (!['urgent', 'news'].includes(b?.type)) return { error: 'type' };
  const rawLabel = typeof b?.label === 'string' ? b.label.trim() : '';
  if (rawLabel.length > LABEL_MAX) return { error: 'label' };
  const label = text(rawLabel, LABEL_MAX) || (b.type === 'urgent' ? 'Important' : 'News');
  if (!message) return { error: 'message' };
  if (!(expires > +now) || expires > +now + 90 * 864e5) return { error: 'expires' };
  if (group && !groupIds.includes(group)) return { error: 'group' };
  if (!link && group) link = `/groups#${group}`;
  link = cleanLink(link);
  if (link === null) return { error: 'link' };
  const sitewide = group ? Boolean(b.sitewide) : true;
  const id = crypto.randomUUID();
  return { value: { id, type: b.type, label, message, link: link || undefined, expires: new Date(expires).toISOString(), created: now.toISOString(),
    ...(group ? { group, sitewide } : {}),
    // Pop-up: only for alerts on every page. popKey is what visitors' browsers remember as "seen".
    ...(b.popup && sitewide ? { popup: true, popKey: id } : {}) } };
}

/** '' (none), a page on this site ("/events#x"), or a full http(s) URL; null if it's anything else. */
export function cleanLink(v) {
  const link = typeof v === 'string' ? v.trim().slice(0, 500) : '';
  if (!link) return '';
  if (/^\/(?!\/)/.test(link)) return /^\/[\w\-./#?=&%]*$/.test(link) ? link : null;
  try { const u = new URL(link); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

/** Editing a pop-up alert keeps its "seen" key, so visitors don't see it twice, unless staff tick "Show again". */
export const carryPopKey = (alert, old, showAgain) => (alert.popup && old?.popup && !showAgain ? { ...alert, popKey: old.popKey ?? old.id } : alert);

/** A group news post from staff. Date is stamped here, never taken from the client. */
export function validateNews(b, now = new Date()) {
  const title = text(b?.title, 80);
  const body = typeof b?.body === 'string' ? b.body.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(TAG, '').trim().slice(0, 600) : '';
  if (!title) return { error: 'title' };
  return { value: { id: crypto.randomUUID(), date: now.toISOString(), title, body } };
}

export function validateGroups(list, old = [], now = new Date()) {
  if (!Array.isArray(list) || list.length > 50) return { error: 'groups' };
  const out = [];
  const taken = new Set(old.map((o) => o.id));
  const seen = new Set();
  for (const g of list) {
    const name = text(g?.name, 80);
    const day = Number(g?.day);
    if (!name || !Number.isInteger(day) || day < 0 || day > VARIES) return { error: 'group' };
    const kind = ['meeting', 'off', 'break'].includes(g?.status?.kind) ? g.status.kind : 'meeting';
    const date = ymd(g?.status?.date);
    if (kind !== 'meeting' && !date) return { error: 'date' };
    if (g?.events !== undefined && (!Array.isArray(g.events) || g.events.length > 20)) return { error: 'events' };
    const events = [];
    for (const e of g?.events ?? []) {
      const ev = validateEvent(e, etDay(now));
      if (ev.error) return ev;
      if (ev.value) events.push(ev.value);
    }
    // Known groups keep their id (the /groups#slug link); a new one gets a slug from its name. News is never taken from the client.
    const prev = old.find((o) => o.id === g?.id);
    if (prev && seen.has(prev.id)) return { error: 'group' };
    const id = prev ? prev.id : slugify(name, taken);
    taken.add(id);
    seen.add(id);
    const type = TYPE_KEYS.includes(g?.type) ? g.type : 'other';
    const v = { id, type, name, day, time: text(g?.time, 60), place: text(g?.place, 80), contact: text(g?.contact, 80), about: text(g?.about, 200),
      note: text(g?.note, 140), status: kind === 'meeting' ? { kind } : { kind, date }, events, news: prev?.news ?? [] };
    // "Updated" is stamped by the server, only when something about the group changed.
    const same = prev && JSON.stringify({ ...prev, updated: undefined }) === JSON.stringify({ ...v, updated: undefined });
    out.push({ ...v, updated: same ? prev.updated : now.toISOString() });
  }
  return { value: out };
}

export function validateLive(b) {
  if (!['auto', 'on', 'off'].includes(b?.mode)) return { error: 'mode' };
  const video = text(b?.video, 11);
  if (video && !VIDEO_ID.test(video)) return { error: 'video' };
  return { value: { mode: b.mode, video: video || undefined } };
}

/** Thumbnails: JPEG, PNG or WebP by magic bytes (the declared type is not trusted), at most 2 MB. */
export function imageType(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b.length < 12 || bytes.byteLength > 2 * 1024 * 1024) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

// ---------- Major-alert pop-up ----------
/** Alerts that pop up: active, on every page, ticked "pop-up". Group-only alerts never pop up. */
export const majorAlerts = (alerts, now) => siteAlerts(alerts, now).filter((a) => a.popup);

// Shows once per alert per browser (localStorage, else sessionStorage, else once per page load); waits while the
// live video is focused or full screen; focus goes back to the top of the page when it closes.
const POP_JS = `(()=>{const d=document.getElementById('alert-pop');if(!d||!d.showModal)return;const K='rs_seen_alerts';let st=null;
for(const n of['localStorage','sessionStorage']){try{const t=window[n];t.setItem(K+'_t','1');t.removeItem(K+'_t');st=t;break}catch(e){}}
let seen=[];try{seen=JSON.parse(st&&st.getItem(K))||[]}catch(e){}
const rows=[...d.querySelectorAll('.alert-pop-row')].filter(r=>{if(seen.includes(r.dataset.key)){r.remove();return false}return true});
if(!rows.length){d.remove();return}
const imp=rows.some(r=>r.dataset.type==='urgent');d.querySelector('h2').textContent=(imp?'Important update':'Update')+(rows.length>1?'s ('+rows.length+')':'');
d.addEventListener('close',()=>{try{st&&st.setItem(K,JSON.stringify(seen.concat(rows.map(r=>r.dataset.key)).slice(-50)))}catch(e){}const s=document.querySelector('.skip-link');if(s)s.focus({preventScroll:true})});
d.querySelector('.alert-pop-x').onclick=()=>d.close();
const busy=()=>document.fullscreenElement||document.querySelector('.hero.is-focused');
const open=()=>{if(busy())return setTimeout(open,1000);d.showModal();d.querySelector('.alert-pop-ok').focus()};
if(document.readyState==='complete')open();else addEventListener('load',open)})()`;

export const popupHtml = (majors, base = '') => (!majors.length ? '' : `<dialog class="card alert-pop" id="alert-pop" aria-labelledby="alert-pop-h">`
  + `<button class="alert-pop-x" type="button" aria-label="Close">&#x2715;</button><div class="alert-pop-head">${seal(base, 38)}<h2 class="h3" id="alert-pop-h">${majors.some((a) => a.type === 'urgent') ? 'Important update' : 'Update'}</h2></div><div class="alert-pop-body">`
  + majors.map((a) => `<div class="alert-pop-row" data-key="${esc(a.popKey ?? a.id)}" data-type="${a.type === 'urgent' ? 'urgent' : 'news'}">${icon(a.type === 'urgent' ? 'urgent' : 'news', 22)}<div><p class="alert-label">${esc(alertLabel(a))}</p><p class="alert-pop-msg"><span class="sr-only">${a.type === 'urgent' ? 'Important' : 'News'}: </span>${esc(a.message)}</p>`
    + (a.link ? `<p><a class="link link-arrow" href="${esc(a.link)}">Learn more</a></p>` : '') + '</div></div>').join('')
  + `</div><form method="dialog"><button class="btn alert-pop-ok">Got it</button></form></dialog><script>${POP_JS}</script>`);

// ---------- Church events + "Coming up" (one merged list for home and /events) ----------
const toMin = (t) => (t ? minutes(t) : -1); // all-day items first on their date
const nextOn = (today, day) => addDays(today, (day - new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7);
const timeRange = timeLabel;

/** One church-wide event from staff. Past dates are refused; saved events drop off after their date (ET). */
export function validateChurchEvent(b, today) {
  const title = text(b?.title, 80);
  const date = ymd(b?.date);
  const start = b?.start ? (HM.test(b.start) ? b.start : 'bad') : '';
  const end = b?.end ? (HM.test(b.end) ? b.end : 'bad') : '';
  const link = cleanLink(b?.link);
  if (!title) return { error: 'title' };
  if (!date) return { error: 'date' };
  if (date < today) return { error: 'past' };
  if (start === 'bad' || end === 'bad' || (end && (!start || end <= start))) return { error: 'time' };
  if (link === null) return { error: 'link' };
  return { value: { id: okId(b.id), title, date, start: start || undefined, end: end || undefined, place: text(b?.place, 80) || undefined,
    about: text(b?.about, 300) || undefined, major: Boolean(b?.major), link: link || undefined } };
}
export const currentEvents = (events = [], now) => { const today = etDay(now); return events.filter((e) => e.date >= today); };

/** Church events, group events and this week's group meetings from today on (ET), soonest first; majors first on a day. */
export function upcomingItems(events = [], groups = [], now, days = 90) {
  const today = etDay(now);
  const last = addDays(today, days);
  const inRange = (d) => d >= today && d <= last;
  const items = [];
  for (const e of events) if (inRange(e.date)) items.push({ key: `ev-${e.id}`, kind: 'church', date: e.date, sort: toMin(e.start), time: timeRange(e.start, e.end), title: e.title, place: e.place, about: e.about, major: Boolean(e.major), link: e.link });
  for (const g of groups) {
    const group = { id: g.id, name: g.name };
    for (const e of g.events ?? []) if (inRange(e.date)) items.push({ key: `gev-${g.id}-${e.id}`, kind: 'group', date: e.date, sort: toMin(e.start), time: timeRange(e.start, e.end), title: e.title, place: e.place || g.place, about: e.note, group });
    if (g.day !== VARIES && groupStatus(g, now).kind === 'meeting') {
      const d = nextOn(today, g.day);
      if (inRange(d)) items.push({ key: `meet-${g.id}`, kind: 'meeting', date: d, sort: g.time ? minutes(g.time) : -1, time: esc(g.time ?? ''), title: g.name, place: g.place, group });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || Number(b.major ?? 0) - Number(a.major ?? 0) || a.sort - b.sort || a.title.localeCompare(b.title));
}

const dayLabel = (ymd, o = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
const placeOf = (it, c) => (it.place ? esc(it.place) : it.kind === 'church' ? `<a class="link" href="mailto:${esc(c.email)}">Contact us</a>` : '');
const whenLine = (it, c) => [dayLabel(it.date), it.time, placeOf(it, c)].filter(Boolean).join(' &middot; ');
const groupLink = (it, c) => (it.group ? `<a class="link" href="${esc(c.groups)}#${esc(it.group.id)}">${it.kind === 'meeting' ? `See the group<span class="sr-only"> ${esc(it.group.name)}</span>` : esc(it.group.name)}</a>` : '');

const eventCard = (it, c) => `<li><article class="card cu-card" id="${esc(it.key)}"><div class="cu-date" aria-hidden="true"><span class="cu-day">${dayLabel(it.date, { day: 'numeric' })}</span><span class="cu-mon">${dayLabel(it.date, { month: 'short' })}</span></div>`
  + `<div class="cu-body"><p class="cu-label">Major event</p><h3>${esc(it.title)}</h3><p class="cu-when">${whenLine(it, c)}</p>`
  + (it.about ? `<p class="cu-about">${esc(it.about)}</p>` : '') + (it.link ? `<p><a class="link link-arrow" href="${esc(it.link)}">Details</a></p>` : '')
  + (it.group ? `<p>${groupLink(it, c)}</p>` : '') + '</div></article></li>';
const eventRow = (it, c) => `<li class="cu-row" id="${esc(it.key)}"><p class="cu-row-date">${dayLabel(it.date)}</p><p class="cu-row-title">`
  + (it.major ? '<span class="cu-label">Major event</span> ' : '') + `<strong>${esc(it.title)}</strong>`
  + `<span class="cu-row-meta">${[it.time, placeOf(it, c)].filter(Boolean).map((x) => `&nbsp;&middot;&nbsp;${x}`).join('')}</span></p>`
  + (it.about && it.kind !== 'meeting' ? `<p class="cu-row-about">${esc(it.about)}</p>` : '')
  + (it.link ? `<p><a class="link link-arrow" href="${esc(it.link)}">Details</a></p>` : '') + (it.group ? `<p class="cu-row-group">${groupLink(it, c)}</p>` : '') + '</li>';

/** Home "Coming up": active pop-up alerts, up to 2 major cards (30 days), then up to 6 rows (14 days).
 *  Nothing to show = '' (the section isn't there at all). c = { email, times, groups, events }. */
export function homeEventsHtml(items, alerts, now, c) {
  const today = etDay(now);
  const cards = items.filter((it) => it.major && it.date <= addDays(today, 30)).slice(0, 2);
  const rows = items.filter((it) => !cards.includes(it) && it.date <= addDays(today, 14)).slice(0, 6);
  if (!cards.length && !rows.length && !alerts.length) return '';
  return `<section class="section coming-up" aria-labelledby="coming-up-h"><div class="container"><div class="cu-head"><div><p class="eyebrow">This week &amp; ahead</p><h2 class="h1" id="coming-up-h">Coming up</h2></div>`
    + `<a class="link link-arrow" href="${esc(c.events)}">All events</a></div>`
    + (alerts.length ? `<div class="cu-alerts">${alerts.map((a) => alertCard(a)).join('')}</div>` : '')
    + (cards.length ? `<ul class="cu-cards" role="list">${cards.map((it) => eventCard(it, c)).join('')}</ul>` : '')
    + (rows.length ? `<ol class="cu-list" role="list">${rows.map((it) => eventRow(it, c)).join('')}</ol>` : '')
    + '</div></section>';
}

/** /events "Coming up": the same list for 90 days, by month; majors as cards. */
export function eventsPageHtml(items, c) {
  const head = '<div class="section-head"><p class="eyebrow">Coming up</p><h2 class="h1" id="upcoming-h">Special events &amp; <span class="accent">this week.</span></h2></div>';
  if (!items.length) {
    return `<section class="section coming-up" aria-labelledby="upcoming-h"><div class="container">${head}<p class="cu-empty">No special events right now. Join us ${esc(c.times)}.</p>`
      + `<p><a class="link link-arrow" href="${esc(c.groups)}">See weekly groups</a></p></div></section>`;
  }
  const months = [];
  for (const it of items) {
    const m = it.date.slice(0, 7);
    if (months.at(-1)?.m !== m) months.push({ m, list: [] });
    months.at(-1).list.push(it);
  }
  return `<section class="section coming-up" aria-labelledby="upcoming-h"><div class="container">${head}` + months.map(({ m, list }) => {
    const majors = list.filter((it) => it.major);
    const rest = list.filter((it) => !it.major);
    return `<h3 class="h2 cu-month">${dayLabel(`${m}-01`, { month: 'long', year: 'numeric' })}</h3>`
      + (majors.length ? `<ul class="cu-cards" role="list">${majors.map((it) => eventCard(it, c)).join('')}</ul>` : '')
      + (rest.length ? `<ol class="cu-list" role="list">${rest.map((it) => eventRow(it, c)).join('')}</ol>` : '');
  }).join('') + '</div></section>';
}

// ---------- Staff photos and bios (About › Meet the people) ----------
/** The static starting team: staff.json, with the lead pastor's existing photo. */
export const teamSeed = (staff) => staff.map((p, i) => ({ id: slugify(p.name.split(' ')[0]), name: p.name, role: p.title, bio: p.bio, photo: i === 0 ? '/media/photos/ezra.jpg' : '' }));
export const PHOTO_FILE = /^[a-z0-9-]{1,40}-[a-z0-9]{1,12}\.(jpg|png|webp)$/;

/** The first person is featured; everyone else gets a card. Same markup on the static page and from the server. */
export function teamHtml(team) {
  if (!team.length) return '';
  const [lead, ...rest] = team;
  const img = (p, cls, w, h) => `<img${cls ? ` class="${cls}"` : ''} src="${esc(p.photo)}" alt="${esc(p.name)}, ${esc(p.role)}" width="${w}" height="${h}" loading="lazy">`;
  return `<article class="lead${lead.photo ? '' : ' no-photo'}" id="${esc(lead.id)}">${lead.photo ? `<div class="lead-photo">${img(lead, '', 300, 375)}</div>` : ''}`
    + `<div class="lead-text"><p class="role">${esc(lead.role)}</p><h3>${esc(lead.name)}</h3><p>${esc(lead.bio)}</p></div></article>`
    + (rest.length ? `<ul class="team">${rest.map((p) => `<li class="member" id="${esc(p.id)}">${p.photo ? img(p, 'member-photo', 96, 96) : ''}<p class="role">${esc(p.role)}</p><h3>${esc(p.name)}</h3><p>${esc(p.bio)}</p></li>`).join('')}</ul>` : '');
}

/** Whole list in display order. A photo must be one we stored (or the seed photo). Ids stay put once given. */
export function validateTeam(list, old = []) {
  if (!Array.isArray(list) || !list.length || list.length > 30) return { error: 'team' };
  const taken = new Set(old.map((o) => o.id));
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const name = text(p?.name, 80);
    if (!name) return { error: 'name' };
    const prev = old.find((o) => o.id === p?.id);
    const id = prev ? prev.id : slugify(name.split(' ')[0], taken);
    if (seen.has(id)) return { error: 'team' };
    seen.add(id); taken.add(id);
    const photo = typeof p?.photo === 'string' ? p.photo : '';
    const okPhoto = !photo || photo === prev?.photo || photo === '/media/photos/ezra.jpg' || (photo.startsWith('/api/photo/') && PHOTO_FILE.test(photo.slice(11)));
    if (!okPhoto) return { error: 'photo' };
    out.push({ id, name, role: text(p?.role, 80), bio: text(p?.bio, 800), photo });
  }
  return { value: out };
}


// ---------- Videos and podcast episodes added in the admin (merged with the feeds, newest first) ----------
/** The 11-character id from a YouTube link: youtu.be/…, watch?v=…, /live/…, /shorts/…, /embed/…, or a bare id. */
export function parseYouTubeId(input) {
  const s = String(input ?? '').trim();
  if (VIDEO_ID.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/^((www|m|music)\.)?(youtube\.com|youtube-nocookie\.com)$|^youtu\.be$/.test(u.hostname)) return null;
  const id = u.hostname === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : u.searchParams.get('v') ?? u.pathname.match(/^\/(live|shorts|embed)\/([^/?#]+)/)?.[2];
  return id && VIDEO_ID.test(id) ? id : null;
}

export const AUDIO_MAX = 200 * 1024 * 1024;
export const AUDIO_FILE = /^ep-[a-z0-9]{1,16}\.mp3$/;
/** An MP3 starts with an ID3 tag or an MPEG audio frame sync. Anything else is refused. */
export function isMp3(head) {
  const b = new Uint8Array(head.buffer ? head.buffer.slice(head.byteOffset, head.byteOffset + Math.min(3, head.byteLength)) : head);
  return b.length >= 3 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
}

export function validateAddedVideo(b) {
  const id = String(b?.id ?? '');
  const title = text(b?.title, 120);
  const date = ymd(b?.date);
  if (!VIDEO_ID.test(id)) return { error: 'id' };
  if (!title) return { error: 'title' };
  if (!date) return { error: 'date' };
  return { value: { id, title, date } };
}

/** audio: a file we stored (/api/audio/ep-….mp3) or an https link to an MP3 somewhere else. */
export function validateEpisode(b) {
  const title = text(b?.title, 120);
  const date = ymd(b?.date);
  const audio = typeof b?.audio === 'string' ? b.audio.trim() : '';
  if (!title) return { error: 'title' };
  if (!date) return { error: 'date' };
  const local = audio.startsWith('/api/audio/') && AUDIO_FILE.test(audio.slice(11));
  let remote = false;
  try { remote = !local && new URL(audio).protocol === 'https:'; } catch {}
  if (!local && !remote) return { error: 'audio' };
  return { value: { id: okId(b?.id), title, date, about: text(b?.about, 600) || undefined, audio } };
}

const longDate = (ymd, o) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
/** One sermon card, the same on the built pages and from the server (v: id, thumbnail, thumbFallback, dateISO, dateCard, displayTitle). */
export const videoCardHtml = (v) => `<a class="card vid" href="https://www.youtube.com/watch?v=${esc(v.id)}" rel="noopener"><div class="vthumb">`
  + `<img data-vid="${esc(v.id)}" src="${esc(v.thumbnail)}" alt="" width="1280" height="720" loading="lazy" decoding="async" data-fb="${esc(v.thumbFallback)}" onerror="this.onerror=null;this.src=this.dataset.fb">`
  + `<span class="vplay" aria-hidden="true"></span></div><p class="date"><time datetime="${esc(v.dateISO)}">${esc(v.dateCard)}</time></p><h3 data-vid="${esc(v.id)}">${esc(v.displayTitle)}</h3></a>`;
export const addedVideoCard = (v) => ({ id: v.id, thumbnail: `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`, thumbFallback: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
  dateISO: v.date, dateCard: longDate(v.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), displayTitle: v.title });

/** One podcast row (s: guid, title, audioUrl, dateISO, dateLabel). */
export const episodeHtml = (s) => `<a class="ep-btn" data-pod="${esc(s.guid)}" href="${esc(s.audioUrl)}" aria-label="Play ${esc(s.title)}"></a><div class="ep-info">`
  + `<h3 data-pod="${esc(s.guid)}">${esc(s.title)}</h3><p class="date"><time datetime="${esc(s.dateISO)}">${esc(s.dateLabel)}</time><span class="ep-time" aria-live="off"></span></p>`
  + `<input class="ep-seek" data-pod="${esc(s.guid)}" type="range" min="0" max="100" step="1" value="0" aria-label="Seek ${esc(s.title)}"></div>`;
export const addedEpisode = (e) => ({ guid: `added-${e.id}`, title: e.title, audioUrl: e.audio, dateISO: e.date, dateLabel: longDate(e.date, { month: 'long', day: 'numeric', year: 'numeric' }) });

/** Put extra list items into every <ul|ol data-merge="kind"> by date, newest first. Items already in the list
 *  (same data-vid / data-pod) are skipped, so a video that later arrives in the feed shows once. */
export function mergeLists(html, kind, extra) {
  if (!extra.length) return html;
  return html.replace(new RegExp(`(<(ul|ol)\\b[^>]*\\bdata-merge="${kind}"[^>]*>)([\\s\\S]*?)(</\\2>)`, 'g'), (m, open, tag, inner, close) => {
    const limit = Number(open.match(/\bdata-limit="(\d+)"/)?.[1] ?? Infinity);
    const rows = [...inner.matchAll(/<li\b[^>]*\bdata-date="([^"]*)"[\s\S]*?<\/li>/g)].map((x) => ({ date: x[1], html: x[0] }));
    const add = extra.filter((e) => !inner.includes(`="${e.key}"`)).map((e) => ({ date: e.date, html: e.html }));
    const all = [...rows, ...add].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
    return open + all.map((r) => r.html).join('') + close;
  });
}
