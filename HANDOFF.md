# Riverside Community Church website: handoff

This is a rebuild of https://www.riversideconnect.com for desktop and mobile.

- **Preview (live):** https://mishtuk.github.io/Riverside-Website/. It redeploys automatically on every push to `main`.
- **Branch `admin-alerts`:** the same site served by one small Node server on Microsoft Azure App Service, plus the staff admin: alerts, our own email list and sending, title and thumbnail edits, the groups board with each group's news, and the live video switch. See "Hosting on Azure" below.
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
**The server locally** (admin, alerts, groups, email): run `npm run build`, then `DEV_ADMIN=1 node server.js` and open http://localhost:8080/admin/. Data goes in `.data/` (git-ignored). Without `SMTP_URL`, emails (sign-in links, confirmations, blasts) are written as `.eml` files to `.data/outbox/` (that is, `DATA_DIR/outbox/`) instead of being sent. `DEV_ADMIN` only works on localhost and never in production. To try the real sign-in, copy `.env.example` to `.env` (git-ignored) and leave `DEV_ADMIN` out: it sets `ALLOW_DEFAULT_ADMIN=1`, so `admin` / `admin` works, and the emailed sign-in link is printed in the terminal.

## Stack
- **Astro 7**, static output. Plain CSS (`src/styles/global.css` plus component `<style>` blocks). No client framework. The only JavaScript is small inline scripts.
- **Hosting:** `main` is on GitHub Pages via GitHub Actions. `admin-alerts` runs `server.js` on Azure App Service (Linux, Node 22). `astro build` still makes a fully static `dist/`, and the server fills in the live parts at marked spots (`<!--rs:…-->`) as it sends each page. There is no server framework and no Astro adapter. The only runtime dependency besides Node is nodemailer.
- **CSS:** inlined into each page (`build.inlineStylesheets: 'always'`).
- **Fonts:** self-hosted woff2 in `public/fonts/` (DM Serif Text for headings, Source Sans 3 for body), with size-matched fallbacks so the page doesn't jump while fonts load.
- **Page transitions:** native cross-document view transitions. Other motion is turned off for visitors with reduced motion enabled. The hero video still plays for them, without the zoom, and the pause button is always shown. If a phone blocks autoplay (iPhone Low Power Mode, Android Data Saver), the video starts on the first tap.

## Where things live
| What | Where |
|---|---|
| Church facts (times, address, phone, email, text-to-give, map links, socials) | `src/lib/church.js`, re-exported by `src/lib/site.ts`. **Change facts here only; never hard-code them in pages.** The server uses the same file. |
| Nav and livestream window | `src/lib/site.ts` |
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
| Server: static files, `/api/*`, staff sign-in, and filling alerts, edited titles, the groups board and the live switch into the pages | `server.js` |
| Database (one SQLite file) and nightly backups | `src/db.js` |
| Staff sign-in (emailed link, session cookie) | `src/auth.js` |
| Page template for server-made pages (sign-in, email confirm and settings) | `src/pages/shell.astro` |
| Deploy to Azure | `.github/workflows/azure.yml` |
| Alert banner and group card markup, the date rules, and input checks (shared by the pages, the server and /admin) | `src/lib/state.js` |
| Email list, sending queue, subscribe / confirm / email settings pages, admin Email tab | `src/email/` |
| Starting list of weekly groups (only facts the church has given us) | `src/content/groups.json` |
| Staff admin page | `src/pages/admin.astro` |
| Church events, "Coming up" on home and /events, the alert pop-up, the team on About (render + checks) | `src/lib/state.js`; markers `<!--rs:coming-up-->` (home), `<!--rs:events-->` (/events), `<!--rs:team-->` (About) |
| Statistics (counted by the server, no cookies) and the in-admin Help guide | `src/stats/`, `src/help/` |
| Activity log, team photos | `activity` table in `src/db.js`; photos in `/home/data/photos/` |
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
- **Mailchimp:** on `main`, the email signup and the daily prayer emails (`riversideconnect.us2.list-manage.com`). On `admin-alerts`, /subscribe uses the site's own list instead: two topics, "Latest happenings" and "Weather & closing alerts", a confirmation email before anyone is added, and unsubscribe links in every email. Staff send from /admin → Email. The daily prayer signup on Get Involved still uses Mailchimp.
- **Wufoo:** discipleship. **Google Form:** ESL. **Email:** baptisms.
- **YouTube:**
  - channel `UCWcjfHPkDfMiiGgp0L8zDjQ`
  - previous-livestreams playlist `PLbS1l_W_y15idxZN2oJY6xpN-6NlCaRNE`
  - Videos are embedded with a facade, so nothing loads from YouTube until a visitor clicks.
  - The "We're live" banner shows on Sundays 10:25am–12:00pm ET. Add `?live=1` to any URL to preview it.
  - On the Azure server, staff can override the schedule in /admin → Livestream: Automatic (the default), Live now, or Not live, plus an optional video ID. The server adds `data-live-force="on|off"` and `data-live-video="<id>"` to `<html>`, and the home hero reads them.
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

