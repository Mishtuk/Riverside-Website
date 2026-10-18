# Riverside Community Church website: handoff

This is a rebuild of https://www.riversideconnect.com for desktop and mobile.

- **Preview (live):** https://mishtuk.github.io/Riverside-Website/. It redeploys automatically on every push to `main`.
- **Branch `admin-alerts`:** the same site on a Cloudflare Worker, plus the staff admin (alerts, email signup topics, title and thumbnail edits, the weekly groups board, the live video switch). See "Hosting on Cloudflare" below.
- **Repo:** https://github.com/Mishtuk/Riverside-Website. The local copy is `V:\RiversideWebsite`.
- **Commits:** authored as `Mish <113945444+Mishtuk@users.noreply.github.com>`, set in the repo's git config.

## Quick start
```
npm install
npm run dev       # http://localhost:4321/Riverside-Website/
npm run build     # static output in dist/
npm run preview   # serve dist/ locally
npm test          # logic checks: alerts, groups, events, overrides, admin sign-in token
```
**The worker locally** (admin, alerts, groups): put `DEV_ADMIN=1` in a `.dev.vars` file (git-ignored), then run `npm run build && npx wrangler dev` and open http://localhost:8787/admin/. `DEV_ADMIN` only works on localhost; it is ignored on any real address.

## Stack
- **Astro 7**, static output. Plain CSS (`src/styles/global.css` plus component `<style>` blocks). No client framework. The only JavaScript is small inline scripts.
- **Hosting:** `main` is on GitHub Pages via GitHub Actions. `admin-alerts` is a Cloudflare Worker: `astro build` still makes a fully static `dist/`, and one small script (`src/worker.js`) adds the live parts. There is no server rendering and no Astro adapter.
- **CSS:** inlined into each page (`build.inlineStylesheets: 'always'`).
- **Fonts:** self-hosted woff2 in `public/fonts/` (DM Serif Text for headings, Source Sans 3 for body), with size-matched fallbacks so the page doesn't jump while fonts load.
- **Page transitions:** native cross-document view transitions. Other motion is turned off for visitors with reduced motion enabled. The hero video still plays for them, without the zoom, and the pause button is always shown. If a phone blocks autoplay (iPhone Low Power Mode, Android Data Saver), the video starts on the first tap.

## Where things live
| What | Where |
|---|---|
| Church facts (times, address, phone, email, text-to-give, map links, socials), nav, livestream window | `src/lib/site.ts`. **Change facts here only; never hard-code them in pages.** |
| Base-aware links and photo srcsets | `href()` and `photo()` in `src/lib/site.ts` |
| Latest YouTube videos (read at build time) | `src/lib/youtube.ts`, from the channel RSS feed. No API key needed. |
| Podcast archive (read at build time) | `src/lib/podcast.ts`, from `riversideconnect.com/feeds/sermons` |
| Page copy ported from the old site | `src/content/pages/*.md`, plus `staff.json` and `images.json` |
| Layout, meta tags, Open Graph, JSON-LD, favicons, manifest link | `src/layouts/Base.astro` |
| Header and phone menu, footer, phone bottom bar, live banner | `src/components/Header.astro`, `Footer.astro`, `MobileBar.astro`, `LiveBanner.astro` |
| Home page sections | `src/components/home/*` |
| Embedded vendor forms | `src/components/MinistryForm.astro` |
| Old URL → new URL redirects (26) | `moves` in `astro.config.mjs` |
| sitemap.xml, robots.txt, manifest.webmanifest | `src/pages/*.ts` |
| Design research and the reasoning behind the layout | `docs/research.md` |
| Worker: `/api/*`, the admin sign-in check, and putting alerts, edited titles, the groups board and the live switch into the static pages | `src/worker.js`, configured in `wrangler.jsonc` |
| Alert banner and group card markup, the date rules, and input checks (shared by the pages, the worker and /admin) | `src/lib/state.js` |
| Mailchimp (signup with topics, alert emails, subscriber counts) | `src/mailer.js` |
| Starting list of weekly groups (only facts the church has given us) | `src/content/groups.json` |
| Staff admin page | `src/pages/admin.astro` |
| Logic checks | `test/state.test.js` (`npm test`) |

