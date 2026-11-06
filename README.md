# Granville's Coffee — website and admin portal

The public website for Granville's Coffee, 383 Reid Street, Quesnel, BC, plus a PostgreSQL-backed admin
portal for running the café: edit the website, answer messages, know your customers, record sales,
manage stock and suppliers, track staff and money, set goals, and get AI help.

The public site was rebuilt in November 2026 around one concept: **"Quesnel's front room, est. 1992"**, a heritage
main-street landmark with Granville green, warm paper, brass award plaques and newspaper type. It is made for readers of
every age: 20px+ text (Atkinson Hyperlegible), high contrast, big buttons, an "A+ Bigger text" switch, a "Call" button on
every page, and **no animation at all**. It still works as a plain static site (GitHub Pages); with the server running,
everything on it comes from the database and can be changed from `/admin/`.

## The pages

Five pages, the same big navigation bar on each (on phones the Menu button sits on top, full width):

| Page | What's on it |
|---|---|
| `index.html` Home | Welcome, today's hours/address/phone, "Where Quesnel meets" (meet people, get directions, stay a while), photo tiles into each menu section, the legacy box with key numbers, Today's board (soup, special and fresh baking, filled in by staff each morning; it disappears at midnight), "Faces of Granville's" (regulars who agreed to be featured), "Overheard at the counter", live Google reviews (shown only when a Google key is set), the real café photos |
| `menu.html` Food & Drink Menu | The full published menu (breakfast, panini, home recipes, baking, North Roast coffee, shakes) with a photo per dish, Today's board at the top, a section jump bar, print button. Prices show only if "Show prices" is ticked in the admin |
| `story.html` Our Story | Ted Martindale's story, the timeline from 1992, "Then and now" photo pairs (hidden until permission is recorded), the 6,000 lb carrot cake by the numbers, inside photos, community giving |
| `awards.html` Awards | The Wall of Honour: one brass plaque per award, each marked Confirmed / Pending / Milestone with its news source linked |
| `visit.html` Visit & Directions | Address with one-tap buttons (directions, text me the address, copy the address, map), "From the highway" step-by-step directions off Highway 97, hours with today highlighted, contact form, the Directions Desk (real directions to Barkerville, the Pinnacles, the footbridge, the museum, Bowron Lake, Highway 97 plus "what the regulars would say") |

Food and people photos are free-licence Unsplash photos, loaded from Unsplash's image server, until the café's own are
uploaded (Edit website → Menu & food photos). The ceiling, clock and pager photos are the café's own.

## The admin portal (`/admin/`)

Plain-language screens, built for phones and laptops. Each person logs in with their own email and password.

| Screen | What you can do |
|---|---|
| **Dashboard** | Revenue, orders, average ticket, gross margin, labour %, estimated net profit, each compared with the previous period. Sales trend with a 7-day forecast, busiest hours and days, top sellers, low stock, unread messages, regulars to win back, website visits and where they came from. A "What to know" list of plain-English insights, plus an AI weekly briefing |
| **Today's board** | Any staff member types today's soup, special, baking and a short note, then presses Save. It shows on the home page and menu for today only and comes down by itself at midnight |
| **Edit website** | Every heading and paragraph on the site, the menu (names, descriptions, photo for each dish, prices, costs, show/hide, categories, optional prices on the site), the Awards wall, the history timeline, the Directions Desk, Faces of Granville's (a regular only shows when marked "Yes, they agreed" and has a photo), From the highway, Then & now (a pair only shows when marked "Yes, we have written permission" with both photos), photos (upload, replace, captions, Ted's portrait), address, phone, email, map link and opening hours, and the "Overheard" stories. Changes go live within seconds. AI can rewrite text and menu descriptions in the café's voice |
| **Inbox** | Messages from the website contact form. Open, reply by email, mark as replied or archived, or let AI draft a reply |
| **Customers (CRM)** | Customer list with search, tags, loyalty points and email consent. Automatic segments: Champions, Loyal, New, At risk, Lost, Prospects. Each customer has a profile with their spend, favourite items and a timeline of visits, notes, calls and messages |
| **Record sales** | A tap-to-ring till for when the till doesn't sync: items, customer, staff member, payment, GST. Recent sales with undo. Loyalty points are added automatically |
| **Stock & suppliers** | Stock levels with quick +/- and counted adjustments, reorder levels, low-stock warnings, purchase orders (one tap creates draft orders for everything low, then ordered → received adds the stock and the expense), supplier list, email to supplier |
| **Team & shifts** | Staff list with hourly rates, shifts, hours and sales per labour hour; customer reviews with AI reply drafts |
| **Money** | Profit and loss for any period (sales, cost of goods, labour, expenses, net), expenses by category, expense log |
| **Goals & performance** | Editable targets (daily revenue, average ticket, margin, labour %, repeat rate, new customers, reply time) with on-track/close/behind status and an overall score; menu engineering (Stars, Plowhorses, Puzzles, Dogs); customer health; staff productivity |
| **AI assistant** | Ask anything about the business ("Which day should I run a promo?"), weekly briefing, marketing ideas (email, social, specials board) grounded in your real numbers |
| **Settings** | Change your password, export CSV (customers, sales, stock, expenses, messages, newsletter, menu, shifts), invite people, load or remove sample data, activity log of who changed what |

