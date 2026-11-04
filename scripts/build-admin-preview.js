// Builds admin-preview/preview-data.js: a snapshot of the admin portal's screens filled with sample data,
// so GitHub Pages can show a clickable, read-only-ish preview without a server.
//
// Usage: start the server against a throwaway database with sample data loaded (SEED_DEMO=1), then
//   PREVIEW_BASE=http://localhost:3000 PREVIEW_EMAIL=you@example.com PREVIEW_PASSWORD=... node scripts/build-admin-preview.js
const fs = require("fs");
const path = require("path");

const BASE = (process.env.PREVIEW_BASE || "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.PREVIEW_EMAIL, PASSWORD = process.env.PREVIEW_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set PREVIEW_EMAIL and PREVIEW_PASSWORD (an owner login on the sample-data server)."); process.exit(1); }

const PAGES = [
  "/api/admin/me", "/api/admin/messages?status=new", "/api/admin/messages",
  "/api/admin/dashboard?days=7", "/api/admin/dashboard?days=30", "/api/admin/dashboard?days=90", "/api/admin/dashboard?days=365",
  "/api/admin/content", "/api/admin/menu", "/api/admin/r/gallery",
  "/api/admin/r/customers?limit=500&q=", "/api/admin/r/customers?limit=1000", "/api/admin/r/employees",
  "/api/admin/sales?days=2", "/api/admin/r/suppliers", "/api/admin/r/inventory", "/api/admin/purchase-orders",
  "/api/admin/r/shifts?limit=300", "/api/admin/r/reviews", "/api/admin/r/expenses?limit=300",
  "/api/admin/demo", "/api/admin/audit", "/api/admin/users"
];

(async () => {
  const login = await fetch(BASE + "/api/admin/login", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "granvilles-admin" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  if (!login.ok) throw new Error("Login failed: " + (await login.text()));
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const get = async (p) => { const r = await fetch(BASE + p, { headers: { cookie } }); return { status: r.status, body: await r.json() }; };

  const snap = {};
  for (const p of PAGES) snap[p] = await get(p);
  for (const c of snap["/api/admin/r/customers?limit=1000"].body.rows) {
    const d = await get("/api/admin/customers/" + c.id);
    d.body.sales = (d.body.sales || []).slice(0, 15);
    snap["/api/admin/customers/" + c.id] = d;
  }
  for (const i of snap["/api/admin/r/inventory"].body.rows) snap[`/api/admin/inventory/${i.id}/movements`] = await get(`/api/admin/inventory/${i.id}/movements`);

  const out = path.join(__dirname, "..", "admin-preview", "preview-data.js");
  fs.writeFileSync(out, "window.__DEMO_SNAPSHOT__=" + JSON.stringify(snap) + ";\n");
  console.log(`Wrote ${Object.keys(snap).length} screens to ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