## Pages
- **Home (`/`):**
  - hero video with service times
  - New here
  - latest message
  - podcast
  - get involved
  - give
  - visit/map
- **Inner pages:**
  - `/im-new`
  - `/about` with its subpages: beliefs, core-values, gospel, faith-and-politics, partnerships
  - `/watch`, `/podcast`, `/get-involved`, `/groups`, `/events`, `/give`, `/connect`, `/subscribe`, 404
- **Staff only:** `/admin` (not in the nav or sitemap, `noindex`, blocked in robots.txt).

## Design system
- **Always a light theme.** The palette comes from the original site. Tokens are at the top of `global.css`.
  - Backgrounds:
    - cream `#efede8`
    - paper `#faf8f3`
    - stone `#e1ddd7`
    - parchment `#f4ecda` (Give and CTA bands)
  - Text: ink `#1c1c1c`.
  - Gold `#c7a359` is for decoration and buttons only. It fails contrast as text on light backgrounds.
  - Gold text on light backgrounds uses `--gold-ink #7a5c14` (`#6b4f10` for small text). This keeps the site at WCAG AA.
  - The footer is the only dark band.
- **Logos:** `public/brand/`. They are black line art, so they need a light background. The header uses `logo-header.webp`.
- **Icons:**
  - favicon-32
  - apple-touch-icon
  - icon-192 and icon-512
  - icon-maskable-512 (Android)

## Media
- **Hero video:** `public/media/`. Built from the church's original 1080p60 montage with a light denoise and sharpen only (no upscaling, no frame interpolation, no colour changes). The loop starts at 8 s, so the first frame isn't dark.
  - `hero.av1.mp4`: 1080p desktop, served first.
  - `hero.mp4`: 1080p H.264, the fallback.
  - `hero-720.mp4`: phones in landscape.
  - `hero-portrait.mp4`: 720×1280 for portrait phones. Each scene is cropped separately so a person stays in frame. It has its own poster.
- **Photos:** `public/media/photos/`. Each is a 1920px file plus a `-960` copy, served with srcset via `photo()`. They are stills from the hero video, so swap in real photos when the church provides them. Keep the same names, or add new ones in both sizes.
- **Social preview image:** `public/media/og.jpg`.

## Mobile
- One responsive site; there is no separate mobile site. Tuned at 360, 390 and 430px widths, at tablet width (768), and for phones in landscape.
- **Bottom action bar** (phones under 700px): Visit · Watch · Give · Directions. It hides while scrolling down.
- **Full-screen menu** with service times, the address, tap-to-call and Give. The page can't scroll while it's open.
- Notch-safe layout (`viewport-fit=cover` plus safe-area insets). The hero height is `100svh` minus the bar.
- **Add to Home Screen** is supported (manifest plus icons). Its name is "Riverside".
- Directions open the phone's maps app. Form inputs are at least 16px, so iOS doesn't zoom in.

## Integrations (embed only, never rebuild)
- **MinistryForms (SimpleChurch):**
  - Giving `1950c935-d9f8-431c-b8ef-f3ff1d8a42ae`
  - Response/connect `a2ba1737-d3fa-4331-aae5-391e389ce543`
  - Prayer `d3b02759-c0de-4d32-8f29-b8ef1398bb7d`
  - The script loads only when needed. On phones the form's empty space at the bottom is trimmed by 190px. Re-check that trim if the vendor changes its layout.
- **Mailchimp:** email signup and daily prayer emails (`riversideconnect.us2.list-manage.com`). On `admin-alerts`, /subscribe has two topics, "Latest happenings" and "Weather & closing alerts". They are Mailchimp tags on the existing list, and new people get Mailchimp's confirmation email. Without JavaScript the form still posts to Mailchimp as before. The prayer signup is unchanged.
- **Wufoo:** discipleship. **Google Form:** ESL. **Email:** baptisms.
- **YouTube:**
  - channel `UCWcjfHPkDfMiiGgp0L8zDjQ`
  - previous-livestreams playlist `PLbS1l_W_y15idxZN2oJY6xpN-6NlCaRNE`
  - Videos are embedded with a facade, so nothing loads from YouTube until a visitor clicks.
  - The "We're live" banner shows on Sundays 10:25am–12:00pm ET. Add `?live=1` to any URL to preview it.
  - On the Worker, staff can override the schedule in /admin → Livestream: Automatic (the default), Live now, or Not live, plus an optional video ID. The worker adds `data-live-force="on|off"` and `data-live-video="<id>"` to `<html>`, and the home hero reads them.
