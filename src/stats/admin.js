// The admin Statistics view: one <section id="stats" class="a-view"> with its own script. The server embeds it at <!--rs:stats-->.
// Layout and look come from the admin's shared classes (.a-head, .a-tiles, .a-card, .a-list, .a-seg); only the graph is styled here.

/** Browser code, stringified into the page as-is: it must not use anything from this module. */
function client() {
  const sec = document.getElementById('stats');
  const $ = (s) => sec.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const at = (ymd) => new Date(`${ymd}T12:00:00Z`);
  const day = (ymd, o = { month: 'short', day: 'numeric' }) => at(ymd).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
  // Change is text plus an arrow; the colour only repeats it.
  const delta = (n) => (n > 0 ? `<span class="a-delta is-up">▲ ${fmt(n)}</span>` : n < 0 ? `<span class="a-delta is-down">▼ ${fmt(-n)}</span>` : '<span class="a-delta">No change</span>');
  const signed = (n) => (n > 0 ? ` (+${fmt(n)})` : n < 0 ? ` (−${fmt(-n)})` : '');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => matchMedia('(max-width: 699px)').matches;
  const K = 'riverside-stats-range';
  let range = '30d';
  try { range = localStorage.getItem(K) || range; } catch { /* private mode: default */ }

  // ---------- graph: visits (solid + fill) and plays (dashed), plain SVG ----------
  const hour = (k) => `${+k % 12 || 12}${+k < 12 ? 'am' : 'pm'}`;
  const short = (unit, k) => (unit === 'hour' ? hour(k) : unit === 'month' ? day(`${k}-15`, { month: 'short' }) : day(k));
  const long = (unit, k) => (unit === 'hour' ? `Today, ${hour(k)}` : unit === 'month' ? day(`${k}-15`, { month: 'long', year: 'numeric' }) : day(k, { weekday: 'short', month: 'short', day: 'numeric' }));
  /** Top of the y axis: 4 equal whole-number steps of 1, 2, 2.5 or 5 x 10^n. */
  const niceTop = (max) => {
    const raw = Math.max(1, max / 4);
    const e = 10 ** Math.floor(Math.log10(raw));
    const f = raw / e;
    let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
    if (!Number.isInteger(step)) step = Math.ceil(step);
    return step * 4;
  };
  let data = null;
  let active = -1;
  let fade = false;
  const wrap = $('#st-plot');

  function draw() {
    if (!data) return;
    const pts = data.series;
    const unit = data.unit;
    const W = Math.max(240, wrap.clientWidth);
    const H = phone() ? 220 : 280;
    const L = 44, R = 12, T = 10, B = 30;
    const pw = W - L - R, ph = H - T - B;
    const empty = !pts.some((p) => p.n || p.p);
    const top = niceTop(Math.max(0, ...pts.map((p) => Math.max(p.n, p.p))));
    const x = (i) => L + (pts.length === 1 ? pw / 2 : (i / (pts.length - 1)) * pw);
    const y = (v) => T + ph - (v / top) * ph;
    const path = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
    const grid = [0, 1, 2, 3, 4].map((g) => `<line x1="${L}" x2="${W - R}" y1="${y((top * g) / 4)}" y2="${y((top * g) / 4)}" class="st-grid"/>`
      + `<text x="${L - 8}" y="${y((top * g) / 4) + 4}" text-anchor="end" class="st-ylab">${fmt((top * g) / 4)}</text>`).join('');
    const most = phone() ? 4 : 7;
    const idx = pts.length <= most ? pts.map((_, i) => i) : [...new Set(Array.from({ length: most }, (_, k) => Math.round((k * (pts.length - 1)) / (most - 1))))];
    const xl = idx.map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="${pts.length > 1 && i === 0 ? 'start' : pts.length > 1 && i === pts.length - 1 ? 'end' : 'middle'}" class="st-xlab">${esc(short(unit, pts[i].key))}</text>`).join('');
    const per = unit === 'hour' ? 'hour today' : unit;
    const span = unit === 'hour' ? '' : `, ${long(unit, pts[0].key)} to ${long(unit, pts.at(-1).key)}`;
    const lines = empty ? `<text x="${L + pw / 2}" y="${T + ph / 2}" text-anchor="middle" class="st-empty">No visits counted yet in this period.</text>`
      : `<g class="${fade && !reduce ? 'st-fade' : ''}">${pts.length > 1 ? `<path d="${path('n')} L${x(pts.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z" class="st-area"/>` : ''}`
        + `<path d="${path('n')}" class="st-visits"/><path d="${path('p')}" class="st-plays"/>`
        + (pts.length === 1 ? `<circle cx="${x(0)}" cy="${y(pts[0].n)}" r="4" class="st-dot-v"/><circle cx="${x(0)}" cy="${y(pts[0].p)}" r="4" class="st-dot-p"/>` : '') + '</g>';
    wrap.innerHTML = `<svg width="${W}" height="${H}" class="st-svg">${grid}${xl}${lines}`
      + `<g id="st-focus" ${empty ? '' : `tabindex="0" role="application" aria-roledescription="chart" aria-label="${esc(`Visits and plays per ${per}${span}. Use the arrow keys to read each ${unit === 'hour' ? 'hour' : unit}.`)}"`}>`
      + `<rect x="${L}" y="${T}" width="${pw}" height="${ph}" class="st-hit"/><line class="st-guide" y1="${T}" y2="${T + ph}" hidden/>`
      + `<circle r="5" class="st-dot-v st-cur" hidden/><circle r="5" class="st-dot-p st-cur" hidden/></g></svg>`
      + '<div class="a-card st-tip" aria-hidden="true" hidden></div>';
    fade = false;
    const svg = wrap.querySelector('svg');
    const tip = wrap.querySelector('.st-tip');
    const [guide] = svg.querySelectorAll('.st-guide');
    const [dv, dp] = svg.querySelectorAll('.st-cur');
    const show = (i) => {
      active = i;
      if (i < 0 || empty) { guide.setAttribute('hidden', ''); dv.setAttribute('hidden', ''); dp.setAttribute('hidden', ''); tip.hidden = true; return; }
      const p = pts[i];
      guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.removeAttribute('hidden');
      dv.setAttribute('cx', x(i)); dv.setAttribute('cy', y(p.n)); dv.removeAttribute('hidden');
      dp.setAttribute('cx', x(i)); dp.setAttribute('cy', y(p.p)); dp.removeAttribute('hidden');
      tip.innerHTML = `<strong>${esc(long(unit, p.key))}</strong><br>Visits ${fmt(p.n)} · Plays ${fmt(p.p)}`;
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = `${x(i) + 12 + tw > W ? x(i) - 12 - tw : x(i) + 12}px`;
      tip.style.top = `${Math.max(0, Math.min(y(Math.max(p.n, p.p)) - 20, H - tip.offsetHeight - B))}px`;
    };
    if (empty) return;
    const near = (e) => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(pts.length - 1, Math.round(pts.length === 1 ? 0 : ((e.clientX - r.left - L) / pw) * (pts.length - 1)))); };
    svg.addEventListener('pointermove', (e) => show(near(e)));
    svg.addEventListener('pointerleave', () => { if (document.activeElement !== svg.querySelector('#st-focus')) show(-1); });
    const g = svg.querySelector('#st-focus');
    const say = (i) => { const p = pts[i]; $('#st-live').textContent = `${long(unit, p.key)}: ${fmt(p.n)} ${p.n === 1 ? 'visit' : 'visits'}, ${fmt(p.p)} ${p.p === 1 ? 'play' : 'plays'}`; };
    g.addEventListener('focus', () => { const i = active >= 0 ? active : pts.length - 1; show(i); say(i); });
    g.addEventListener('blur', () => show(-1));
    g.addEventListener('keydown', (e) => {
      const to = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: pts.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      const i = Math.max(0, Math.min(pts.length - 1, to));
      show(i); say(i);
    });
    if (active >= 0 && active < pts.length && document.activeElement === document.body) show(active);
  }
  let rt = 0;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(draw, 150); }).observe(wrap);

  function table(d) {
    const unit = d.unit === 'hour' ? 'Hour' : d.unit === 'month' ? 'Month' : 'Day';
    $('#st-table').innerHTML = `<caption>Visits and plays per ${unit.toLowerCase()}</caption><thead><tr><th scope="col">${unit}</th><th scope="col">Visits</th><th scope="col">Plays</th></tr></thead>`
      + `<tbody>${d.series.map((p) => `<tr><td>${esc(long(d.unit, p.key))}</td><td>${p.n}</td><td>${p.p}</td></tr>`).join('')}</tbody>`;
  }

  // A list row with the value on the right and a thin bar (decoration: the number is always printed).
  const row = (name, value, n, top, meta = '') => `<li><span class="a-list-text"><span class="a-list-main">${esc(name)}</span>${meta ? `<span class="a-list-meta">${meta}</span>` : ''}</span>`
    + `<span class="a-list-end st-val">${value}</span><span class="a-bar" aria-hidden="true"><span style="width:${top ? Math.round((n / top) * 100) : 0}%"></span></span></li>`;

  function render(d) {
    const tz = ' · Times are Eastern';
    $('#st-span').textContent = d.range === 'day' ? `Today so far, ${day(d.end)}${tz}`
      : d.range === 'all' ? (d.first ? `Since ${day(d.first, { month: 'short', day: 'numeric', year: 'numeric' })}${tz}` : `Counting started ${day(d.end, { month: 'short', day: 'numeric', year: 'numeric' })}.`)
      : `${day(d.start)} – ${day(d.end)}${tz}${d.first && d.first > d.start ? ` · Counting started ${day(d.first, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`;
    const tile = (id, num, note) => { $(`#${id}`).innerHTML = `${num}${note ? `<p class="a-tile-note">${note}</p>` : ''}`; };
    const num = (n) => `<p class="a-tile-num">${fmt(n)}</p>`;
    const s = d.subscribers;
    tile('st-subs', num(s.total), s.total || s.added || s.removed ? `${delta(s.change)} in this period` : 'No subscribers yet. People join on the Subscribe page.');
    tile('st-vis', num(d.visitors), d.views ? `${fmt(d.views)} page ${d.views === 1 ? 'view' : 'views'}${d.range === 'day' ? '' : '. Someone who comes on 3 days counts 3 times.'}` : 'No visits counted yet in this period.');
    tile('st-video', num(d.plays.video), d.plays.video ? 'Plays started on our site. Plays on YouTube itself aren’t counted here.' : 'No plays yet.');
    tile('st-pod', num(d.plays.podcast), d.plays.podcast ? 'Plays started on our podcast page.' : 'No plays yet.');
    const yt = d.youtube;
    tile('st-yt', yt.on && yt.channel ? num(yt.channel.n) : '<p class="a-tile-num">–</p>', !yt.on ? 'Not set up yet. Ask your web developer to turn this on.'
      : !yt.channel ? 'The first YouTube count is taken today. Check back tomorrow.'
        : `${yt.channel.since ? `Since ${day(yt.channel.since)}, when counting began. ` : ''}The live video on the home page plays muted by itself, and YouTube may count that as a view.`);
    data = d;
    active = -1;
    draw();
    table(d);
    const top = Math.max(1, ...d.pages.map((p) => p.n));
    $('#st-pages').innerHTML = d.pages.length ? d.pages.map((p) => row(p.name, fmt(p.n), p.n, top)).join('') : '<li class="a-sub">No visits counted yet in this period.</li>';
    const lists = [...s.lists, ...s.groups.flatMap((t) => t.lists.map((l) => ({ ...l, type: t.label })))];
    const most = Math.max(1, ...lists.map((l) => l.n));
    $('#st-lists').innerHTML = s.total || s.added || s.removed
      ? lists.map((l) => row(l.label, `${fmt(l.n)}${signed(l.change)}`, l.n, most, l.type ? esc(l.type) : '')).join('')
      : '<li class="a-sub">No subscribers yet. People join on the Subscribe page.</li>';
    const vids = yt.on ? yt.top : [];
    $('#st-yt-card').hidden = !vids.length;
    const vtop = Math.max(1, ...vids.map((v) => v.n));
    $('#st-videos').innerHTML = vids.map((v) => row(v.title, fmt(v.n), v.n, vtop)).join('');
  }

  async function load() {
    sec.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
    try {
      const r = await fetch(`/api/admin/stats/summary?range=${range}`);
      if (r.status === 403) return; // no access to Statistics (a limited account): nothing to show, no error
      if (!r.ok) throw new Error(String(r.status));
      fade = true;
      render(await r.json());
    } catch { $('#st-span').textContent = 'Couldn’t load the numbers. Check your connection and try again.'; }
  }
  sec.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    range = b.dataset.range;
    try { localStorage.setItem(K, range); } catch { /* fine */ }
    load();
  }));
  load();
  // Fresh numbers each time the view is opened again, or the tab comes back into view.
  addEventListener('hashchange', () => { if (location.hash === '#stats') load(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && location.hash === '#stats') load(); });
}

