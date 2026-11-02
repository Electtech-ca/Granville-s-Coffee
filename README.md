# Granville's Coffee — website

The public website for Granville's Coffee, 383 Reid Street, Quesnel, BC. It is built from the
"hero carousel final fix" concept (a single 4.6 MB `index.html`), cleaned up so it is stable, fast and easy to edit.

## What's on the page

| Section | What it does |
|---|---|
| Header + mobile menu | Links to every section; collapses into a ☰ Menu button on phones |
| Journey ribbon | Sticky section jumper with a 3-stamp "passport" earned by playing |
| Hero carousel | Slide 1: welcome copy and a live Quesnel-time clock. Slide 2: the illustrated café banner, with every button drawn in the picture clickable. Arrows, dots, pause, swipe, keyboard; pauses on hover/focus and for reduced-motion users |
| Town stage | "Pull up a chair" / "Another story" cycle the community-table stories |
| Our people | Three characters with lines, plus a 3-chapter choose-your-path quest |
| Menu | Category tabs, spotlight, "Meet another suspect", clickable dishes (optional prices) |
| Meet Ted | Owner story (portrait placeholder until an approved photo is added) |
| Inside Granville's | The real photos: coffee-sack ceiling (×2), the wall clock, the table pager |
| Field guide, Games, Fitness test | Directions machine, catch-the-bun, rumour generator, localness test, Ted's fitness exam |
| Visit | Address, map link, hours, contact form |

## Files

```
index.html              page markup
assets/css/site.css     all styles (duplicates from the concept removed)
assets/js/content.js    default text, menu, stories and game lines
assets/js/site.js       every button and widget
assets/img/             photos, banner (WebP, 3.5 MB PNG → 300 KB), favicon, social image
docs/original-concept/  the very first concept files
```

## Running it

Open `index.html` through any static server, e.g. `python3 -m http.server`, or publish with GitHub Pages
(the workflow in `.github/workflows/pages.yml` deploys automatically).