- **Podcast:** Apple Podcasts id 387370044. The feed is stale: the last episode is from 2020-06-14.
- **Text to give:** 267-274-2425.

## The church
- Riverside Community Church ("Riverside Connect"), 239 Columbia Avenue, Horsham, PA 19044
- 215-441-0404 · riverside@riversideconnect.com
- **Sundays:** 9:00am and 10:30am.
  - The livestream and kids' classes run during the 10:30am service.
  - The prayer group meets 9:30–10:30am in the Counseling Office.
- **Staff:**
  - Ezra Strickhouser, Lead Pastor
  - Katrina Strickhouser, Office Admin
  - Paul Leese, Elder
  - Martry Julias, Elder (Project Nicaragua)
- **Socials:**
  - instagram.com/riversidechurch_horsham
  - the YouTube channel above
  - Facebook page id 150401978326964
- Don't invent facts or times. If something is unknown, write "Contact us".

## Quality bar (2026-10-13)
- **Lighthouse (mobile):** home 98 performance / 100 accessibility / 100 best practices / 100 SEO.
- **/give:** best practices is 73 because of the MinistryForms iframe, which can't be fixed on our side.
- **Link check:** 0 broken links across all pages.
- **To re-check:** run `npm run build && npm run preview`, then `npx lighthouse <url> --form-factor=mobile`.

## Staff admin (`admin-alerts` branch)
Staff sign in at `/admin` with a one-time code sent to their email (Cloudflare Access). Saves take a second, and changes show on the site within about a minute.
- **Add or remove an admin:** Cloudflare dashboard → Zero Trust → Access → Applications → "Riverside admin" → Policies → edit the allowed emails. Nothing in the code changes.
- **Post an alert:** Alerts → choose Weather / closing or News → write the message (200 characters max) → optional link → end time (it disappears by itself after that) → Post alert. It shows as a banner under the header on every page, and visitors can dismiss it. "End now" removes it right away. Editing an alert posts it again, so people who dismissed it see the new version.
- **Email it too:** tick "Also email subscribers". The confirm step shows how many people will get it. Weather / closing goes to "Weather & closing alerts", and News goes to "Latest happenings". "Send a test to me" sends it only to the signed-in staff email.
- **Fix a video or podcast title or thumbnail:** Videos & podcast → edit the title or upload a picture (it is cropped to 16:9 at 1280×720 in the browser) → Save. "Reset to original" goes back to the YouTube or feed version. Fixing the title on YouTube is still better, because then YouTube is right too.
- **Weekly groups (`/groups`):** add, edit or remove groups (name, day, time, place, contact, short description, note). Staff only record exceptions. "Not meeting on <date>" shows "Not meeting this week" and clears itself after that date. "On break until <date>" clears on that date (Eastern time). Each group can also have one-off events (title, date, start and optional end time, place, note). The board shows the next three, and past events drop off by themselves. If the worker can't read its data, the page shows "Check with the office" instead of guessing.

## Hosting on Cloudflare (`admin-alerts`)
**How it fits together:** Cloudflare serves the static `dist/` files. Page requests also pass through `src/worker.js`, which reads one stored record (alerts, title edits, groups, live switch) and changes the page only when there is something to show. Photos, video, fonts and scripts skip the worker. If the worker has a problem, the public pages still show their normal static content. The admin is the opposite: without a valid sign-in, every admin request is refused.

**One-time setup (owner):**
1. **Cloudflare account** (free plan). Workers & Pages → Create → Import a repository → pick `Mishtuk/Riverside-Website`.
   - Production branch: `admin-alerts` for the demo (switch to `main` once this is merged).
   - Build command: `npm run build`. Deploy command: `npx wrangler deploy` (the default).
   - Build variable: `SITE=https://riverside-website.<your-subdomain>.workers.dev` (later `https://www.riversideconnect.com`). `BASE` is already `/` on this branch.
   - Name the Worker `riverside-website`, the same as `name` in `wrangler.jsonc`.
