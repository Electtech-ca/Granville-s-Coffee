# Granville's Coffee — Cloud-connected demonstration

## What is real
- Shared PostgreSQL database hosted by Supabase
- Supabase Auth sign-in, administrator allowlist, and row-level security
- Live content, menu, pricing, stock and promotion updates for all visitors
- Public demo checkout processed atomically by a PostgreSQL function
- Customer visit/spend/loyalty tracking and executive sales metrics
- Public hosting on GitHub Pages

## Setup (approximately 20–30 minutes)
1. Create a project at https://supabase.com and open **SQL Editor**.
2. Execute `schema.sql` in a fresh project. It creates demo tables and policies.
3. In **Authentication → Users**, create an administrator user with a strong password.
4. Copy that user's UUID, then execute this SQL with the actual UUID:
   `insert into public.admin_users(user_id) values ('YOUR-USER-UUID');`
5. In **Project Settings → API** (or API Keys), copy the project URL and the **publishable/anon** key.
6. Replace placeholders in `config.js`. **Never put the service_role or secret key in this file.**
7. Upload `index.html`, `config.js`, and optionally `README.md` to a public GitHub repository root. Do NOT publish `schema.sql` if you prefer to keep infrastructure code private (it contains no credentials).
8. In GitHub repository **Settings → Pages**, choose **Deploy from a branch**, `main`, `/ (root)`. Wait for the deployment.
9. Visit `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.
10. Open **Administrator**, sign in, edit a headline or price, and verify the change in another browser.

## Important limitations before any real business launch
This is a real cloud-connected **demonstration**, not a production ordering or enterprise ERP system.
- Demo checkout charges **no money**, has no taxes, and does not submit orders to the cafe or POS.
- Do not use real customer personal information in demonstrations. CRM is a basic illustrative system, not a consent-managed marketing system.
- The demo order RPC is public and can be spammed. Before production add rate limiting, CAPTCHA/bot protection, abuse monitoring and an order-acceptance workflow.
- Public demo ordering changes stock; reset sample data as needed.
- Product photos are illustrative external images, not verified Granville's media.
- Admin media fields currently accept image URLs; secure uploads, video management, editing history, audit logs, backups and advanced permissions are future work.
- The dashboard reflects demo orders only; not live financial reporting.
- GitHub Pages hosts the public frontend, while Supabase hosts the live backend.
- Do not use this configuration for live payments or a production POS.
