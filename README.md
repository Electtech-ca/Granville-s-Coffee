# Granville's Coffee — website and admin portal

The public website for Granville's Coffee, 383 Reid Street, Quesnel, BC, plus a PostgreSQL-backed admin
portal for running the café: edit the website, answer messages, know your customers, record sales,
manage stock and suppliers, track staff and money, set goals, and get AI help.

The site is built from the "hero carousel final fix" concept (a single 4.6 MB `index.html`), cleaned up so it
is stable and fast. It still works as a plain static site (GitHub Pages); with the server running, everything on
it comes from the database and can be changed from `/admin/`.

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

## The admin portal (`/admin/`)

Plain-language screens, built for phones and laptops. Each person logs in with their own email and password.

| Screen | What you can do |
|---|---|
| **Dashboard** | Revenue, orders, average ticket, gross margin, labour %, estimated net profit, each compared with the previous period. Sales trend with a 7-day forecast, busiest hours and days, top sellers, low stock, unread messages, regulars to win back, website visits and where they came from. A "What to know" list of plain-English insights, plus an AI weekly briefing |
| **Edit website** | Every heading and paragraph on the site, the menu (names, descriptions, prices, costs, show/hide, categories, optional prices on the site), photos (upload, replace, captions, Ted's portrait), address, phone, email, map link and opening hours, and the stories, directions, rumours and game lines. Changes go live within seconds. AI can rewrite text and menu descriptions in the café's voice |
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

Any Node host with PostgreSQL works. On **Render**, choose *New → Blueprint* and pick this repository: `render.yaml`
creates the web service and database and connects them. Then add `ANTHROPIC_API_KEY` if you want AI, open
`https://<your-app>.onrender.com/admin/`, and use the `SETUP_TOKEN` shown in the service's Environment tab to create
the owner login. On Railway, Fly.io or a VPS: create a Postgres database, set `DATABASE_URL`, run `npm start`.
Point the café's domain at that server; the GitHub Pages copy keeps working as a static fallback (its "Staff login"
link stays hidden because there is no server behind it).

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
```

Without the server, open `index.html` through any static server (e.g. `python3 -m http.server`) or GitHub Pages
(`.github/workflows/pages.yml` deploys it); it uses the defaults in `assets/js/content.js`.
