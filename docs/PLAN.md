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

## Rounds 3–6 (done 2026-10-13)
- R3: self-hosted fonts and inline CSS (local Lighthouse perf 98–100, a11y/SEO 100); audit fixes.
- R4: branded sermon cards, custom podcast player, staff redesign, Get Involved trimmed, Events rebuilt, Give layout.
- R5: HD hero video (1080p AV1 + H.264) and 1920px stills with srcset.
- R6: boss verdict **SHIP-READY**. Final polish: podcast archive first, Give phone height, no date pills, short card dates, photo variety, phone hero crop.

## Ongoing verify loop (repeat as needed)
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

## Round 7: mobile-first polish (started 2026-10-13)
The goal is for the phone version to feel like a native app, not a shrunken desktop site. There is one responsive site; there is no separate m. site.
| # | Task | Owner |
|---|---|---|
| 1 | A sticky bottom action bar on phones (Plan a visit · Watch · Give · Call/Directions) that hides while scrolling down and returns on scroll up | designer |
| 2 | A full-screen phone menu with quick info (times, address, tap to call, directions) and 48px targets | designer |
| 3 | Safe-area insets for notched phones, a typography and spacing tune at 360/390/430, plus tablet (768) and landscape-phone layouts | designer |
| 4 | A portrait hero video for phones (9:16), cropped scene by scene so a person is always in frame | coder |
| 5 | Add to Home Screen: web manifest, icons and theme colour | coder |
| 6 | Directions open the phone's maps app; form inputs ≥16px so iOS doesn't zoom; a device-matrix QA | coder |