// Only what the shared admin classes don't cover: the graph and the two-column card grid.
const CSS = `#stats ul.a-tiles{list-style:none;padding:0;margin:0;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))}
@media (max-width:699px){#stats ul.a-tiles{grid-template-columns:1fr 1fr}#stats .a-tile:last-child:nth-child(odd){grid-column:1/-1}}
@media (max-width:359px){#stats ul.a-tiles{grid-template-columns:1fr}}
#stats .st-chart{margin-top:1.5rem}
#stats .st-chart .a-card-h{flex-wrap:wrap;gap:.75rem 1rem;align-items:flex-start}
#stats .st-legend{display:flex;gap:1.25rem;margin:0 0 .5rem;padding:0;list-style:none;font-size:14px;color:var(--a-muted)}
#stats .st-legend li{display:flex;align-items:center;gap:.5rem}
#stats .st-key{width:24px;height:0;border-top:2px solid var(--a-accent)}
#stats .st-key.plays{border-top:2px dashed var(--a-muted)}
#stats .st-plotbox{position:relative}
#stats .st-svg{display:block;overflow:visible}
#stats .st-grid{stroke:var(--a-border);stroke-width:1}
#stats .st-ylab,#stats .st-xlab{font-size:12px;fill:var(--a-muted);font-variant-numeric:tabular-nums}
#stats .st-empty{font-size:14px;fill:var(--a-muted)}
#stats .st-area{fill:var(--a-accent-line);opacity:.18}
#stats .st-visits{fill:none;stroke:var(--a-accent);stroke-width:2;stroke-linejoin:round}
#stats .st-plays{fill:none;stroke:var(--a-muted);stroke-width:2;stroke-dasharray:6 4;stroke-linejoin:round}
#stats .st-dot-v{fill:#fff;stroke:var(--a-accent);stroke-width:2}
#stats .st-dot-p{fill:#fff;stroke:var(--a-muted);stroke-width:2;stroke-dasharray:3 2}
#stats .st-guide{stroke:var(--a-border-strong);stroke-width:1}
#stats .st-hit{fill:transparent;stroke:none}
#stats svg [hidden]{display:none}
#stats #st-focus{outline:none}
#stats #st-focus:focus-visible .st-hit{stroke:var(--a-accent);stroke-width:2}
#stats .st-tip{position:absolute;padding:8px 12px;font-size:13px;line-height:1.45;white-space:nowrap;pointer-events:none;box-shadow:var(--a-shadow)}
#stats .st-fade{animation:st-fade .2s ease-out}
@keyframes st-fade{from{opacity:0}}
#stats .st-cols{display:grid;gap:1.5rem;margin-top:1.5rem}
#stats .st-foot{margin-top:1.5rem}
#stats .st-val{font-variant-numeric:tabular-nums;font-weight:600}
@media (min-width:1024px){#stats .st-cols{grid-template-columns:1fr 1fr;align-items:start}}
@media (max-width:699px){#stats .st-chart .a-seg{display:grid;grid-template-columns:repeat(5,1fr);width:100%}#stats .st-chart .a-seg button{min-height:44px;padding-inline:4px;white-space:nowrap}}
@media (max-width:419px){#stats .st-chart .a-seg button{font-size:14px;padding-inline:2px}}
@media (prefers-reduced-motion:reduce){#stats .st-fade{animation:none}}`;

