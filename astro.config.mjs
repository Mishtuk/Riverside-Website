import { defineConfig } from 'astro/config';

// Azure serves the site at the domain root, so BASE defaults to /. The GitHub Pages preview sets BASE=/Riverside-Website (deploy.yml).
const BASE = process.env.BASE ?? '/';

// Old CMS URL -> new home. Keeps printed links and search rankings working.
const moves = {
  '/about/what-to-expect': '/im-new',
  '/directions-and-times': '/im-new',
  '/politics': '/about/faith-and-politics',
  '/beliefs': '/about/beliefs',
  '/corevalues': '/about/core-values',
  '/about/whatisthegospel': '/about/gospel',
  '/partnerships': '/about/partnerships',
  '/about/staff': '/about#staff',
  '/sermons': '/watch',
  '/livestream': '/watch',
  '/response': '/connect',
  '/email': '/subscribe',
  '/weekly-emails': '/subscribe',
  '/connect/serving-opportunities': '/get-involved#serving',
  '/esl': '/get-involved#esl',
  '/discipleship': '/get-involved#discipleship',
  '/men': '/get-involved#men',
  '/connect/women': '/get-involved#women',
  '/prayer': '/get-involved#prayer',
  '/baptisms': '/get-involved#baptisms',
  '/rightnow': '/get-involved#rightnow',
  '/study-guides': '/get-involved#study-guides',
  '/connect/events': '/events',
  '/giving': '/give',
  '/giving-faq': '/give#faq',
  '/subscriptions': '/podcast',
};
const redirects = Object.fromEntries(Object.entries(moves).map(([from, to]) => [from, BASE.replace(/\/$/, '') + to]));

export default defineConfig({
  site: process.env.SITE ?? 'https://mishtuk.github.io',
  base: BASE,
  output: 'static',
  build: { inlineStylesheets: 'always' },
  redirects,
});
