# Riverside Community Church website: handoff

This is a rebuild of https://www.riversideconnect.com for desktop and mobile.

- **Preview (live):** https://mishtuk.github.io/Riverside-Website/. It redeploys automatically on every push to `main`.
- **Repo:** https://github.com/Mishtuk/Riverside-Website. The local copy is `V:\RiversideWebsite`.
- **Commits:** authored as `Mish <113945444+Mishtuk@users.noreply.github.com>`, set in the repo's git config.

## Quick start
```
npm install
npm run dev       # http://localhost:4321/Riverside-Website/
npm run build     # static output in dist/
npm run preview   # serve dist/ locally
```

## Stack
- **Astro 7**, static output. Plain CSS (`src/styles/global.css` plus component `<style>` blocks). No client framework. The only JavaScript is small inline scripts.
- **Hosting:** GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`, using `withastro/action` and `deploy-pages`). Pages source = "GitHub Actions".
- **CSS:** inlined into each page (`build.inlineStylesheets: 'always'`).
- **Fonts:** self-hosted woff2 in `public/fonts/` (DM Serif Text for headings, Source Sans 3 for body), with size-matched fallbacks so the page doesn't jump while fonts load.
- **Page transitions:** native cross-document view transitions. Other motion is turned off for visitors with reduced motion enabled. The hero video still plays for them, without the zoom, and the pause button is always shown. If a phone blocks autoplay (iPhone Low Power Mode, Android Data Saver), the video starts on the first tap.

## Where things live
| What | Where |
|---|---|
| Church facts (times, address, phone, email, text-to-give, map links, socials), nav, livestream window | `src/lib/site.ts`. **Change facts here only; never hard-code them in pages.** |
| Base-aware links and photo srcsets | `href()` and `photo()` in `src/lib/site.ts` |
| Latest YouTube videos (read at build time) | `src/lib/youtube.ts`: the channel RSS feed, with the YouTube Data API as a fallback (see Integrations › YouTube) |
| Podcast archive | `src/lib/podcast.ts`, from the snapshot `src/content/podcast.json` (taken from `riversideconnect.com/feeds/sermons` on 2026-10-19) |
| Page copy ported from the old site | `src/content/pages/*.md`, plus `staff.json` and `images.json` |
| Layout, meta tags, Open Graph, JSON-LD, favicons, manifest link | `src/layouts/Base.astro` |
| Header and phone menu, footer, phone bottom bar, live banner | `src/components/Header.astro`, `Footer.astro`, `MobileBar.astro`, `LiveBanner.astro` |
| Live stream in the home hero (loaded only during the live window) | `public/live-hero.js`, with its markup and styles in `src/components/home/Hero.astro` |
| Home page sections | `src/components/home/*` |
| Embedded vendor forms | `src/components/MinistryForm.astro` |
| Old URL → new URL redirects (26) | `moves` in `astro.config.mjs` |
| sitemap.xml, robots.txt, manifest.webmanifest | `src/pages/*.ts` |
| Design research and the reasoning behind the layout | `docs/research.md` |

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
  - `/watch`, `/podcast`, `/get-involved`, `/events`, `/give`, `/connect`, `/subscribe`, 404

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
- **Mailchimp:** email signup and daily prayer emails (`riversideconnect.us2.list-manage.com`).
- **Wufoo:** discipleship. **Google Form:** ESL. **Email:** baptisms.
- **YouTube:**
  - channel `UCWcjfHPkDfMiiGgp0L8zDjQ`
  - previous-livestreams playlist `PLbS1l_W_y15idxZN2oJY6xpN-6NlCaRNE`
  - Videos are embedded with a facade, so nothing loads from YouTube until a visitor clicks.
  - **Video list at build time:** the keyless RSS feed comes first. If it fails or is empty (YouTube's feeds returned 404 on 2026-10-19) and the `YOUTUBE_API_KEY` repo secret is set, the build uses the YouTube Data API instead, at 2 quota units a build out of 10,000 a day. If there are still no videos, the build fails on purpose, so the last good deploy stays live. To build locally without videos, set `ALLOW_EMPTY_VIDEOS=1`. To add the key: Google Cloud console → enable YouTube Data API v3 → create an API key (restrict it to that API) → repo Settings → Secrets and variables → Actions → `YOUTUBE_API_KEY`.
  - The "We're live" banner shows on Sundays 10:25am–12:00pm ET. Add `?live=1` to any URL to preview it.
  - **Live hero (home):** during the same window, the stream replaces the hero video. It plays muted and blurred behind the copy. Clicking it (or "Watch live", or the banner link) brings it into focus with sound and a control bar: Pause, Sound, Mini player, Full screen, Close. Scrolling down turns it into a mini player in the corner. If the stream hasn't started playing within 8 seconds, or YouTube reports an error, the normal hero video comes back. Outside the window nothing loads from YouTube, and the hero video doesn't download while the stream is showing.
  - **Overrides:** `<html data-live-force="on">` or `"off"` overrides the schedule (banner and hero), and `<html data-live-video="VIDEO_ID">` shows that video instead of the channel's live stream. Staff will set these once the Cloudflare hosting is live. Until then the schedule decides, and `?live=1` previews it.
  - **Known limit:** a cancelled stream inside the window can't be detected without that toggle, so visitors may see YouTube's offline notice in the hero.
- **Podcast:** Apple Podcasts id 387370044. The feed is stale: the last episode is from 2020-06-14. The site reads a committed snapshot (150 episodes, April 2017 to June 2020), because the feed is on the old vendor's site. The audio (about 11.4 GB of MP3s) is still on the vendor's file host `cpmfiles1.com`, so it needs a new home before their contract ends; after moving it, update the `audioUrl`s in `src/content/podcast.json`.
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

## Launching on riversideconnect.com (after the church approves)
1. In `.github/workflows/deploy.yml`, set the build env to `SITE=https://www.riversideconnect.com` and `BASE=/`. Links, redirects, the sitemap and the manifest all follow these two values.
2. Add `public/CNAME` containing `www.riversideconnect.com`, and set the custom domain under repo Settings → Pages. Tick "Enforce HTTPS".
3. Point the church's DNS at GitHub Pages:
   - a `CNAME` record from `www` to `mishtuk.github.io`
   - apex `A` records 185.199.108.153, .109.153, .110.153 and .111.153
4. Keep the old Church Plant Media site live until DNS has switched. The redirects in `astro.config.mjs` keep the old URLs working.

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

## Suggestions for the church (not code)
- Claim and complete the Google Business Profile, with photos and service times.
- Post one new sermon a week to YouTube. The site picks it up on the next deploy. To make that automatic, add a weekly `schedule:` trigger to the deploy workflow.
- Add GA4 or Plausible if they want visitor stats.

## Out of scope unless requested
A CMS or logins, an events-calendar system, translation, a store, or podcast hosting.
