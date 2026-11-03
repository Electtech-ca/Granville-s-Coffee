// Granville's Coffee server: public website + admin portal + PostgreSQL API.
const path = require("path");
const express = require("express");
const db = require("./db");
const auth = require("./auth");
const seed = require("./seed");
const publicApi = require("./routes/public");
const adminApi = require("./routes/admin");

const ROOT = path.join(__dirname, "..");
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Frame-Options", "SAMEORIGIN");
  if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin")) res.set("Cache-Control", "no-store");
  next();
});

app.get("/healthz", async (_req, res) => {
  try { await db.query("select 1"); res.json({ ok: true }); } catch (e) { res.status(503).json({ ok: false }); }
});

app.use("/api", express.json({ limit: "1mb" }));
app.use("/api", auth.loadUser);
app.use("/api/public", publicApi.router);
app.use("/api/admin", adminApi);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

// Images uploaded from the admin portal are stored in PostgreSQL.
app.get("/uploads/:id", async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).end();
    const f = await db.one("select mime,data from uploads where id=$1", [req.params.id]);
    if (!f) return res.status(404).end();
    res.set("Content-Type", f.mime).set("Cache-Control", "public, max-age=31536000, immutable").send(f.data);
  } catch (e) { next(e); }
});

// Static site; never serve server code, dotfiles or package files.
app.use((req, res, next) => {
  if (/^\/(server|node_modules|docs|\.git|\.github|package(-lock)?\.json|README\.md)(\/|$)/i.test(req.path)) return res.status(404).end();
  next();
});
app.use("/admin", express.static(path.join(ROOT, "admin"), { index: "index.html" }));
app.use(express.static(ROOT, { index: "index.html", dotfiles: "deny", maxAge: "1h" }));

app.use((err, req, res, _next) => {
  const status = err.status || (err.type === "entity.too.large" ? 413 : 500);
  if (status >= 500) console.error("[error]", req.method, req.path, err);
  if (req.path.startsWith("/api")) return res.status(status).json({ error: status >= 500 ? "Something went wrong on the server. Please try again." : err.message });
  res.status(status).send("Something went wrong.");
});

async function bootstrapOwner() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const n = (await db.one("select count(*)::int n from users")).n;
  if (n > 0) return;
  if (auth.passwordProblem(ADMIN_PASSWORD)) { console.warn("[setup] ADMIN_PASSWORD is too short (10+ characters); skipping."); return; }
  await db.query("insert into users(email,name,password_hash,role) values ($1,$2,$3,'owner')", [ADMIN_EMAIL.toLowerCase(), ADMIN_NAME || "Owner", auth.hashPassword(ADMIN_PASSWORD)]);
  console.log("[setup] created owner account", ADMIN_EMAIL);
}

async function start() {
  await db.migrate();
  await seed.seedContent();
  if (process.env.SEED_DEMO === "true") await seed.seedDemo();
  await bootstrapOwner();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`[server] Granville's Coffee on http://localhost:${port}  (admin: /admin)`));
}

if (require.main === module) start().catch((e) => { console.error("[server] failed to start:", e.message); process.exit(1); });

module.exports = { app, start };