**Roles.** *Owner*: everything, including logins, sample data and the activity log. *Manager*: everything except
logins. *Staff*: dashboard, AI assistant, inbox, customers, till, stock, team and goals; no Money page, website editing or logins.

## Running it

You need Node.js 20+ and PostgreSQL 13+.

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL (and optionally the others)
export $(grep -v '^#' .env | xargs)
npm start                     # http://localhost:3000  and  http://localhost:3000/admin/
```

On first start the server creates the tables, copies the current site text, menu and photos into the database,
and creates the owner login from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. If those are blank, open `/admin/` and create
the owner there (it asks for `SETUP_TOKEN` if you set one). To try the portal with realistic numbers, set
`SEED_DEMO=1` or press **Load sample data** in Settings; **Remove sample data** clears it again (items marked "(Demo)").

| Setting | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `PGSSL=require` | Use SSL if the URL doesn't already say `sslmode=require` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | First owner account (password 10+ characters) |
| `SETUP_TOKEN` | Code required by the first-run setup screen |
| `ANTHROPIC_API_KEY` | Turns on the AI features (Claude). Without it, the portal uses built-in rule-based insights |
| `ANTHROPIC_MODEL` | Optional model override (default `claude-opus-5-5`) |
| `BUSINESS_TZ` | Café time zone for hours and daily totals (default `America/Vancouver`) |
| `SEED_DEMO=1` | Load sample data on start |
| `PORT` | Port to listen on (default 3000) |

### Deploying

**OVH VPS (the café's host).** On a fresh Ubuntu 22.04/24.04 or Debian 12 VPS, one command installs Node.js,
PostgreSQL, nginx, a free HTTPS certificate, auto-restart and nightly backups. Step-by-step guide:
[`deploy/ovh/README.md`](deploy/ovh/README.md).

**Other hosts.** Any Node host with PostgreSQL works: set `DATABASE_URL` and run `npm start`. `render.yaml` is a
ready-made blueprint for Render.

**Public preview on GitHub Pages.** The Pages copy at https://electtech-ca.github.io/Granville-s-Coffee/ shows the
public site with its built-in content (the "Staff login" link stays hidden because there is no server behind it), and
`/admin-preview/` shows the admin portal filled with sample data so people can click through it. Nothing there is
saved. To refresh the sample data, run the server with `SEED_DEMO=1` and then `node scripts/build-admin-preview.js`
(see the comment at the top of that file). The real server redirects `/admin-preview/` to `/admin/`.

### Security notes

Passwords are hashed with scrypt; sessions are httpOnly cookies stored in the database; login and the contact
form are rate limited; admin changes need a same-site header (CSRF protection) and are written to the activity log;
uploads are limited to images up to 6 MB; CSV exports are protected against spreadsheet formula injection;
server code, `.env` and `node_modules` are never served.

## Files
```
index.html              page markup
assets/css/site.css     all styles (duplicates from the concept removed)
assets/js/content.js    default text, menu, stories and game lines
assets/js/site.js       every button and widget
assets/img/             photos, banner (WebP, 3.5 MB PNG → 300 KB), favicon, social image
docs/original-concept/  the very first concept files
admin/                  the admin portal (index.html, admin.css, admin.js; no build step)
server/index.js         Express server: website, /api, /admin, uploaded images
server/routes/          public.js (site content, contact form, visit tracking), admin.js (everything else)
server/db/migrations/   the PostgreSQL schema
server/analytics.js     KPIs, forecast, segments, menu engineering, insights
server/ai.js            Claude-powered helpers (briefing, Q&A, copywriting, reply drafts, marketing)
server/seed.js          copies site content into the database; optional sample data
render.yaml             one-click Render deploy
deploy/ovh/             OVH VPS installer, update and backup scripts
admin-preview/          sample-data admin preview for GitHub Pages (built by scripts/build-admin-preview.js)
```

Without the server, open `index.html` through any static server (e.g. `python3 -m http.server`) or GitHub Pages
(`.github/workflows/pages.yml` deploys it); it uses the defaults in `assets/js/content.js`.

### Google reviews (optional)

The home page can show the café's latest Google reviews, refreshed every six hours. Set `GOOGLE_PLACES_API_KEY` in `.env` to a Google Maps Platform key with **Places API (New)** enabled (optionally `GOOGLE_PLACE_ID`), then restart. Reviews are shown exactly as Google sends them, with the reviewer's name and a link to Google. Without a key, or on the GitHub Pages copy, the section stays hidden.