## What Ezra can change (and what stays with the developer)
Ezra and the staff run the day-to-day content from `/admin`, with no developer needed. The **Help** tab at the bottom of the admin has short step-by-step recipes for each of these.
- **Alerts:** the banner on every page, a one-time pop-up for major news, pinning an alert to one group, and emailing it.
- **Email:** writing and sending emails to the lists, looking up a subscriber and taking them off, and seeing what was sent.
- **Events:** church-wide events (Major or Minor). They show in "Coming up" on the home page and on Events, with group events and this week's group meetings.
- **Groups:** groups, this week's status, one-off group events, and group news.
- **Videos and podcast:** titles and thumbnails.
- **Our team:** names, roles, short bios, photos and the order on the About page.
- **Livestream:** live now, not live, or automatic.
- **Staff accounts:** add or remove people, change passwords. **Statistics** and **Activity** are read-only, and **Download a backup** saves everything as one file.

These stay with the developer: the layout and design, the menu, page wording, and the core facts in `src/lib/church.js` (service times, address, phone, email). If Ezra needs one of these changed, he asks.

## Staff admin (`admin-alerts` branch)
**First sign-in is admin/admin. You must change it immediately. Do this before giving out the site address.** On the first start the server creates one account, `admin` with password `admin`. Signing in with it leads straight to "Choose a new password" (12 characters or more, not "admin", not the username), and nothing else in the admin works until that is done. The only exception is the testing period: with `ALLOW_DEFAULT_ADMIN=1` set, admin/admin works normally, and a warning bar ("Default password in use: change it before launch") shows on the admin page until the password is changed.

**Signing in:** go to `/admin` and enter your username and password. Or use "Email me a sign-in link": staff listed in `ADMIN_EMAILS` get a link that works once, for 15 minutes, and opens a page with a "Sign in" button. Either way you stay signed in on that device for 7 days. "Sign out" is at the top right. After 5 wrong tries, that username (and that internet address) is locked out for 15 minutes; the message is the same whether the username or the password was wrong. Changes show on the site straight away.
- **Staff accounts** (admin → Staff): change your own password, add an account (username plus a temporary password, which they must change the first time they sign in), or remove someone else's account. The last account can't be removed. The section also lists the last 10 sign-ins (who, when, from where). Give temporary passwords in person or by phone, never by email.
- **Email sign-in list:** Azure portal → the web app → Settings → Environment variables → `ADMIN_EMAILS` (addresses separated by commas) → Apply. The app restarts. Removing an address also signs that person out.
- **Post an alert:** Alerts → choose Weather / closing or News → write the message (200 characters max) → optional link → end time (it disappears by itself after that) → Post alert. It shows as a banner under the header on every page, and visitors can dismiss it. "End now" removes it right away. Editing an alert posts it again, so people who dismissed it see the new version.
- **Pop-up for major news:** tick "Also show as a pop-up the first time someone visits" (it starts ticked for Weather / closing). Each visitor sees the pop-up once, on the first page they open, on top of the banner; it never shows in the admin, and it waits while someone is watching the live video full size. Several at once appear in one pop-up. When you edit a pop-up alert, people who already closed it don't see it again unless you tick "Show the pop-up again".
- **Events:** Events → "Add an event" → title, date, optional start and end time, place, short description, link, and Major (a big card on the home page) or Minor (a line in the list) → Save. Past events disappear by themselves the day after (Eastern time). "Coming up" on the home page only appears when there is something to show.
- **Our team:** Our team → edit names, roles and bios, add a photo (cropped square in the browser; JPG, PNG or WebP), move people up or down (the first person is featured), then "Save team".
- **Activity:** a read-only list of who changed what and when (the last 200 changes and sign-ins). **Download a backup** (in the same section) saves the site's content and the subscriber list as one file.
- **Signing out everywhere:** changing a password, or removing an account, signs that account out on every other phone and computer straight away.
- **Email it too:** tick "Also email subscribers". The confirm step shows how many people will get it. Weather / closing goes to "Weather & closing alerts", and News goes to "Latest happenings". Alert emails go to the front of the sending queue. "Send a test to me" sends it only to you. **Be honest with the church about speed:** the banner is instant, but email is sent at the relay's limit. Azure's starting limit is 100 emails an hour, so 1,500 people would take about 15 hours until Azure raises it. Don't promise "instant emergency email".
- **Email tab:** write an email to one or both topics, see who is subscribed, and unsubscribe someone who phones the office. People can only join through the Subscribe page and its confirmation email.
  - **Unsubscribe requests by email:** every email offers a one-click unsubscribe, which works by itself. It also offers a "mailto" unsubscribe, which arrives as an ordinary email at the reply-to address. Nothing reads that mailbox automatically, so staff must find the person in Email → Subscribers and press "Unsubscribe" on their row **within 10 business days** (the US CAN-SPAM rule). Check that mailbox weekly.