export function statsSection() {
  const seg = (v, label) => `<button type="button" data-range="${v}" aria-pressed="${v === '30d'}">${label}</button>`;
  const tile = (id, label) => `<li class="a-tile"><p class="a-tile-label">${label}</p><div id="${id}"></div></li>`;
  return `<section id="stats" class="a-view" aria-labelledby="stats-h" hidden><style>${CSS}</style>
<div class="a-head"><div><h1 id="stats-h" class="a-title" tabindex="-1">Statistics</h1><p class="a-sub">How many people visit, listen and read our emails.</p></div></div>
<ul class="a-tiles" role="list">${tile('st-subs', 'Email subscribers')}${tile('st-vis', 'Visits')}${tile('st-video', 'Video plays on our site')}${tile('st-pod', 'Podcast plays')}${tile('st-yt', 'Views on YouTube')}</ul>
<div class="a-card st-chart">
<div class="a-card-h"><div><h2 class="a-h2">Visits and plays</h2><p class="a-sub" id="st-span" aria-live="polite"></p></div>
<div class="a-seg" role="group" aria-label="Period">${seg('day', 'Last day')}${seg('7d', '7 days')}${seg('30d', '30 days')}${seg('12m', '12 months')}${seg('all', 'All time')}</div></div>
<ul class="st-legend" aria-hidden="true"><li><span class="st-key"></span>Visits</li><li><span class="st-key plays"></span>Plays</li></ul>
<div class="st-plotbox" id="st-plot"></div>
<p class="sr-only" aria-live="polite" id="st-live"></p>
<table class="sr-only" id="st-table"></table>
</div>
<div class="st-cols">
<div class="a-card"><div class="a-card-h"><h2 class="a-h2">Top pages</h2></div><ol class="a-list" id="st-pages" role="list"></ol></div>
<div class="a-card"><div class="a-card-h"><h2 class="a-h2">By list</h2></div><ul class="a-list" id="st-lists" role="list"></ul></div>
<div class="a-card" id="st-yt-card" hidden><div class="a-card-h"><h2 class="a-h2">Recent videos on YouTube</h2></div><ul class="a-list" id="st-videos" role="list"></ul></div>
</div>
<p class="a-sub st-foot">Counted by the website itself, without cookies. Bots and staff are left out, so treat these as estimates.</p>
<script>(${client})()</script>
</section>`;
}
