// The admin Statistics tab: one <section id="stats"> with its own script. The server embeds it at <!--rs:stats-->.

/** Browser code, stringified into the page as-is: it must not use anything from this module. */
function client() {
  const sec = document.getElementById('stats');
  const $ = (s) => sec.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const at = (ymd) => new Date(`${ymd}T12:00:00Z`);
  const day = (ymd, o = { month: 'short', day: 'numeric' }) => at(ymd).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
  const change = (n) => (n > 0 ? `▲ ${fmt(n)} in this period` : n < 0 ? `▼ ${fmt(-n)} in this period` : 'No change');
  const signed = (n) => (n > 0 ? ` (+${fmt(n)})` : n < 0 ? ` (−${fmt(-n)})` : '');
  const K = 'riverside-stats-range';
  let range = '30d';
  try { range = localStorage.getItem(K) || range; } catch { /* private mode: default */ }

  const label = (unit, key) => (unit === 'hour' ? `${+key % 12 || 12}${+key < 12 ? 'am' : 'pm'}` : unit === 'month' ? day(`${key}-15`, { month: 'short', year: 'numeric' }) : day(key, { weekday: 'short', month: 'short', day: 'numeric' }));

  function chart(d) {
    const pts = d.series;
    const unit = d.unit === 'hour' ? 'hour' : d.unit === 'month' ? 'month' : 'day';
    const box = $('#st-chart');
    if (!pts.some((p) => p.n)) { box.innerHTML = '<p class="muted">No visits counted yet in this period.</p>'; return; }
    const max = Math.max(...pts.map((p) => p.n));
    const lo = pts.reduce((a, p) => (p.n < a.n ? p : a), pts[0]);
    const hi = pts.reduce((a, p) => (p.n > a.n ? p : a), pts[0]);
    const x = (i) => (pts.length === 1 ? 300 : (i / (pts.length - 1)) * 600);
    const y = (n) => 196 - (n / max) * 180;
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.n).toFixed(1)}`).join(' ');
    const grid = [0.25, 0.5, 0.75, 1].map((f) => `<path d="M0 ${y(max * f).toFixed(1)}H600" class="st-grid"/>`).join('');
    const ticks = [...new Set([0, Math.round((pts.length - 1) / 3), Math.round((2 * (pts.length - 1)) / 3), pts.length - 1])];
    const what = d.unit === 'hour' ? 'Visits per hour today' : `Visits per ${unit}`;
    const span = d.unit === 'hour' ? '' : `, ${label(d.unit, pts[0].key)} to ${label(d.unit, pts.at(-1).key)}`;
    box.innerHTML = `<p class="hint">Most in one ${unit}: ${fmt(max)}</p>`
      + `<svg viewBox="0 0 600 200" preserveAspectRatio="none" width="100%" height="220" role="img" aria-label="${esc(`${what}${span}: lowest ${fmt(lo.n)}, highest ${fmt(hi.n)} on ${label(d.unit, hi.key)}`)}">`
      + `${grid}<path d="${line} L${x(pts.length - 1)} 200 L${x(0)} 200 Z" class="st-area"/><path d="${line}" class="st-line" vector-effect="non-scaling-stroke"/>${pts.length === 1 ? `<path d="M300 ${y(pts[0].n).toFixed(1)}h0" class="st-dot" vector-effect="non-scaling-stroke"/>` : ''}</svg>`
      + `<div class="st-x" aria-hidden="true">${ticks.map((i) => `<span>${esc(d.unit === 'day' ? day(pts[i].key) : label(d.unit, pts[i].key))}</span>`).join('')}</div>`
      + `<table class="sr-only"><caption>${esc(what)}</caption><thead><tr><th scope="col">${unit === 'hour' ? 'Hour' : unit === 'month' ? 'Month' : 'Day'}</th><th scope="col">Visits</th></tr></thead>`
      + `<tbody>${pts.map((p) => `<tr><td>${esc(label(d.unit, p.key))}</td><td>${p.n}</td></tr>`).join('')}</tbody></table>`;
  }

  function render(d) {
    const tz = ' · Times are Eastern';
    $('#st-span').textContent = d.range === 'day' ? `Today so far, ${day(d.end)}${tz}`
      : d.range === 'all' ? (d.first ? `Since ${day(d.first, { month: 'short', day: 'numeric', year: 'numeric' })}${tz}` : `Counting started ${day(d.end, { month: 'short', day: 'numeric', year: 'numeric' })}.`)
      : `${day(d.start)} – ${day(d.end)}${tz}${d.first && d.first > d.start ? ` · Counting started ${day(d.first, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`;
    const s = d.subscribers;
    const rows = (lists) => lists.map((l) => `<li><span>${esc(l.label)}</span><span class="st-num">${fmt(l.n)}${signed(l.change)}</span></li>`).join('');
    $('#st-subs').innerHTML = s.total || s.added || s.removed
      ? `<span class="st-n">${fmt(s.total)}</span><span class="hint">${change(s.change)}</span>`
        + `<details><summary>By list</summary><ul class="st-rows" role="list">${rows(s.lists)}</ul>`
        + s.groups.map((t) => `<p class="st-type">${esc(t.label)}</p><ul class="st-rows" role="list">${rows(t.lists)}</ul>`).join('') + '</details>'
      : '<p class="muted">No subscribers yet. People join on the Subscribe page.</p>';
    const one = d.range === 'day';
    $('#st-vis').innerHTML = d.views
      ? `<span class="st-n">${fmt(d.visitors)}</span><span class="hint">${fmt(d.views)} page ${d.views === 1 ? 'view' : 'views'}</span>`
        + (one ? '' : '<span class="hint">Someone who comes on 3 days counts 3 times.</span>')
      : '<p class="muted">No visits counted yet in this period.</p>';
    const play = (n) => (n ? `<span class="st-n">${fmt(n)}</span>` : '<p class="muted">No plays yet.</p>');
    $('#st-video').innerHTML = `${play(d.plays.video)}<span class="hint">Plays started on our site. Plays on YouTube itself aren’t counted here.</span>`;
    $('#st-pod').innerHTML = `${play(d.plays.podcast)}<span class="hint">Plays started on our podcast page.</span>`;
    const yt = d.youtube;
    $('#st-yt').innerHTML = !yt.on
      ? '<p class="muted">Not set up yet. Ask your web developer to turn this on.</p>'
      : !yt.channel ? '<p class="muted">The first YouTube count is taken today. Check back tomorrow.</p>'
        : `<span class="st-n">${fmt(yt.channel.n)}</span>${yt.channel.since ? `<span class="hint">Since ${day(yt.channel.since)}, when counting began.</span>` : ''}`
          + (yt.top.length ? `<details><summary>Recent videos</summary><ul class="st-rows" role="list">${yt.top.map((v) => `<li><span>${esc(v.title)}</span><span class="st-num">${fmt(v.n)}</span></li>`).join('')}</ul></details>` : '')
          + '<span class="hint">The live video on the home page plays muted by itself, and YouTube may count that as a view.</span>';
    chart(d);
    $('#st-pages').innerHTML = d.pages.length
      ? d.pages.map((p) => `<li><span>${esc(p.name)}</span><span class="st-num">${fmt(p.n)}</span></li>`).join('')
      : '<li class="muted">No visits counted yet in this period.</li>';
  }

  async function load() {
    sec.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
    try {
      const r = await fetch(`/api/admin/stats/summary?range=${range}`);
      if (!r.ok) throw new Error(String(r.status));
      render(await r.json());
    } catch { $('#st-span').textContent = 'Couldn’t load the numbers. Check your connection and try again.'; }
  }
  sec.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    range = b.dataset.range;
    try { localStorage.setItem(K, range); } catch { /* fine */ }
    load();
  }));
  load();
}