- **Fix a video or podcast title or thumbnail:** Videos & podcast → edit the title or upload a picture (it is cropped to 16:9 at 1280×720 in the browser) → Save. "Reset to original" goes back to the YouTube or feed version. Fixing the title on YouTube is still better, because then YouTube is right too.
- **Groups (`/groups`):** each group has a type (Prayer, Discipleship, ESL classes, Men, Women, Kids, Other), and the page shows one section per type. In the admin each group is a closed card; open it to change it.
  - Details: name, type, day, time, place, contact, short description, note.
  - This week: staff only record exceptions. "Not meeting on <date>" shows "Not meeting this week" and clears itself after that date. "On break until <date>" clears on that date (Eastern time).
  - Events: one-off dates (title, date, start and optional end time, place, note). The board shows the next three, and past events drop off by themselves.
  - Updates: "Post update" puts a dated news post (title and message) in that group's "News & updates" on /groups straight away. Up to 20 are kept; the oldest drops off. Posts can be deleted but not edited.
  - Each group has its own link, `/groups#<name>`, which opens its news. The part after `#` is made from the name when the group is first saved and never changes, so shared links keep working after a rename. The "Share this group" button copies it.
  - **Group alerts** ("Not meeting this Sunday", "Moved to Room 2"): open the group and press "Post a meeting alert", or choose a Group in Alerts → Post an alert. Write the when and where in the message. The alert is pinned at the top of that group's card on /groups until it ends. "Also show site-wide" puts it in the banner on every page as well; it is ticked for Weather / closing and unticked for News. With "Also email", the group's own list is picked, and Latest happenings or Weather & closing alerts can be added; each person gets it once. Removing a group removes its alerts.
  - If the server can't read its data, the page shows "Check with the office" instead of guessing.

