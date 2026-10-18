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

export const alertCard = (a) => {
  const t = ALERT_TYPES[a.type] ?? ALERT_TYPES.news;
  return `<article class="alert alert-${a.type === 'urgent' ? 'urgent' : 'news'}" data-alert-id="${esc(a.id)}">${icon(a.type === 'urgent' ? 'urgent' : 'news', 22)}`
    + `<div><p class="alert-label">${t.label}</p><p class="alert-msg">${esc(a.message)}</p>`
    + (a.link ? `<p class="alert-more"><a class="link link-arrow" href="${esc(a.link)}">Learn more</a></p>` : '')
    + `</div><button class="alert-x" type="button" aria-label="Dismiss alert: ${esc(a.message.slice(0, 40))}">&#x2715;</button></article>`;
};

/** Banner block: first child of <main> on inner pages; on home (`home`), first child of .hero-content, in flow. */
export const alertsHtml = (alerts, home) =>
  `<div class="${home ? 'site-alerts-wrap is-home' : 'container site-alerts-wrap'}"><section class="site-alerts" aria-label="Church alerts">${alerts.map(alertCard).join('')}</section></div><script>${ALERT_JS}</script>`;

export const ALERT_CSS = `.site-alerts-wrap{margin-top:12px}
.site-alerts-wrap.is-home{margin:0 0 1.5rem}
.site-alerts{display:grid;gap:8px}
.alert{display:grid;grid-template-columns:auto 1fr auto;gap:.75rem;align-items:start;padding:.85rem 1rem;border-radius:var(--radius);box-shadow:var(--shadow-m);overflow:hidden;transition:height .25s var(--ease),opacity .25s var(--ease),padding .25s var(--ease)}
.alert .ic{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;margin-top:.15rem}
.alert-label{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;line-height:1.4}
.alert-msg{font-size:1rem;line-height:1.45;font-weight:600}
.alert-more{margin-top:.3rem;font-size:1rem}
.alert-x{width:44px;height:44px;margin:-.5rem -.5rem 0 0;border:0;border-radius:50%;background:none;font-size:1rem;line-height:1}
.alert-x:hover{background:rgb(127 127 127/.18)}
.alert-urgent{background:var(--ink);color:var(--cream);border-left:4px solid var(--gold)}
.alert-urgent .alert-label,.alert-urgent .ic,.alert-urgent .link{color:var(--gold)}
.alert-urgent :focus-visible{outline-color:var(--gold)}
.alert-news{background:var(--parchment);color:var(--ink);border:1px solid var(--line-gold);border-left:4px solid var(--gold)}
.alert-news .alert-label,.alert-news .ic{color:var(--gold-ink-sm)}
.alert.is-leaving{height:0!important;opacity:0;padding-block:0}
@media (max-width:699px){.alert{padding:.75rem .85rem}}`;

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
const hm12 = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; };
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
    const when = `${new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${hm12(e.start)}${e.end ? `&ndash;${hm12(e.end)}` : ''}`;
    return `<li><strong>${esc(e.title)}</strong><span>${when}${place ? ` &middot; ${esc(place)}` : ''}</span>${e.note ? `<span class="group-event-note">${esc(e.note)}</span>` : ''}</li>`;
  }).join('')}</ul></div>`;
};

/** The board (summary line + cards), rendered the same at build time and in the worker.
 *  c = { email, phone, involved } comes from the page (site.ts), so facts stay in one place. */
export function boardHtml(groups, now, c) {
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
  const cards = rows.map(({ g, s }) => {
    const day = g.day === VARIES ? 'Day varies' : `${DAYS[g.day]}s`;
    const when = !g.time && !g.place ? contact('When &amp; where')
      : `${day}, ${g.time ? esc(g.time) : contact('Time')} &middot; ${g.place ? esc(g.place) : contact('Place')}`;
    return `<li><article class="card group"><p class="chip-status is-${s.kind}">${icon(s.kind, 16)}${s.label}</p>`
      + `<h2 class="h3">${esc(g.name)}</h2><p class="group-when">${icon('clock', 16)}<span>${when}</span></p>`
      + (g.about ? `<p class="group-about">${esc(g.about)}</p>` : '')
      + (g.note ? `<p class="group-note">${esc(g.note)}</p>` : '')
      + (g.contact ? `<p class="group-contact">Contact: ${esc(g.contact)}</p>` : '')
      + eventsHtml(g, now)
      + (g.updated ? `<p class="group-updated">Updated ${stamp(g.updated, { month: 'short', day: 'numeric' })}</p>` : '')
      + '</article></li>';
  });
  return `${summary}<ul class="cards-grid groups" role="list">${cards.join('')}</ul>`;
}

// ---------- Validation (everything staff or visitors send passes through here) ----------
/** Plain text only: control characters and anything tag-like are removed (and everything is escaped on render). */
export const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/<[^>]*>?/g, '').trim() : '').slice(0, max);
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

export function validateAlert(b, now = new Date()) {
  const message = text(b?.message, 200);
  const expires = Date.parse(b?.expires);
  let link = text(b?.link, 500);
  if (!['urgent', 'news'].includes(b?.type)) return { error: 'type' };
  if (!message) return { error: 'message' };
  if (!(expires > +now) || expires > +now + 90 * 864e5) return { error: 'expires' };
  if (link) { try { const u = new URL(link); if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'link' }; link = u.href; } catch { return { error: 'link' }; } }
  return { value: { id: crypto.randomUUID(), type: b.type, message, link: link || undefined, expires: new Date(expires).toISOString(), created: now.toISOString() } };
}

export function validateGroups(list, old = [], now = new Date()) {
  if (!Array.isArray(list) || list.length > 50) return { error: 'groups' };
  const out = [];
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
    const v = { id: okId(g.id), name, day, time: text(g?.time, 60), place: text(g?.place, 80), contact: text(g?.contact, 80), about: text(g?.about, 200),
      note: text(g?.note, 140), status: kind === 'meeting' ? { kind } : { kind, date }, events };
    // "Updated" is stamped by the server, only when something about the group changed.
    const prev = old.find((o) => o.id === v.id);
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

// ---------- Cloudflare Access JWT (RS256, WebCrypto, keys from the team's certs endpoint) ----------
/** Claim checks: issuer is the team domain, our app's AUD tag is in aud, not expired / not before. */
export function checkClaims(c, { team, aud, now = Date.now() }) {
  const t = now / 1000;
  const auds = Array.isArray(c?.aud) ? c.aud : [c?.aud];
  return c?.iss === team.replace(/\/$/, '') && auds.includes(aud) && typeof c.exp === 'number' && c.exp > t && !(c.nbf > t + 60);
}

const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
let certs = { team: '', at: 0, keys: new Map() };

/** Returns the token's claims when valid, else null. Never throws. */
export async function verifyAccessJwt(token, { team, aud, now = Date.now(), fetchFn = fetch }) {
  try {
    const [h, p, s, extra] = String(token).split('.');
    if (!s || extra !== undefined) return null;
    const head = JSON.parse(new TextDecoder().decode(b64(h)));
    const claims = JSON.parse(new TextDecoder().decode(b64(p)));
    if (head.alg !== 'RS256' || !checkClaims(claims, { team, aud, now })) return null;
    // Keys rotate, so fetch by kid; refetch at most once a minute for an unknown kid.
    if (certs.team !== team || (!certs.keys.has(head.kid) && now - certs.at > 60e3)) {
      const res = await fetchFn(`${team.replace(/\/$/, '')}/cdn-cgi/access/certs`);
      const { keys = [] } = await res.json();
      const map = new Map();
      for (const k of keys) map.set(k.kid, await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
      certs = { team, at: now, keys: map };
    }
    const key = certs.keys.get(head.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? claims : null;
  } catch {
    return null;
  }
}