const CSS = `#stats .st-tiles{grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));align-items:start;padding:0;margin-top:1rem}
#stats .st-dot{stroke:var(--ink);stroke-width:10;stroke-linecap:round}
#stats .st-tile{display:grid;gap:.35rem;align-content:start;padding:1.1rem 1.25rem}
#stats .st-h{font-size:var(--step--1);font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
#stats .st-body{display:grid;gap:.35rem}
#stats .st-n{font-family:var(--font-display);font-size:var(--step-3);line-height:1.1;color:var(--ink)}
#stats details summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:700}
#stats details summary::after{content:'+';margin-left:.5rem;font-size:1.2rem}
#stats details[open] summary::after{content:'−'}
#stats .st-rows{list-style:none;padding:0;display:grid}
#stats .st-rows li,#stats .st-pages li{display:flex;justify-content:space-between;gap:1rem;padding:.55rem 0;border-top:1px solid var(--line)}
#stats .st-num{font-variant-numeric:tabular-nums;white-space:nowrap}
#stats .st-type{margin-top:.5rem;font-size:var(--step--1);font-weight:700;color:var(--muted)}
#stats .st-chart{margin-top:1.5rem;padding:1.1rem 1.25rem}
#stats svg{display:block;overflow:visible}
#stats .st-grid{stroke:var(--line);stroke-width:1;vector-effect:non-scaling-stroke}
#stats .st-line{fill:none;stroke:var(--ink);stroke-width:2;stroke-linejoin:round}
#stats .st-area{fill:var(--gold-soft);opacity:.3}
#stats .st-x{display:flex;justify-content:space-between;gap:.5rem;font-size:var(--step--1);color:var(--muted);margin-top:.35rem}
#stats .st-pages{padding:0;list-style:none}
#stats .st-foot{margin-top:1.5rem;font-size:var(--step--1)}`;

export function statsSection() {
  const chip = (v, label) => `<li><button type="button" class="chip" data-range="${v}" aria-pressed="${v === '30d'}">${label}</button></li>`;
  const tile = (id, h) => `<li class="card st-tile"><span class="st-h" id="${id}-h">${h}</span><div id="${id}" class="st-body"></div></li>`;
  return `<section id="stats" aria-labelledby="stats-h"><style>${CSS}</style>
<h2 id="stats-h" class="h2">Statistics</h2>
<ul class="chips seg" role="list" aria-label="Period">${chip('day', 'Last day')}${chip('7d', '7 days')}${chip('30d', '30 days')}${chip('12m', '12 months')}${chip('all', 'All time')}</ul>
<p class="muted" id="st-span" aria-live="polite"></p>
<ul class="cards-grid st-tiles" role="list">
${tile('st-subs', 'Email subscribers')}${tile('st-vis', 'Visits')}${tile('st-video', 'Video plays on our site')}${tile('st-pod', 'Podcast plays')}${tile('st-yt', 'Views on YouTube')}
</ul>
<div class="card st-chart"><h3 class="h3" style="margin-top:0">Visits over time</h3><div id="st-chart"></div></div>
<h3 class="h3">Top pages</h3>
<ol class="st-pages" id="st-pages"></ol>
<p class="muted st-foot">Counted by the website itself, without cookies. Bots and staff are left out, so treat these as estimates.</p>
<script>(${client})()</script>
</section>`;
}