**Statistics and privacy.**
- **What we count.** The Statistics tab counts page views, visitors per day, and plays started on our own video players and podcast page. The website counts these itself, on its own server. There are no cookies, no tracking script and no third-party analytics.
- **How a visitor is counted.** To tell one visitor from another on the same day, the server mixes the visitor's IP address and browser type with a random code that is replaced every night, and keeps only a scrambled result. That result can't be turned back into an IP address, and the same person gets a different one the next day. The IP address and browser type themselves are never saved.
- **What is stored.** Only daily totals (for example "Oct 19: 140 visitors, 310 page views; Groups page 42").
- **What is left out.** Bots, staff who are signed in, and browsers that send "Do Not Track" or Global Privacy Control are not counted.
- **What it means.** The numbers are estimates. Someone who visits on 3 days counts 3 times.
- **YouTube views (optional).** Set `YOUTUBE_API_KEY` (a free key from Google Cloud with "YouTube Data API v3" enabled; no owner sign-in is needed). The server then reads the channel's public view count once a day and shows the difference over each period. YouTube now counts a view as soon as a video starts, including muted autoplay, so the home page's live video can add YouTube views.
- **Sharing.** Nothing is shared or sold.
- **Ready-made privacy text** for a privacy page or the Subscribe page, if the church wants one (add the office's phone and email from `church.js`, not by hand):
  > **Privacy.** This website doesn't use cookies or third-party trackers. To see how many people visit, our server counts page visits. It uses your IP address and browser type only to make a scrambled one-day code that can't be traced back to you, and it never saves them. We keep only daily totals. If your browser sends "Do Not Track" or Global Privacy Control, you aren't counted at all. If you sign up for our emails, we keep your email address, the lists you chose, and when and from where you confirmed, so we can prove you asked for them. Every email has a one-click unsubscribe. We never sell or share your information. Questions: contact the church office.

## Hosting on Azure (`admin-alerts`)
**How it fits together:** one Node process (`server.js`) on an App Service plan. It sends the static `dist/` files, and for pages it fills in alerts, edited titles, the groups board and the live switch at marked spots. Everything staff change, plus the email list and sending queue, is in one SQLite file: `/home/data/riverside.db` (Node's built-in `node:sqlite`). Uploaded thumbnails are files in `/home/data/thumbs/`. `/home` survives restarts and deploys. If the server can't read the data, public pages still show their normal static content; the admin refuses everything without a valid sign-in.

**One-time setup (owner):**
1. **Web app:** create a Resource group, then a Web App: Publish "Code", Runtime "Node 22 LTS" (or 24 if offered), Linux, plan **Basic B1**.
   - Settings → Configuration → General settings: **Always on: On**, **HTTPS only: On**, **SCM Basic Auth Publishing Credentials: On** (needed for the publish profile), Startup command `node server.js`.
   - Keep it to **one instance** (no scale-out, no deployment slots): the database is a single file.
2. **Environment variables** (web app → Settings → Environment variables). Make each secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `PUBLIC_URL` = `https://www.riversideconnect.com` (or the `…azurewebsites.net` address until the domain moves). Sign-in and email links are built from this.
   - `SESSION_SECRET`, `TOKEN_SECRET`: two different random values. Changing `SESSION_SECRET` signs everyone out; changing `TOKEN_SECRET` breaks the unsubscribe links in emails already sent, so leave it alone once set.
   - `ADMIN_EMAILS` = the staff addresses that may use "Email me a sign-in link", separated by commas.
   - `ALLOW_DEFAULT_ADMIN=1` only while testing (admin/admin without the forced change). **Remove it before launch.**
   - `SMTP_URL` = `smtp://USERNAME:PASSWORD@HOST:587` from the email relay (step 4). Put `%40` for any `@` and `%7C` for any `|` inside the username or password.
   - `MAIL_FROM` = `Riverside Community Church <news@riversideconnect.com>`, and `MAIL_REPLY_TO` = the church address that should get replies.
   - Optional: `YOUTUBE_API_KEY` (see "Statistics and privacy"), `SEND_RATE_PER_HOUR` (default 100) and `SEND_RATE_PER_MIN` (default 30). Raise them only after the relay raises its limits. `DATA_DIR` defaults to `/home/data`.
   - The server refuses to start without `SESSION_SECRET`, `TOKEN_SECRET`, `ADMIN_EMAILS` and `PUBLIC_URL`; the reason is in Log stream.
3. **GitHub deploy:** web app → Overview → Download publish profile. In the GitHub repo → Settings → Secrets and variables → Actions, add the secret `AZURE_WEBAPP_PUBLISH_PROFILE` (the file's contents), plus the variables `AZURE_WEBAPP_NAME` (the web app's name) and `PUBLIC_URL`. Every push to `admin-alerts` then tests, builds and deploys (`.github/workflows/azure.yml`); Actions → "Deploy to Azure App Service" → Run workflow does it by hand.
4. **Email relay: Azure Communication Services** (pay per email).
   - Create an **Email Communication Services** resource, add the custom domain (`riversideconnect.com`), and add the DNS records it shows: ownership TXT, SPF and the two DKIM records. Then connect the domain to a **Communication Services** resource.
   - Set up SMTP for it: Microsoft's guide has you register an app in Microsoft Entra ID, give it access to the Communication Services resource, and create an SMTP username. Copy the server name, port, username and password into `SMTP_URL`. Follow Microsoft's current steps; the screens change.
   - **Sending checklist (owner, before the first real email).** Gmail and Yahoo expect all of this from bulk senders:
     - [ ] **SPF:** one TXT record on `riversideconnect.com` that includes the relay. Merge it into any existing SPF record; never publish two.
     - [ ] **DKIM:** the relay's DKIM records are added and show "Verified" in the relay's portal.
     - [ ] **DMARC:** TXT at `_dmarc.riversideconnect.com` = `v=DMARC1; p=none; rua=mailto:<church address>`. Tighten it to `p=quarantine` after a few weeks of clean reports.
     - [ ] `MAIL_FROM` uses an address on that same domain, and `MAIL_REPLY_TO` is a mailbox someone reads (see "Unsubscribe requests by email" above).
     - [ ] Send a test from Email → "Send test to me" to a Gmail address. In Gmail, "Show original" should show SPF, DKIM and DMARC as PASS, and an "Unsubscribe" link next to the sender.
     - [ ] The church's postal address in the email footer comes from `src/lib/church.js`; keep it current.
   - **Ask for a higher sending limit as soon as the resource exists:** Help + support → Create a support request → "Service and subscription limits (quotas)" → Communication Services → email sending limits. The starting limit is 100 emails an hour. Approval isn't guaranteed.
   - **Fallback: Amazon SES** (about $0.16 per 1,000 emails). Verify the domain in SES (its DKIM records), request production access, create SMTP credentials, and set `SMTP_URL=smtp://KEY:SECRET@email-smtp.<region>.amazonaws.com:587` and the rate settings to the SES limits. No code change.
5. **Domain:** web app → Custom domains → add `www.riversideconnect.com` (a `CNAME` from `www` to the app's `azurewebsites.net` name, plus the `asuid` TXT it asks for), then add a free App Service managed certificate. The free certificate doesn't cover the bare domain, so have the DNS host redirect `riversideconnect.com` to `www`. The nameservers don't need to move: add these records where the DNS is today, and don't touch the MX records (church email).

**Launch checklist:**
- [ ] Remove ALLOW_DEFAULT_ADMIN and change the admin password. (Staff accounts must show no "Default password" warning.)
- [ ] Every staff member has their own account or is in `ADMIN_EMAILS`; remove test accounts.
- [ ] The email sending checklist above is done, and a test email arrived with SPF, DKIM and DMARC passing.
- [ ] `PUBLIC_URL` is the real address, and HTTPS only and Always on are on.

**Backups:** every day the server copies the database to `/home/data/backup/riverside-YYYY-MM-DD.db` and keeps the last 7. To download one: web app → Advanced Tools (Kudu) → Debug console → `/home/data/backup`. To restore: stop the app, copy the backup over `/home/data/riverside.db`, then start it. Also turn on App Service's own backups if the plan includes them, so a copy exists outside the app.

**Known limits:** one instance only. Sign-in needs email, so if the relay is down nobody can get a link until `SMTP_URL` is fixed (for example by switching to SES).

**Monthly cost:** App Service Basic B1 is about $13 a month, and email is a few cents per thousand. These are estimates; check them on Microsoft's (and Amazon's) own pricing pages before quoting them.

**Launching `main` on GitHub Pages instead** (if the church never moves to Azure): set `SITE=https://www.riversideconnect.com` and `BASE=/` in the Pages workflow on `main`, and add `public/CNAME`. Then point `www` at `mishtuk.github.io` with a `CNAME` record, plus apex `A` records 185.199.108.153, .109.153, .110.153 and .111.153. The admin features need the Azure server, so they won't exist there.

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
- Whether there is an existing email list where people agreed to get emails (it can be imported once), the sender name and reply-to address for emails, and who the admins are.

## Suggestions for the church (not code)
- Claim and complete the Google Business Profile, with photos and service times.
- Post one new sermon a week to YouTube. The site picks it up on the next deploy. To make that automatic, add a weekly scheduled rebuild (a `schedule:` trigger on GitHub Pages, or a weekly scheduled run of the Azure workflow).
- Add GA4 or Plausible if they want visitor stats.

## Out of scope unless requested
An events-calendar system (group events are simple one-off dates), translation, a store, or podcast hosting.
