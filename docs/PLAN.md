# Riverside website plan

**Goal:** a site that impresses the church on first view. It should be light, refined and warm, and fast on phones, with every fact correct. The user presents it to the church for approval, then we launch on GitHub Pages with the custom domain.

## Done: v1 (2026-10-12, commit a1678cb)
- Home page:
  - hero video
  - New here
  - latest YouTube message
  - podcast teaser
  - get involved
  - give
  - visit/map
- Inner pages: I'm New, About (+5 subpages), Watch, Podcast, Get Involved, Events, Give, Connect, Subscribe, 404
- Technical: 26 redirects, sitemap and robots, OG card, JSON-LD
- Lighthouse on home: 99 performance, 97 accessibility, 100 best practices, 100 SEO

## Round 2: polish (done 2026-10-13)
| # | Task | Owner |
|---|---|---|
| 1 | Give band goes light. The user wants the theme "always light". The footer stays dark as the page anchor; it's easy to flip. | designer |
| 2 | Mobile pass: every page at 390px, then fix spacing, type and overflow | designer |
| 3 | Smooth page-to-page transitions (native CSS view transitions, no JS) and a motion polish | designer |
| 4 | "We're live" banner during Sunday 10:30am–12:00pm ET, plus a "next livestream" line on /watch | coder |
| 5 | A lighter hero video for phones (720p, about 1.5–2 MB) via `<source media>` | coder |
| 6 | Full favicon set: 32px, 180px apple-touch, 512px | coder |

## Round 3: verify
- Advisor: Lighthouse on every page (mobile), screenshots of every page at 390px and 1440px, and a facts re-check.
- Boss: judges against the brief ("extremely satisfactory": would the church be wowed?) and lists the remaining gaps.
- Fix the gaps, then repeat Round 3 until the boss reports no gaps that matter.

## Launch (needs the user's go-ahead)
1. Push to GitHub, set Pages to deploy via "GitHub Actions", and send the preview link to the user.
2. After the church approves:
   - set the env `SITE=https://www.riversideconnect.com BASE=/`
   - add a CNAME
   - point the church's DNS at GitHub Pages
3. Recommendations for the church (not code): restart the podcast (Spotify for Creators), claim the Google Business Profile, staff photos and Sunday photos, Men's ministry copy.

## Out of scope (unless asked)
CMS or login, an events calendar library, a translation system, a store, a custom podcast host.
