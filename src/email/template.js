// The one email template (blasts, alert emails, confirmation, admin preview) and the message format.
// Message format: blank line = new paragraph, **bold**, bare http(s) URLs and [words](https://…). Everything else is escaped.
import { esc } from '../lib/state.js';

// Hex values of the site tokens (global.css); email clients don't know CSS variables.
const C = { cream: '#efede8', paper: '#faf8f3', ink: '#1c1c1c', muted: '#57514a', gold: '#c7a359', goldInk: '#7a5c14', line: '#dcd9d3' };
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INLINE = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)<>"]+)\)|(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])|\*\*([^*\n]{1,500}?)\*\*/g;

const okUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const paras = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);

/** One paragraph of the message format to HTML. Unmatched markup is escaped and shows as typed. */
function inline(p) {
  let out = '';
  let last = 0;
  for (const m of p.matchAll(INLINE)) {
    out += esc(p.slice(last, m.index));
    last = m.index + m[0].length;
    const url = okUrl(m[2] ?? m[3] ?? '');
    if (m[4] !== undefined) out += `<strong>${esc(m[4])}</strong>`;
    else if (!url) out += esc(m[0]);
    else out += `<a href="${esc(url)}" style="color:${C.goldInk};text-decoration:underline">${esc(m[1] ?? m[3])}</a>`;
  }
  return (out + esc(p.slice(last))).replace(/\n/g, '<br>');
}

export const bodyHtml = (body) => paras(body).map((p) => `<p style="margin:0 0 16px">${inline(p)}</p>`).join('');

/** Plain-text part: same words, links written out. */
export const bodyText = (body) => paras(body)
  .map((p) => p.replace(INLINE, (all, t, u, bare, b) => (b !== undefined ? b : bare ?? (okUrl(u) ? `${t} (${u})` : all))))
  .join('\n\n');

/** Footer facts, built from CHURCH (site.ts) only. */
const address = (c) => `${c.street}, ${c.city}, ${c.region} ${c.zip}`;

/**
 * Full email. `footer` = { topics: 'Latest happenings', site: 'riversideconnect.com', unsub, prefs } for blasts;
 * omitted for the confirmation email, which gets `button` = { text, url } and an `after` line instead.
 * Returns { html, text }.
 */
export function renderEmail({ church, subject, body = '', label, button, after, footer, logo }) {
  const lead = label ? `<p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.goldInk}">${esc(label)}</p>` : '';
  const btn = button ? `<p style="margin:8px 0 24px"><a href="${esc(button.url)}" style="display:inline-block;padding:14px 28px;line-height:20px;background:${C.ink};color:${C.cream};font-weight:700;text-decoration:none;border-radius:999px">${esc(button.text)}</a></p>` : '';
  const flink = (url, t) => `<a href="${esc(url)}" style="display:inline-block;padding:12px 4px;color:${C.goldInk};font-weight:700;text-decoration:underline">${t}</a>`;
  const foot = footer
    ? `<p style="margin:0 0 8px">${esc(church.name)} · ${esc(address(church))} · <a href="tel:+1${esc(church.phone.replace(/\D/g, ''))}" style="color:${C.muted}">${esc(church.phone)}</a></p>`
      + `<p style="margin:0 0 4px">You’re getting this because you signed up for ${esc(footer.topics)} at ${esc(footer.site)}.</p>`
      + `<p style="margin:0">${flink(footer.unsub, 'Unsubscribe')} · ${flink(footer.prefs, 'Manage topics')}</p>`
    : `<p style="margin:0">${esc(church.name)} · ${esc(address(church))} · ${esc(church.phone)}</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title>`
    + '<style>@media (max-width:480px){.pad{padding:16px!important}}</style></head>'
    + `<body style="margin:0;padding:0;background:${C.cream}"><div class="pad" style="padding:24px;background:${C.cream}">`
    + `<div class="pad" style="max-width:600px;margin:0 auto;padding:24px;background:${C.paper};border-radius:14px;font-family:${SANS};font-size:17px;line-height:1.55;color:${C.ink}">`
    // The seal is decoration next to the live-text name (alt=""), so blocked images lose nothing.
    + (logo ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td width="48" style="width:48px;vertical-align:middle"><img src="${esc(logo)}" width="48" height="48" alt="" style="display:block;border:0"></td><td width="12" style="width:12px"></td><td style="vertical-align:middle">` : '')
    + `<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;line-height:1.3;color:${C.ink}">${esc(church.name)}</p>`
    + (logo ? '</td></tr></table>' : '')
    + `<div style="width:40px;height:2px;margin:12px 0 24px;background:${C.gold};font-size:0;line-height:0">&nbsp;</div>`
    + `${lead}<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:${C.ink}">${esc(subject)}</h1>${bodyHtml(body)}${btn}${after ? `<p style="margin:0;font-size:15px;color:${C.muted}">${esc(after)}</p>` : ''}`
    + `<div style="margin-top:24px;padding-top:16px;border-top:1px solid ${C.line};font-size:14px;line-height:1.5;color:${C.muted}">${foot}</div>`
    + '</div></div></body></html>';
  const text = [church.name, '', label ? `${label.toUpperCase()}: ${subject}` : subject, '', bodyText(body),
    button ? `\n${button.text}: ${button.url}` : '', after ? `\n${after}` : '', '', '--', `${church.name} · ${address(church)} · ${church.phone}`,
    ...(footer ? [`You're getting this because you signed up for ${footer.topics} at ${footer.site}.`, `Unsubscribe: ${footer.unsub}`, `Manage topics: ${footer.prefs}`] : []),
  ].join('\n').replace(/\n{3,}/g, '\n\n');
  return { html, text };
}
