// Old CMS sections whose deep pages (sermon posts, blog posts, feeds) map to one new page.
// ponytail: prefix table only; exact old pages are static redirects in astro.config.mjs.
const PREFIXES = [
  ['/sermons/', '/watch'],
  ['/about/riverside-community-church-blog/', '/about'],
  ['/connect/events/', '/events'],
  ['/feeds/', '/podcast'],
];

// Path without the site base, e.g. '/sermons/some-talk'. Returns the new path, or null.
export function movedHome(path) {
  for (const [prefix, to] of PREFIXES) if (path.startsWith(prefix) && path.length > prefix.length) return to;
  return null;
}
