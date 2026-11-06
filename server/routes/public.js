// Public API used by the website: live content, contact form, newsletter, page-view tracking.
const express = require("express");
const db = require("../db");
const { rateLimit } = require("../auth");

const router = express.Router();

async function siteContent() {
  const [texts, settingsRows, cats, items, gallery] = await Promise.all([
    db.many("select key,value from site_text"),
    db.many("select key,value from site_settings"),
    db.many("select id,slug,label,title,emoji,photo from menu_categories where visible order by sort,id"),
    db.many("select category_id,name,description,price,emoji,photo from menu_items where visible order by sort,id"),
    db.many("select src,title,caption,alt from gallery where visible order by sort,id")
  ]);
  const S = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
  const showPrices = !!(S.settings && S.settings.showPrices);
  const menu = cats.map((c) => ({
    slug: c.slug, label: c.label, title: c.title, emoji: c.emoji, photo: c.photo || undefined,
    items: items.filter((i) => i.category_id === c.id).map((i) => ({ name: i.name, description: i.description, emoji: i.emoji || undefined, photo: i.photo || undefined, price: showPrices ? i.price : null }))
  }));
  const settings = Object.assign({}, S.settings || {});
  delete settings.showPrices;
  return {
    text: Object.fromEntries(texts.filter((t) => t.value).map((t) => [t.key, t.value])),
    settings,
    hours: S.hours || [],
    stories: S.stories,
    awards: S.awards,
    timeline: S.timeline,
    places: S.places,
    // Only regulars who agreed to appear, and only with a photo.
    faces: (Array.isArray(S.faces) ? S.faces : []).filter((f) => f && f.consent === "yes" && f.photo).map(({ name, since, line, photo }) => ({ name, since, line, photo })),
    board: S.board || null,
    tedPhoto: S.tedPhoto || "",
    menu,
    gallery
  };
}

let cache = { at: 0, data: null };
function invalidate() { cache = { at: 0, data: null }; }

router.get("/site", async (_req, res, next) => {
  try {
    if (!cache.data || Date.now() - cache.at > 15000) cache = { at: Date.now(), data: await siteContent() };
    res.set("Cache-Control", "no-cache").json(cache.data);
  } catch (e) { next(e); }
});

const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

router.post("/contact", rateLimit({ windowMs: 10 * 60e3, max: 5 }), async (req, res, next) => {
  try {
    const name = clean(req.body.name, 120), email = clean(req.body.email, 200).toLowerCase(), message = clean(req.body.message, 3000);
    if (!name || !isEmail(email) || !message) return res.status(400).json({ error: "Please add your name, a valid email and a message." });
    await db.tx(async (c) => {
      let cust = (await c.query("select id from customers where lower(email)=$1", [email])).rows[0];
      if (!cust) cust = (await c.query("insert into customers(name,email,source,marketing_consent) values ($1,$2,'website',$3) returning id", [name, email, !!req.body.newsletter])).rows[0];
      else if (req.body.newsletter) await c.query("update customers set marketing_consent=true where id=$1", [cust.id]);
      await c.query("insert into messages(name,email,message,customer_id) values ($1,$2,$3,$4)", [name, email, message, cust.id]);
      await c.query("insert into interactions(customer_id,kind,summary) values ($1,'message',$2)", [cust.id, "Website message: " + message.slice(0, 200)]);
      if (req.body.newsletter) await c.query("insert into newsletter(email,name) values ($1,$2) on conflict (email) do update set unsubscribed=false", [email, name]);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/track", express.json({ type: () => true, limit: "2kb" }), rateLimit({ windowMs: 60e3, max: 30 }), async (req, res) => {
  try {
    const path = clean(req.body && req.body.path, 200) || "/";
    const ref = clean(req.body && req.body.referrer, 300);
    await db.query("insert into page_views(path,referrer) values ($1,$2)", [path, ref || null]);
  } catch (_) { /* tracking must never break the site */ }
  res.status(204).end();
});

module.exports = { router, invalidate };
