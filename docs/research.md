# Design research: church websites (advisor, 2026-10-12)

The site lists are partly from model knowledge and not all were fetched. Treat them as inspiration only.

## Models worth copying
- **VOUS**: silent autoplay worship video hero, with times and address right below it. This is the closest model for Riverside.
- **North Point**: "Join us Sunday" and the service times sit inside the hero. A six-item nav: I'm New / Events / Watch / Give / Serve / More. A "Top 3 things to know" block for new visitors.
- **Transformation Church**: hero reads "Join Us Sundays @ 10:30", followed by three buttons: I'm New, Join a Group, Latest Sermons.
- **Elevation**: a "Find the right experience" block with four paths. The featured sermon is a big thumbnail with a Watch button.
- **Saddleback**: the latest message sits front and center with one-click play.
- **Fusion Christian** (small church): a bold "new visitor" button next to a quieter "watch live" button, plus a map embed.

## Why the top sites get traffic (the parts a small church can copy)
- Local search:
  - Google Business Profile
  - Church JSON-LD structured data
  - clear address and service times
- A new sermon every week, pulled in automatically from the YouTube RSS feed
- Podcast on Apple and Spotify
- A "Plan a visit" form
- Fast static pages

## Design direction
- **Type:** DM Serif Text for headings. Source Sans 3 or Atkinson Hyperlegible for body text, at 18px with 1.6 line height. Sentence case.
- **Palette** (contrast checked):
  - Backgrounds: cream `#efede8`, with `#faf8f3` and `#E1DDD7` for alternating sections.
  - Text: `#1c1c1c`.
  - Gold `#C7A359` is **decoration only** on light backgrounds (rules, numerals, hover fills). Gold text fails contrast at about 2:1.
  - Gold buttons use `#1c1c1c` text (about 7:1).
  - Gold text and links use `#7A5C14` (about 5.3:1 on cream); use `#6B4F10` for small text.
  - Dark bands: `#1c1c1c` background with `#C7A359` headings and cream text.
  - Focus ring: 3px `#7A5C14`.
- **Hero video:**
  - Gradient overlay: `rgba(28,28,28,.55)` → `.35` → `.7`.
  - Copy stack: small gold eyebrow ("Horsham, PA"), a DM Serif H1 tagline, a one-line subhead, a gold "Plan a visit" button and an outlined "Watch live" button.
  - A service times strip goes under the copy.
  - Add a pause button. Show the poster only when the visitor has reduced motion turned on.
- **Home page rhythm:**
  1. Hero with service times
  2. "New here?" in 3 steps
  3. Latest sermon (big thumbnail)
  4. Podcast
  5. Events (3 cards)
  6. Ministries / ESL
  7. Dark band: Give, with the text-to-give number
  8. Map and footer
- **Podcast section:** the latest 3 episodes with native `<audio preload="none">` players. Subscribe badges for Apple, Spotify, YouTube and RSS. Each card shows title, date, series and duration.
- **Motion** (CSS only, and only when the visitor allows motion):
  - the hero text fades up once
  - scroll-reveal via `animation-timeline: view()`
  - cards lift 4px on hover
  - a gold underline grows on links
  - a slow 1.04 → 1.0 zoom on the hero

## Features ranked (effort)
1. Service times, map and parking block (S)
2. Plan a Visit form (S–M)
3. I'm New page (S)
4. Kids info (S)
5. Latest sermon from YouTube RSS (M)
6. Podcast (M)
7. Give page (S)
8. Events (M)
9. Newsletter signup (S)
10. "Next Sunday" countdown or "live now" state (S–M)
11. Sermon series pages (L)
12. Spanish/ESL toggle (L)

Also needed:
- redirects for every old URL
- a skip link
- 44px tap targets
- lazy-loaded YouTube and Maps embeds that only load when clicked
