# Riverside Website Revamp: Handoff

Freelance project: rebuild https://www.riversideconnect.com (desktop + mobile).
Repo: https://github.com/Mishtuk/Riverside-Website (public), local clone `V:\RiversideWebsite`.
GitHub account: `Mishtuk` (gh CLI is logged in with repo scope).
**Commits:** author is `Mish <113945444+Mishtuk@users.noreply.github.com>` (the GitHub noreply address, so commits link to @Mishtuk), set in the repo's git config. No Claude co-author trailer and no "Generated with Claude Code" line.

## Status (2026-10-12)
- Repo was empty (README only). The agent team and this handoff have been added, but no site code exists yet.
- The live site was surveyed (see below).
- **Decided:** hosting is GitHub Pages. Reuse the existing logos; the user will get the church's permission when presenting.
- **v1 built 2026-10-12. Round 2 polish done 2026-10-13. Pushed to GitHub.** See docs/PLAN.md for the rounds.
  - Pages:
    - home: hero video, new-here, latest YouTube message, podcast teaser, get involved, give band, visit/map
    - /im-new, /about (+5 subpages), /watch, /podcast, /get-involved, /events, /give, /connect, /subscribe, 404
    - sitemap.xml, robots.txt, 26 old-URL redirects
  - Lighthouse (mobile): home 99/97/100/100; /give 92/95/73/100. The 73 comes from the MinistryForms vendor and can't be fixed on our side.
  - Facts live in `src/lib/site.ts` (`CHURCH`, `NAV`, `href()`). Never hard-code times, address or phone.
  - Domain switch: build with env `SITE=https://www.riversideconnect.com BASE=/`.
  - **Pending user decision:** should the Give band and footer stay dark or go light cream?
  - **Needs client input:** Men's ministry copy, photos of Katrina, Paul and Martry, and the Hebrews study schedule (only an image on the old site). The podcast feed has been stale since 2020.
  - Screenshots and the link checker (`linkcheck.mjs`) were in the session scratchpad. Regenerate them with headless Chrome against `npx astro preview`.

## User's design brief (2026-10-12, verbatim intent)
- Modern, refined, cleaned up, and **impressive**: "flashier and more eye-appealing" for the church's demographic.
- **The light theme always stays.** Keep the existing palette (gold/cream/near-black) unless a change is clearly called for.
- **Hero video on the front page** (the existing montage, re-encoded for the web).
- A new **podcast section**. The feed is /feeds/sermons (about 150 items), and Apple Podcasts id 387370044.
- Learn from popular, high-traffic church websites and borrow their design choices.
- Give the user a list of things to add on top of this.

## The church
- Riverside Community Church, branded "Riverside Connect". 239 Columbia Avenue, Horsham, PA 19044
- 215-441-0404, riverside@riversideconnect.com. Text-to-give number: 267-274-2425
- Tagline: "People Equipping People to Reflect the Transformational Love of Jesus."
- Sundays: 9:00am & 10:30am. Kids' classes and the livestream run during the 10:30am service. Prayer group meets 9:30–10:30am in the Counseling Office.
- Staff: Ezra Strickhouser (Lead Pastor), Katrina Strickhouser (Office Admin, does church design work), Paul Leese (Elder), Martry Julias (Elder, Project Nicaragua)
- Socials: instagram.com/riversidechurch_horsham, youtube.com/channel/UCWcjfHPkDfMiiGgp0L8zDjQ, Facebook page id 150401978326964

## Current site (what we're replacing)
- Platform: Church Plant Media CMS. Assets live on cpmfiles1/cpmfiles4.com. It uses jQuery, Alpine v2, and a deprecated Universal Analytics tag (UA-5005041-2, which is dead).
- Brand tokens pulled from its CSS: gold `#C7A359`, near-black `#1c1c1c`/`#2c2c2c`, cream `#efede8`, warm greys `#E1DDD7` `#D3CDC6`, slate `#7A8D9A`. Fonts: DM Serif Text (Google) and an Adobe Typekit kit (`ocb0rqs`).
- **Integrations to keep (embed only, never rebuild):**
  - Giving: MinistryForms iframe `formId=1950c935-d9f8-431c-b8ef-f3ff1d8a42ae`
  - Response form: MinistryForms iframe `formId=a2ba1737-d3fa-4331-aae5-391e389ce543`
  - Prayer: MinistryForms `d3b02759-c0de-4d32-8f29-b8ef1398bb7d`
  - Other forms: email signup and daily prayer emails use Mailchimp (riversideconnect.us2.list-manage.com). Discipleship uses Wufoo (riverside.wufoo.com/forms/kqoyyfg1rlvat6). ESL uses a Google Form. Baptisms is by email.
  - The podcast RSS is **stale**: the newest item is 2020-06-14, there are no durations or images, and items are listed oldest first. YouTube is current, with weekly livestreams.
  - Content was ported to `src/content/pages/*.md` (25 pages) along with `staff.json` and `images.json`. Typos were fixed during the port.
  - Livestream and sermons: YouTube channel above, previous-livestreams playlist `PLbS1l_W_y15idxZN2oJY6xpN-6NlCaRNE`. The keyless channel RSS feed `https://www.youtube.com/feeds/videos.xml?channel_id=UCWcjfHPkDfMiiGgp0L8zDjQ` can supply the latest videos at build time.
  - A podcast feed exists at /subscriptions. Find out whether it's still updated.
