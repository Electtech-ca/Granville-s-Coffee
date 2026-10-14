# Granville's Coffee — website, member area and admin portal

A complete website for Granville's Coffee in downtown Quesnel, BC, built from the concept files in
[`docs/original-concept/`](docs/original-concept/) (the original `index.html`, `config.js`, `schema.sql` and README).
It is a static site, so it runs on **GitHub Pages** with no server to maintain.

## What's included

**Public website**
- Home: hero, highlights, featured menu items, story, rewards, hours, map and newsletter sign-up
- Menu: search, category filters, stock badges, add to order
- Order ahead: basket, pickup name, discount codes, loyalty redemption, order confirmation number
- Our Story, Rewards (tiers and members-only offers), Visit & contact (hours, map, contact form)
- Responsive down to phone width, keyboard accessible, works with no external images

**Member area** (`#/account`)
- Create an account, sign in, sign out, edit profile, change password
- Loyalty card: points balance, tier (Bean / Roast / Reserve), progress to the next reward
- 1 point per $1; 100 points = $5 off at checkout; members-only discount codes
- Order history with one-click reorder

**Admin portal** (`#/admin`, administrators only)
- Overview: revenue, today's sales, order count, average order, open orders, low stock, 14-day revenue chart, top sellers
- Orders: filter by status, move orders through new → preparing → ready → completed / cancelled, CSV export
- Menu & Inventory: add, edit, hide, delete items; price, stock, description, category, featured flag; photo by URL or upload
- Content & Media: announcement bar, headline, intro, hero image (URL or upload), story text, address, phone, email, hours, social links
- Promotions: create, pause, delete discount codes (everyone or members only)
- Customers (CRM): visits, spend, points and tier per customer, CSV export
- Members & Staff: see every account, promote a member to admin or remove admin access
- Messages from the contact form (read/unread, reply by email, delete) and newsletter subscribers (CSV export)
- Data & Settings: database mode, JSON backup, reset demo data

## Test accounts

| Role   | Email                    | Password      |
|--------|--------------------------|---------------|
| Admin  | `admin@granvilles.test`  | `Admin#2026`  |
| Member | `member@granvilles.test` | `Member#2026` |

Sign in from **Sign in** in the header. The member starts with enough points to try a reward. Demo discount codes: `WELCOME10` (everyone) and `MEMBER15` (members only).

## Database: two modes

**1. Browser database (default, works immediately).** While `config.js` still has its placeholders, the site keeps
its database (menu, settings, orders, customers, accounts, messages) in the visitor's browser storage, seeded with
demo data. Everything works, but each browser has its own copy: an admin edit is visible on that device only.
Passwords are stored as salted SHA-256 hashes. Use **Admin → Data & Settings → Reset demo data** to start over.

**2. Shared cloud database (Supabase, free tier).** For changes that every visitor sees in real time:
1. Create a project at https://supabase.com and open **SQL Editor**.
2. Run [`schema.sql`](schema.sql) in the fresh project. It creates the tables, row-level security, the order function and the demo menu.
3. In **Authentication → Users**, add your administrator (email + strong password). Copy its UUID and run
   `insert into public.admin_users(user_id) values ('THE-UUID');`
   Add a member account the same way (no extra SQL needed), or let customers sign up on the site.
   For instant sign-up without email confirmation, turn off **Confirm email** under Authentication → Providers → Email.
4. In **Project Settings → API**, copy the project URL and the **publishable / anon** key into [`config.js`](config.js).
   Never put the `service_role` or secret key in this file.
5. Commit and push. The site switches to cloud mode automatically.

The order is placed by one database function (`place_order`) that re-checks prices, stock, discount codes and points on the server,
then updates stock, the order, its items and the customer's loyalty record in a single transaction.

## Publishing on GitHub Pages

1. GitHub Pages on a **private** repository needs a paid GitHub plan. On a free plan, make the repository public first:
   **Settings → General → Danger Zone → Change visibility → Public**.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick the branch that holds this code and `/ (root)`, then **Save**.
3. After a minute the site is live at **https://electtech-ca.github.io/Granville-s-Coffee/**.

## Files

```
index.html               page shell (header, footer)
config.js                optional Supabase keys
schema.sql               Supabase schema for cloud mode
assets/css/styles.css    design system and layout
assets/js/app.js         pages, member area, admin portal, router
assets/js/store-local.js browser database
assets/js/store-cloud.js Supabase database
assets/js/seed.js        demo menu, settings, accounts and orders
assets/img/              logo, favicon and menu illustrations
docs/original-concept/   the files this site was built from
```

## Before a real launch

This is a demonstration, carried over from the original concept's limitations:
- Online checkout takes **no payment**, adds no tax and does not send orders to the café or a POS.
- Prices, hours, story text and the 1-point-per-dollar reward are placeholders that need the owner's approval.
  The exact street address, phone and email are left general or blank for the owner to fill in under **Admin → Content & Media**.
- Product photos are illustrative (Unsplash) or drawn illustrations, not Granville's own photography.
- Public ordering can be spammed; add rate limiting / CAPTCHA and an order-acceptance workflow before going live.
- The CRM is illustrative and is not a consent-managed marketing system. Don't load real customer data into the demo.
