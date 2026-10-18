// The whole server side: static dist/ is served by Workers static assets; this script only runs for the
// paths listed in wrangler.jsonc. It (1) serves /api/*, (2) injects live data into the static HTML with
// HTMLRewriter when there is something to inject, (3) guards /api/admin/* with Cloudflare Access.
// Public pages fail open (the static HTML is a correct default); admin fails closed.
import {
  ALERT_CSS, ALERT_TYPES, EMAIL, VIDEO_ID, activeAlerts, alertsHtml, boardHtml, esc, imageType,
  text, validateAlert, validateGroups, validateLive, verifyAccessJwt,
} from './lib/state.js';
import { TOPICS, countRecipients, mailConfigured, sendAlert, subscribe } from './mailer.js';
import { MAILCHIMP_NEWS } from './lib/links.ts';
import SEED_GROUPS from './content/groups.json';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const bad = (error, status = 400) => json({ error }, status);

// One KV key holds everything: { alerts, videos, podcast, groups, live }. One read per page view,
// kept in this isolate for 60s and in KV's edge cache (cacheTtl) for 60s, so edits show within about a minute.
let cache = { at: 0, state: {} };
async function publicState(env) {
  if (Date.now() - cache.at > 60e3) cache = { at: Date.now(), state: (await env.SITE.get('state', { type: 'json', cacheTtl: 60 })) ?? {} };
  return cache.state;
}
const freshState = async (env) => (await env.SITE.get('state', { type: 'json' })) ?? {};
// ponytail: last write wins if two staff save at the same second; per-section keys if that ever bites.
async function saveState(env, state) {
  await env.SITE.put('state', JSON.stringify(state));
  cache = { at: Date.now(), state };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p.startsWith('/api/')) {
      try {
        return await api(req, env, url, p);
      } catch (e) {
        console.error(e);
        return bad('server', 500);
      }
    }
    // HTML must not be answered 304 from the static file's ETag: the injected data may have changed.
    const h = new Headers(req.headers);
    h.delete('If-None-Match');
    h.delete('If-Modified-Since');
    const res = await env.ASSETS.fetch(new Request(req, { headers: h }));
    if (p === '/admin' || p.startsWith('/admin/')) {
      const r = new Response(res.body, res);
      r.headers.set('X-Robots-Tag', 'noindex, nofollow');
      r.headers.set('Cache-Control', 'no-store');
      return r;
    }
    if (!(res.headers.get('Content-Type') ?? '').includes('text/html')) return res;
    try {
      return rewrite(res, await publicState(env), p);
    } catch (e) {
      console.error(e);
      return res;
    }
  },
};

function rewrite(res, state, p) {
  const now = new Date();
  const alerts = activeAlerts(state.alerts, now);
  const live = state.live ?? { mode: 'auto' };
  const videos = state.videos ?? {};
  const podcast = state.podcast ?? {};
  const isGroups = p === '/groups' || p === '/groups/';
  const liveAttrs = live.mode !== 'auto' || live.video;
  if (!alerts.length && !liveAttrs && !Object.keys(videos).length && !Object.keys(podcast).length && !isGroups) return res;

  const rw = new HTMLRewriter();
  if (liveAttrs) {
    rw.on('html', {
      element(el) {
        if (live.mode !== 'auto') el.setAttribute('data-live-force', live.mode);
        if (live.video) el.setAttribute('data-live-video', live.video);
      },
    });
  }
  if (alerts.length) {
    rw.on('head', { element: (el) => el.append(`<style>${ALERT_CSS}</style>`, { html: true }) });
    // Home: in flow at the top of the hero copy (before the live affordance when there is one), so it never covers it.
    if (p === '/') rw.on('.hero-content', { element: (el) => el.prepend(alertsHtml(alerts, true), { html: true }) });
    else rw.on('main', { element: (el) => el.prepend(alertsHtml(alerts, false), { html: true }) });
  }
  // Same data-* hooks as the static markup: img = thumbnail, a.player = iframe title, anything else = title text.
  rw.on('[data-vid]', {
    element(el) {
      const o = videos[el.getAttribute('data-vid')];
      if (!o) return;
      if (el.tagName === 'img') { if (o.thumb) el.setAttribute('src', `/api/thumb/${o.thumb}`); }
      else if (el.tagName === 'a') { if (o.title) el.setAttribute('data-title', `${o.title}, ${el.getAttribute('data-date')}`); }
      else if (o.title) el.setInnerContent(o.title);
    },
  });
  rw.on('[data-pod]', {
    element(el) {
      const t = podcast[el.getAttribute('data-pod')]?.title;
      if (!t) return;
      if (el.tagName === 'h3') el.setInnerContent(t);
      else el.setAttribute('aria-label', `${el.getAttribute('aria-label').split(' ')[0]} ${t}`);
    },
  });
  if (isGroups) {
    rw.on('#groups-board', {
      element(el) {
        const c = { email: el.getAttribute('data-email'), phone: el.getAttribute('data-phone'), involved: el.getAttribute('data-involved') };
        el.setInnerContent(boardHtml(state.groups ?? SEED_GROUPS, now, c), { html: true });
      },
    });
  }
  const out = rw.transform(res);
  const r = new Response(out.body, out);
  r.headers.delete('ETag');
  r.headers.delete('Last-Modified');
  r.headers.set('Cache-Control', 'no-cache');
  return r;
}