- Problems found:
  - Service times conflict: the home page says the livestream starts at 10am, but the livestream page says 10:30. The prayer group is listed "at 10am" but runs 9:30–10:30.
  - The sermon archive stops at Jul 20, 2025.
  - Links are http-only, and the Facebook URL uses the old `#!` format. Several links point to `#`.
  - Copy typo: "it's timeless truth" should be "its".
  - The 3-level nested menu has about 25 items.

## Brand assets (in repo, `public/`)
These were copied from the live site. Black line art on transparent, so they need a light background or a CSS `filter: invert(1)` on dark.
- `brand/riversidelogo2.png` (600x200): church badge + "Riverside" script wordmark + "Community Church". Use for the header.
- `brand/logo-ret.png` (557x260): wordmark only
- `brand/church-reduce.png` (622x622): circular church-building badge. Use for the favicon/social icon.
- `favicon.ico`: 16x16 only. Generate larger icons from the badge.

## Plan
- **Stack:** Astro (static output), plain CSS, no client framework. One layout, with content in `src/content/` as markdown. Deploy to GitHub Pages with the official Astro GitHub Action. The custom domain gets set up at launch.
- **Proposed navigation** (6 top-level items instead of about 25):
  - **I'm New:** what to expect, directions & times, kids
  - **About:** beliefs, core values, what is the gospel, faith & politics, staff, partnerships
  - **Watch:** livestream, sermons (YouTube)
  - **Get Involved:** discipleship (men/women), ESL, serving, prayer, baptisms, events, RightNow Media, study guides
  - **Events**
  - **Give** (button)
- **Home page priorities:** service times, location, and Watch Live above the fold on mobile; then I'm New; latest sermon; events; give.
- Keep every old URL working (redirects) so Google rankings and printed links don't break.
- Add Church JSON-LD, per-page meta, a sitemap, and a GA4 tag if they want analytics.

## Plugins (project scope, `.claude/settings.json`)
- **frontend-design**: Anthropic's design skill. It works alongside the user-level design-taste-frontend skill.
- **chrome-devtools-mcp**: drives a headless Chrome. Used for screenshots at phone and desktop widths, Lighthouse audits, and console/network checks.
- **context7**: current Astro docs. It needs a one-time sign-in via `/mcp`.
- **Claude in Chrome** (the user's browser) is available too. Prefer chrome-devtools so the user's tabs aren't touched.

## Agent team (`.claude/agents/`)
Project agents only load when Claude Code starts in the repo folder. If they're missing, spawn a general-purpose agent with the same role text and model/effort from the table.
Each agent uses the cheapest model and effort that does its job well.

| Agent | Model / effort | Owns |
|---|---|---|
| boss | opus / medium | Picks the next step, enforces scope and file ownership. Read-only. |
| designer | opus / high | Visual design, `src/styles/`. Uses the design-taste-frontend skill. |
| coder | sonnet / medium | Astro pages, components, layouts, build, deploy |
| content-porter | haiku / low | Mechanical copy migration into `src/content/` |
| advisor | sonnet / medium | Reviews facts, a11y, mobile, SEO, and performance. Read-only. |
| mediator | sonnet / low | Rules on conflicts between agents against this brief. Read-only. |

Workflow: boss picks a task → designer/coder/porter do it (at most about 3 agents at once, and never two on the same file) → advisor reviews → mediator only if two agents disagree → the main session verifies and updates this file.

## Open questions for the user
1. At launch: who can change the DNS for riversideconnect.com?
2. Is the Typekit font licensed to the church? If not, switch to Google Fonts.
3. Which service time is correct for the livestream, 10:00 or 10:30?
4. Should the sermon archive stay on-site (Jul 2025 and earlier) or move to YouTube only?