2. **Storage (KV):** the first deploy creates the KV namespace for the `SITE` binding automatically. If it doesn't, create one under Storage & Databases → KV and add its `id` to `kv_namespaces` in `wrangler.jsonc`.
3. **Cloudflare Access** (Zero Trust, free plan for up to 50 users; check at signup whether it asks for a card):
   - Settings → Authentication: turn on "One-time PIN".
   - Access → Applications → Add → Self-hosted, named "Riverside admin". Add the paths `/admin` and `/api/admin/` on the Worker's `workers.dev` hostname (and later on `www.riversideconnect.com`). Also turn on Access for the Worker's preview (version) URLs under the Worker's Settings → Domains & Routes, so previews aren't open.
   - Policy: Allow → Emails → the staff addresses.
   - Copy the application's **AUD tag** and the team domain (`https://<team>.cloudflareaccess.com`).
4. **Worker settings → Variables and secrets:**
   - `TEAM_DOMAIN` = `https://<team>.cloudflareaccess.com`
   - `POLICY_AUD` = the AUD tag
   - `MAILCHIMP_FROM_NAME` (for example "Riverside Community Church") and `MAILCHIMP_REPLY_TO` (the church address that should get replies)
   - `MAILCHIMP_API_KEY` as a **secret** (Mailchimp → Profile → Extras → API keys; it ends in `-us2`)
   - `MAILCHIMP_LIST_ID` is already set to the existing signup list (`ab990cb198`) in `wrangler.jsonc`.
   - Until the Mailchimp values are set, /subscribe says email isn't set up yet, and the admin can only post banners.
5. **Mailchimp:** nothing to create. The two tags appear when the first person picks them. Before relying on "Also email", confirm that the church's plan allows sending campaigns through the API.

**Moving riversideconnect.com (later):** Access and the Worker can only use `www.riversideconnect.com` once the domain's nameservers point to Cloudflare.
- First copy every existing DNS record into Cloudflare, especially the MX and mail (SPF, DKIM) records, so church email keeps working. Cloudflare's import scan helps, but check it against the current DNS host.
- Then change the nameservers at the registrar. Add `www.riversideconnect.com` (and the bare domain) as Custom Domains on the Worker, and add the same hostnames to the Access application.
- Keep the old site live until the switch is done. The redirects in `astro.config.mjs` keep old URLs working.

**Monthly cost:** the Cloudflare free plans (Workers, KV, and Access for up to 50 staff) are expected to cover a church this size, so $0. Mailchimp stays on whatever plan the church already pays for. All cost figures are estimates. Check them on the vendors' own pricing pages before quoting them.

**Launching `main` on GitHub Pages instead** (if the church never moves to Cloudflare): set `SITE=https://www.riversideconnect.com` and `BASE=/` in the Pages workflow on `main`, and add `public/CNAME`. Then point `www` at `mishtuk.github.io` with a `CNAME` record, plus apex `A` records 185.199.108.153, .109.153, .110.153 and .111.153. The admin features need the Worker, so they won't exist there.

## Still needed from the church
- Headshots of Katrina, Paul and Martry, and a larger photo of Ezra.
- 15–20 recent high-res photos: exterior and sign, lobby, worship, kids, baptisms, people.
- Real sermon titles or series names on YouTube. Livestreams currently show as "Sunday Service".
- The podcast: restart it (for example with Spotify for Creators) or retire the Apple listing.
- Upcoming events, or a calendar source.
- Men's ministry copy and the Hebrews study schedule.
- Whether to keep the "Southern Baptist Convention" wording prominent on About.
- Whether the MinistryForms form colours can be set to the site's gold.
- Who controls the DNS for riversideconnect.com.
- The full list of weekly groups (name, day, time, place, contact), and who keeps it up to date.
- The Mailchimp plan and contact count, and who the admins are.

## Suggestions for the church (not code)
- Claim and complete the Google Business Profile, with photos and service times.
- Post one new sermon a week to YouTube. The site picks it up on the next deploy. To make that automatic, add a weekly scheduled rebuild (a `schedule:` trigger on GitHub Pages, or a weekly build on Cloudflare).
- Add GA4 or Plausible if they want visitor stats.

## Out of scope unless requested
An events-calendar system (group events are simple one-off dates), translation, a store, or podcast hosting.
