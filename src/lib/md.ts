// Tiny helpers for pages that need markdown split into "## Heading" sections (cards, FAQ).
import { getEntry, render } from 'astro:content';

export const page = async (id: string) => {
  const entry = await getEntry('pages', id);
  if (!entry) throw new Error(`Missing content page: ${id}`);
  return { entry, ...(await render(entry)) };
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// ponytail: handles only **bold**, [text](url) and paragraphs, which is all these pages use.
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const html = (text: string) =>
  text.trim().split(/\n{2,}/).filter(Boolean).map((p) => `<p>${inline(p)}</p>`).join('');

/** Text before the first "## " heading, as HTML. */
export const intro = (body = '') => html(body.replace(/<!--[\s\S]*?-->/g, '').split(/^## /m)[0]);

export interface Section { title: string; html: string; text: string }

export const sections = (body = ''): Section[] =>
  body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const [title, ...rest] = chunk.split('\n');
      const paras = rest.join('\n').trim().split(/\n{2,}/).filter(Boolean);
      return { title: title.trim(), html: paras.map((p) => `<p>${inline(p)}</p>`).join(''), text: paras.join(' ') };
    });