async function api(req, env, url, p) {
  if (p === '/api/subscribe' && req.method === 'POST') return subscribeRoute(req, env);
  if (p.startsWith('/api/thumb/') && req.method === 'GET') {
    const key = p.slice('/api/thumb/'.length);
    if (!/^[\w-]{11}-[a-z0-9]{1,12}$/.test(key)) return bad('not_found', 404);
    const { value, metadata } = await env.SITE.getWithMetadata(`thumb:${key}`, { type: 'arrayBuffer', cacheTtl: 86400 });
    if (!value) return bad('not_found', 404);
    return new Response(value, {
      headers: { 'Content-Type': metadata.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  if (p.startsWith('/api/admin/')) return adminApi(req, env, url, p);
  return bad('not_found', 404);
}

async function subscribeRoute(req, env) {
  const f = await req.formData().catch(() => null);
  if (!f) return bad('form');
  if (f.get(MAILCHIMP_NEWS.honeypot)) return json({ ok: true }); // bots fill the hidden field; tell them it worked
  const email = String(f.get('EMAIL') ?? '').trim();
  const topics = [...new Set(f.getAll('topic'))].filter((t) => t in TOPICS);
  if (email.length > 254 || !EMAIL.test(email)) return bad('email');
  if (!topics.length) return bad('topic');
  if (!mailConfigured(env)) return bad('not_configured', 503);
  try {
    await subscribe(env, email, topics);
  } catch (e) {
    console.error(e);
    return bad('mailchimp', 502);
  }
  return json({ ok: true });
}

// ---------- Admin ----------
async function adminUser(req, env, url) {
  // Local development only: .dev.vars sets DEV_ADMIN=1, and it is ignored on any real hostname.
  if (env.DEV_ADMIN === '1' && ['localhost', '127.0.0.1'].includes(url.hostname)) return { email: env.DEV_EMAIL || 'dev@localhost' };
  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) return null;
  return verifyAccessJwt(token, { team: env.TEAM_DOMAIN, aud: env.POLICY_AUD });
}

const emailFor = (a) => {
  const label = ALERT_TYPES[a.type].label;
  return {
    subject: `${label}: ${a.message}`.slice(0, 150),
    html: `<p style="font:700 13px Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#6b4f10">${label}</p>`
      + `<p style="font:600 17px/1.5 Arial,sans-serif;color:#1c1c1c">${esc(a.message)}</p>`
      + (a.link ? `<p style="font:17px Arial,sans-serif"><a href="${esc(a.link)}">Learn more</a></p>` : '')
      + '<p style="font:12px/1.5 Arial,sans-serif;color:#57514a">*|LIST:ADDRESSLINE|*<br><a href="*|UNSUB|*">Unsubscribe</a></p>',
  };
};

async function adminApi(req, env, url, p) {
  const user = await adminUser(req, env, url);
  if (!user) return bad('forbidden', 403);
  if (req.method !== 'GET' && req.headers.get('Origin') !== url.origin) return bad('origin', 403);
  const [route, a1, a2] = p.slice('/api/admin/'.length).split('/');
  const key = `${req.method} ${route}`;
  if (key === 'POST thumb') return thumbRoute(req, env, a1);
  const body = ['POST', 'PUT'].includes(req.method) ? await req.json().catch(() => null) : null;
  const state = await freshState(env);

  switch (key) {
    case 'GET state':
      return json({ state: { ...state, groups: state.groups ?? SEED_GROUPS }, email: mailConfigured(env), user: user.email ?? '' });

    case 'GET recipients': {
      const type = url.searchParams.get('type');
      if (!ALERT_TYPES[type]) return bad('type');
      if (!mailConfigured(env)) return bad('email_not_configured', 503);
      return json({ count: await countRecipients(env, ALERT_TYPES[type].topic) });
    }

    case 'POST test-email': {
      const v = validateAlert(body);
      if (v.error) return bad(v.error);
      if (!mailConfigured(env)) return bad('email_not_configured', 503);
      if (!user.email) return bad('no_email');
      const m = emailFor(v.value);
      await sendAlert(env, ALERT_TYPES[v.value.type].topic, m.subject, m.html, user.email);
      return json({ ok: true, to: user.email });
    }

    case 'POST alerts': {
      const v = validateAlert(body);
      if (v.error) return bad(v.error);
      if (body.email && !mailConfigured(env)) return bad('email_not_configured', 503);
      const alert = v.value;
      // Editing = replace: the edited alert gets a new id, so visitors who dismissed the old one see it again.
      state.alerts = [...activeAlerts(state.alerts).filter((x) => x.id !== body.replaces), alert];
      await saveState(env, state);
      if (!body.email) return json({ alert });
      try {
        const m = emailFor(alert);
        await sendAlert(env, ALERT_TYPES[alert.type].topic, m.subject, m.html);
      } catch (e) {
        console.error(e);
        return json({ error: 'email_failed', alert }, 502);
      }
      alert.emailed = true;
      await saveState(env, state);
      return json({ alert });
    }

    case 'DELETE alerts':
      state.alerts = (state.alerts ?? []).filter((x) => x.id !== a1);
      await saveState(env, state);
      return json({ ok: true });

    case 'PUT items':
    case 'DELETE items': {
      const kind = a1 === 'video' ? 'videos' : a1 === 'podcast' ? 'podcast' : null;
      const id = decodeURIComponent(a2 ?? '');
      if (!kind || (kind === 'videos' ? !VIDEO_ID.test(id) : !id || id.length > 300)) return bad('item');
      const map = (state[kind] ??= {});
      const old = map[id] ?? {};
      if (req.method === 'DELETE') {
        if (old.thumb) await env.SITE.delete(`thumb:${old.thumb}`);
        delete map[id];
      } else {
        const title = text(body?.title, 120);
        const next = { ...old, title: title || undefined };
        if (next.title || next.thumb) map[id] = next;
        else delete map[id];
      }
      await saveState(env, state);
      return json({ item: map[id] ?? null });
    }

    case 'PUT groups': {
      const v = validateGroups(body, state.groups ?? SEED_GROUPS);
      if (v.error) return bad(v.error);
      state.groups = v.value;
      await saveState(env, state);
      return json({ groups: state.groups });
    }

    case 'PUT live': {
      const v = validateLive(body);
      if (v.error) return bad(v.error);
      state.live = v.value;
      await saveState(env, state);
      return json({ live: state.live });
    }
  }
  return bad('not_found', 404);
}

async function thumbRoute(req, env, id) {
  if (!VIDEO_ID.test(id ?? '')) return bad('item');
  if (+(req.headers.get('Content-Length') ?? 0) > 2 * 1024 * 1024) return bad('too_large', 413);
  const bytes = await req.arrayBuffer();
  const type = imageType(bytes);
  if (!type) return bad('image');
  const state = await freshState(env);
  const map = (state.videos ??= {});
  const old = map[id] ?? {};
  const thumb = `${id}-${Date.now().toString(36)}`;
  await env.SITE.put(`thumb:${thumb}`, bytes, { metadata: { type } });
  if (old.thumb) await env.SITE.delete(`thumb:${old.thumb}`);
  map[id] = { ...old, thumb };
  await saveState(env, state);
  return json({ item: map[id] });
}
