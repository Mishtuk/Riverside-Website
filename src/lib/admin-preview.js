// GitHub Pages preview only (BASE isn't '/'). There is no server there, so this stands in for /api/admin/*: the staff
// screen can be looked through with the church's real starting content, no made-up numbers, and every change refused.
// The launched site never includes it, and its server checks the sign-in on every request regardless.
export const PREVIEW_NOTE = 'This is a preview, so nothing is saved. Changes will save once the website launches.';

/** Browser code. Stringified into the page as-is, so it must not use anything from this module. */
export function previewReply(method, url, seed) {
  const [path, query] = url.replace(/^.*\/api\/admin/, '').split('?');
  if (method === 'POST' && path === '/email/preview') return { status: 200, body: { html: `<p style="font-family:sans-serif">${seed.note}</p>` } };
  if (method !== 'GET') return { status: 403, body: { error: 'preview' } };
  const email = { news: 0, alerts: 0, total: 0, pending: 0, unsubscribed: 0, configured: true, groups: seed.emailGroups };
  const replies = {
    '/state': { state: { groups: seed.groups }, email: true, user: 'preview', kind: 'password', role: 'admin', areas: [], defaultPassword: false },
    '/team': { team: seed.team },
    '/activity': { activity: [] },
    '/staff': { me: 'preview', kind: 'password', logins: [], accounts: [{ username: 'preview', role: 'admin', areas: [], mustChange: false, defaultPassword: false, updated: Date.now() }] },
    '/recipients': { count: 0 },
    '/email/counts': email,
    '/email/count': { n: 0 },
    '/email/campaigns': { campaigns: [] },
    '/email/subscribers': { rows: [], more: false },
  };
  if (replies[path]) return { status: 200, body: replies[path] };
  if (path !== '/stats/summary') return { status: 403, body: { error: 'preview' } };
  const range = new URLSearchParams(query).get('range') ?? '7d';
  const back = { day: 0, '7d': 6, '30d': 29, '12m': 364 }[range] ?? 0;
  const iso = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const end = iso(Date.now());
  const unit = range === 'day' ? 'hour' : range === '7d' || range === '30d' ? 'day' : 'month';
  const key = unit === 'hour' ? '00' : unit === 'month' ? end.slice(0, 7) : end;
  return { status: 200, body: {
    range: range in { day: 0, '7d': 0, '30d': 0, '12m': 0 } ? range : 'all', start: iso(Date.now() - back * 864e5), end, unit, first: null,
    views: 0, visitors: 0, plays: { video: 0, podcast: 0 }, series: [{ key, n: 0, p: 0 }], pages: [],
    subscribers: { total: 0, added: 0, removed: 0, change: 0, lists: [], groups: [] }, youtube: { on: false, channel: null, top: [] },
  } };
}

/** The inline script for the page head: runs before the staff screen and its Email and Statistics views. */
export const previewScript = (seed) => `(() => {
  const reply = ${previewReply};
  const seed = ${JSON.stringify({ ...seed, note: PREVIEW_NOTE }).replace(/</g, '\\u003c')};
  document.documentElement.setAttribute('data-signed-in', '');
  document.documentElement.setAttribute('data-preview', '');
  const real = window.fetch;
  window.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.includes('/api/admin')) return real(input, init);
    const r = reply(init?.method ?? 'GET', url, seed);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
})();`;
