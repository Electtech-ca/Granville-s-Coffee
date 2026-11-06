// Admin API: authentication, website content, CRM, ERP, analytics, AI, users.
const express = require("express");
const db = require("../db");
const auth = require("../auth");
const analytics = require("../analytics");
const ai = require("../ai");
const seed = require("../seed");
const { invalidate } = require("./public");

const router = express.Router();
const { requireRole, audit } = auth;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

router.use(auth.csrfGuard);

/* ================= Auth ================= */
router.get("/setup-status", wrap(async (_req, res) => {
  const n = (await db.one("select count(*)::int n from users")).n;
  res.json({ needsSetup: n === 0, tokenRequired: !!process.env.SETUP_TOKEN });
}));

router.post("/setup", auth.rateLimit({ windowMs: 15 * 60e3, max: 10 }), wrap(async (req, res) => {
  const n = (await db.one("select count(*)::int n from users")).n;
  if (n > 0) return bad(res, "Setup is already complete. Please sign in.", 409);
  if (process.env.SETUP_TOKEN && req.body.token !== process.env.SETUP_TOKEN) return bad(res, "The setup code is not correct.", 403);
  const { name, email, password } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || "")) return bad(res, "Please enter your name and a valid email.");
  const problem = auth.passwordProblem(password);
  if (problem) return bad(res, problem);
  const u = await db.one("insert into users(email,name,password_hash,role) values ($1,$2,$3,'owner') returning id", [email.toLowerCase().trim(), name.trim(), auth.hashPassword(password)]);
  await auth.createSession(res, req, u.id);
  res.json({ ok: true });
}));

router.post("/login", auth.rateLimit({ windowMs: 15 * 60e3, max: 10 }), wrap(async (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const u = await db.one("select id,password_hash,active from users where email=$1", [email]);
  if (!u || !u.active || !auth.verifyPassword(String(req.body.password || ""), u.password_hash)) return bad(res, "That email and password don't match.", 401);
  await auth.createSession(res, req, u.id);
  res.json({ ok: true });
}));

router.post("/logout", wrap(async (req, res) => { await auth.destroySession(req, res); res.json({ ok: true }); }));

router.get("/me", (req, res) => {
  if (!req.user) return bad(res, "Please sign in.", 401);
  res.json({ user: req.user, aiEnabled: ai.enabled(), aiModel: ai.MODEL });
});

router.post("/me/password", requireRole("staff"), wrap(async (req, res) => {
  const u = await db.one("select password_hash from users where id=$1", [req.user.id]);
  if (!auth.verifyPassword(String(req.body.current || ""), u.password_hash)) return bad(res, "Your current password is not correct.");
  const problem = auth.passwordProblem(req.body.password);
  if (problem) return bad(res, problem);
  await db.query("update users set password_hash=$1 where id=$2", [auth.hashPassword(req.body.password), req.user.id]);
  await db.query("delete from sessions where user_id=$1", [req.user.id]);
  await auth.createSession(res, req, req.user.id);
  await audit(req, "password", "user", req.user.id);
  res.json({ ok: true });
}));

// Everything below needs a signed-in user.
router.use(requireRole("staff"));

/* ================= Generic CRUD ================= */
const R = {
  customers: { table: "customers", read: "staff", write: "staff", order: "created_at desc", search: ["name", "email", "phone", "notes"],
    fields: { name: "text!", email: "email", phone: "text", birthday: "date", tags: "tags", notes: "text", source: "text", marketing_consent: "bool", loyalty_points: "int" } },
  employees: { table: "employees", read: "staff", write: "manager", order: "active desc, name", search: ["name", "role", "email"],
    fields: { name: "text!", role: "text", email: "email", phone: "text", hourly_rate: "num", active: "bool", hired_on: "date" } },
  suppliers: { table: "suppliers", read: "staff", write: "manager", order: "name", search: ["name", "contact", "email"],
    fields: { name: "text!", contact: "text", email: "email", phone: "text", lead_days: "int", notes: "text" } },
  inventory: { table: "inventory_items", read: "staff", write: "manager", order: "name", search: ["name", "category"],
    fields: { name: "text!", category: "text", unit: "text", on_hand: "num", reorder_level: "num", reorder_qty: "num", unit_cost: "num", supplier_id: "int" } },
  expenses: { table: "expenses", read: "manager", write: "manager", order: "spent_on desc, id desc", search: ["category", "vendor", "notes"],
    fields: { spent_on: "date!", category: "text", vendor: "text", amount: "num!", notes: "text" } },
  shifts: { table: "shifts", read: "staff", write: "manager", order: "starts_at desc",
    fields: { employee_id: "int!", starts_at: "datetime!", ends_at: "datetime!", notes: "text" } },
  reviews: { table: "reviews", read: "manager", write: "manager", order: "reviewed_on desc",
    fields: { employee_id: "int!", reviewed_on: "date!", rating: "int!", strengths: "text", improvements: "text", goals: "text" } },
  gallery: { table: "gallery", read: "staff", write: "manager", order: "sort, id", content: true,
    fields: { src: "text!", title: "text", caption: "text", alt: "text", sort: "int", visible: "bool" } },
  categories: { table: "menu_categories", read: "staff", write: "manager", order: "sort, id", content: true,
    fields: { slug: "slug!", label: "text!", title: "text", emoji: "text", photo: "text", sort: "int", visible: "bool" } },
  items: { table: "menu_items", read: "staff", write: "manager", order: "sort, id", content: true, search: ["name", "description"],
    fields: { category_id: "int!", name: "text!", description: "text", price: "num", cost: "num", emoji: "text", photo: "text", sort: "int", visible: "bool" } },
  kpis: { table: "kpi_targets", pk: "metric", read: "staff", write: "manager", order: "metric",
    fields: { metric: "slug!", label: "text!", target: "num!", direction: "text", unit: "text" } },
  newsletter: { table: "newsletter", pk: "email", read: "manager", write: "manager", order: "created_at desc", search: ["email", "name"],
    fields: { email: "email!", name: "text", unsubscribed: "bool" } }
};

function coerce(type, v) {
  const t = type.replace("!", "");
  if (v === "" || v === undefined || v === null) return null;
  switch (t) {
    case "int": { const n = parseInt(v, 10); if (Number.isNaN(n)) throw new Error("must be a whole number"); return n; }
    case "num": { const n = Number(String(v).replace(/[$,\s]/g, "")); if (Number.isNaN(n)) throw new Error("must be a number"); return n; }
    case "bool": return v === true || v === "true" || v === "on" || v === 1 || v === "1";
    case "date": if (!/^\d{4}-\d{2}-\d{2}/.test(v)) throw new Error("must be a date"); return String(v).slice(0, 10);
    case "datetime": { const d = new Date(v); if (Number.isNaN(d.getTime())) throw new Error("must be a date and time"); return d.toISOString(); }
    case "tags": return (Array.isArray(v) ? v : String(v).split(",")).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
    case "email": { const e = String(v).trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error("must be a valid email"); return e; }
    case "slug": return String(v).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    default: return String(v).slice(0, 5000);
  }
}

function buildValues(res, def, body, partial) {
  const cols = [], vals = [], ph = [];
  for (const [col, type] of Object.entries(def.fields)) {
    if (!(col in body)) { if (!partial && type.endsWith("!")) throw new Error(`${col.replace(/_/g, " ")} is required`); continue; }
    let v;
    try { v = coerce(type, body[col]); } catch (e) { throw new Error(`${col.replace(/_/g, " ")} ${e.message}`); }
    if (v === null && type.endsWith("!")) throw new Error(`${col.replace(/_/g, " ")} is required`);
    if (type === "bool" && v === null) v = false;
    if (type === "tags" && v === null) v = [];
    cols.push(col);
    // A blank optional field falls back to the column's default ('' for notes, 'walk-in' for source, null for dates).
    if (v === null) ph.push("default"); else { vals.push(v); ph.push("$" + vals.length); }
  }
  return { cols, vals, ph };
}

const resDef = (req, res, mode) => {
  const def = R[req.params.res];
  if (!def) { bad(res, "Unknown section.", 404); return null; }
  if (auth.ROLE_RANK[req.user.role] < auth.ROLE_RANK[def[mode]]) { bad(res, "Your role doesn't allow this. Ask the owner.", 403); return null; }
  return def;
};

router.get("/r/:res", wrap(async (req, res) => {
  const def = resDef(req, res, "read"); if (!def) return;
  const where = [], params = [];
  if (req.query.q && def.search) { params.push("%" + req.query.q + "%"); where.push("(" + def.search.map((c) => `${c}::text ilike $${params.length}`).join(" or ") + ")"); }
  for (const [k, v] of Object.entries(req.query)) {
    if (k.startsWith("f_") && def.fields[k.slice(2)] !== undefined) { params.push(v); where.push(`${k.slice(2)} = $${params.length}`); }
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000), offset = parseInt(req.query.offset, 10) || 0;
  const w = where.length ? "where " + where.join(" and ") : "";
  const total = (await db.one(`select count(*)::int n from ${def.table} ${w}`, params)).n;
  const rows = await db.many(`select * from ${def.table} ${w} order by ${def.order} limit ${limit} offset ${offset}`, params);
  res.json({ rows, total });
}));

router.post("/r/:res", wrap(async (req, res) => {
  const def = resDef(req, res, "write"); if (!def) return;
  let v;
  try { v = buildValues(res, def, req.body, false); } catch (e) { return bad(res, e.message.charAt(0).toUpperCase() + e.message.slice(1) + "."); }
  const row = await db.one(`insert into ${def.table}(${v.cols.join(",")}) values (${v.ph.join(",")}) returning *`, v.vals);
  if (def.content) invalidate();
  await audit(req, "create", req.params.res, row[def.pk || "id"]);
  res.json(row);
}));

router.put("/r/:res/:id", wrap(async (req, res) => {
  const def = resDef(req, res, "write"); if (!def) return;
  let v;
  try { v = buildValues(res, def, req.body, true); } catch (e) { return bad(res, e.message.charAt(0).toUpperCase() + e.message.slice(1) + "."); }
  if (!v.cols.length) return bad(res, "Nothing to save.");
  const row = await db.one(`update ${def.table} set ${v.cols.map((c, i) => `${c}=${v.ph[i]}`).join(",")} where ${def.pk || "id"}=$${v.vals.length + 1} returning *`, [...v.vals, req.params.id]);
  if (!row) return bad(res, "That record no longer exists.", 404);
  if (def.content) invalidate();
  await audit(req, "update", req.params.res, req.params.id, { fields: v.cols });
  res.json(row);
}));

router.delete("/r/:res/:id", wrap(async (req, res) => {
  const def = resDef(req, res, "write"); if (!def) return;
  if (req.params.res === "customers" && auth.ROLE_RANK[req.user.role] < 2) return bad(res, "Only a manager can delete customers.", 403);
  try {
    const r = await db.query(`delete from ${def.table} where ${def.pk || "id"}=$1`, [req.params.id]);
    if (!r.rowCount) return bad(res, "That record no longer exists.", 404);
  } catch (e) {
    if (e.code === "23503") return bad(res, "This record is still used elsewhere (for example on a purchase order), so it can't be deleted.");
    throw e;
  }
  if (def.content) invalidate();
  await audit(req, "delete", req.params.res, req.params.id);
  res.json({ ok: true });
}));

/* ================= Website content ================= */
router.get("/content", wrap(async (_req, res) => {
  const text = await db.many("select key,label,value,updated_at from site_text order by key");
  const settings = Object.fromEntries((await db.many("select key,value from site_settings")).map((r) => [r.key, r.value]));
  res.json({ text, settings });
}));

router.put("/content/text", requireRole("manager"), wrap(async (req, res) => {
  const entries = Object.entries(req.body || {}).filter(([k]) => /^[a-z0-9_.-]+$/i.test(k));
  for (const [k, v] of entries) await db.query("update site_text set value=$2, updated_at=now() where key=$1", [k, String(v).slice(0, 5000)]);
  invalidate();
  await audit(req, "update", "site_text", null, { keys: entries.map((e) => e[0]) });
  res.json({ ok: true, saved: entries.length });
}));

const SETTING_KEYS = ["settings", "hours", "stories", "awards", "timeline", "places", "faces", "board", "fromHighway", "thenNow", "tedPhoto"];
router.put("/content/settings/:key", requireRole("manager"), wrap(async (req, res) => {
  if (!SETTING_KEYS.includes(req.params.key)) return bad(res, "Unknown setting.", 404);
  const value = req.body.value;
  if (value === undefined) return bad(res, "Nothing to save.");
  if (JSON.stringify(value).length > 100000) return bad(res, "That's too much text for one setting.");
  await db.query("insert into site_settings(key,value,updated_at) values ($1,$2,now()) on conflict (key) do update set value=excluded.value, updated_at=now()", [req.params.key, JSON.stringify(value)]);
  invalidate();
  await audit(req, "update", "setting", req.params.key);
  res.json({ ok: true });
}));

// Today's board (soup, special, baking): every staff member can update it from a phone.
router.put("/board", wrap(async (req, res) => {
  const b = req.body || {};
  const clean = (v) => String(v == null ? "" : v).trim().slice(0, 300);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ""))) return bad(res, "Missing the date.");
  const value = { date: b.date, soup: clean(b.soup), special: clean(b.special), baking: clean(b.baking), note: clean(b.note), by: req.user.name || "" };
  await db.query("insert into site_settings(key,value,updated_at) values ('board',$1,now()) on conflict (key) do update set value=excluded.value, updated_at=now()", [JSON.stringify(value)]);
  invalidate();
  await audit(req, "update", "setting", "board");
  res.json({ ok: true, value });
}));

router.get("/menu", wrap(async (_req, res) => {
  const cats = await db.many("select * from menu_categories order by sort,id");
  const items = await db.many("select * from menu_items order by sort,id");
  res.json(cats.map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id) })));
}));

/* ================= Uploads (stored in PostgreSQL) ================= */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
router.post("/upload", requireRole("manager"), express.raw({ type: IMAGE_TYPES, limit: "6mb" }), wrap(async (req, res) => {
  const mime = (req.get("Content-Type") || "").split(";")[0];
  if (!IMAGE_TYPES.includes(mime) || !Buffer.isBuffer(req.body) || !req.body.length) return bad(res, "Please choose a JPG, PNG, WebP or GIF image under 6 MB.");
  const name = String(req.get("X-Filename") || "image").replace(/[^\w.\- ]+/g, "").slice(0, 120);
  const row = await db.one("insert into uploads(filename,mime,size,data) values ($1,$2,$3,$4) returning id", [name, mime, req.body.length, req.body]);
  await audit(req, "upload", "upload", row.id, { name });
  res.json({ id: row.id, url: "uploads/" + row.id });
}));

/* ================= CRM ================= */
router.get("/customers/:id", wrap(async (req, res) => {
  const c = await db.one("select * from customers where id=$1", [req.params.id]);
  if (!c) return bad(res, "Customer not found.", 404);
  const [interactions, sales, stats] = await Promise.all([
    db.many("select i.*, u.name by_name from interactions i left join users u on u.id=i.created_by where customer_id=$1 order by created_at desc limit 100", [c.id]),
    db.many("select s.id,s.sold_at,s.total,(select string_agg(qty||'× '||name, ', ') from sale_items where sale_id=s.id) items from sales s where customer_id=$1 order by sold_at desc limit 50", [c.id]),
    db.one("select count(*)::int visits, coalesce(sum(subtotal),0) spend, max(sold_at) last_visit, min(sold_at) first_visit from sales where customer_id=$1", [c.id])
  ]);
  const fav = await db.many("select si.name, sum(si.qty)::int qty from sale_items si join sales s on s.id=si.sale_id where s.customer_id=$1 group by 1 order by 2 desc limit 3", [c.id]);
  res.json({ customer: c, interactions, sales, stats, favourites: fav });
}));

router.post("/customers/:id/interactions", wrap(async (req, res) => {
  const summary = String(req.body.summary || "").trim().slice(0, 2000);
  if (!summary) return bad(res, "Write a short note first.");
  const row = await db.one("insert into interactions(customer_id,kind,summary,created_by) values ($1,$2,$3,$4) returning *", [req.params.id, String(req.body.kind || "note").slice(0, 30), summary, req.user.id]);
  res.json(row);
}));

router.get("/messages", wrap(async (req, res) => {
  const status = req.query.status;
  const rows = status && status !== "all"
    ? await db.many("select * from messages where status=$1 order by created_at desc limit 300", [status])
    : await db.many("select * from messages where status<>'archived' order by (status='new') desc, created_at desc limit 300");
  res.json({ rows });
}));

router.put("/messages/:id", wrap(async (req, res) => {
  const status = req.body.status;
  if (status && !["new", "read", "replied", "archived"].includes(status)) return bad(res, "Unknown status.");
  const row = await db.one(
    "update messages set status=coalesce($2,status), reply=coalesce($3,reply), replied_at=case when $2='replied' and replied_at is null then now() else replied_at end where id=$1 returning *",
    [req.params.id, status || null, req.body.reply == null ? null : String(req.body.reply).slice(0, 5000)]);
  if (!row) return bad(res, "Message not found.", 404);
  if (status === "replied" && row.customer_id) await db.query("insert into interactions(customer_id,kind,summary,created_by) values ($1,'reply',$2,$3)", [row.customer_id, "Replied to website message", req.user.id]);
  res.json(row);
}));

/* ================= Sales (quick till) ================= */
router.get("/sales", wrap(async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 7, 365);
  const rows = await db.many(
    `select s.*, c.name customer, e.name employee, (select string_agg(qty||'× '||name, ', ') from sale_items where sale_id=s.id) items
       from sales s left join customers c on c.id=s.customer_id left join employees e on e.id=s.employee_id
      where s.sold_at > now() - ($1 || ' days')::interval order by s.sold_at desc limit 500`, [String(days)]);
  res.json({ rows });
}));

router.post("/sales", wrap(async (req, res) => {
  const lines = Array.isArray(req.body.items) ? req.body.items : [];
  if (!lines.length) return bad(res, "Add at least one item.");
  const taxRate = Math.min(Math.max(Number(req.body.taxRate ?? 0.05), 0), 0.2);
  const sale = await db.tx(async (c) => {
    let subtotal = 0, cost = 0;
    const rows = [];
    for (const l of lines) {
      const qty = Math.max(1, Math.min(parseInt(l.qty, 10) || 1, 99));
      const it = (await c.query("select mi.id,mi.name,mi.price,mi.cost,mc.label category from menu_items mi join menu_categories mc on mc.id=mi.category_id where mi.id=$1", [l.menu_item_id])).rows[0];
      if (!it) throw Object.assign(new Error("An item in this sale no longer exists."), { status: 400 });
      const price = l.price != null && l.price !== "" ? Number(l.price) : it.price;
      if (price == null || Number.isNaN(price)) throw Object.assign(new Error(`Set a price for "${it.name}" first (Website → Menu).`), { status: 400 });
      subtotal += price * qty; cost += (it.cost || 0) * qty;
      rows.push({ it, qty, price });
    }
    const tax = Math.round(subtotal * taxRate * 100) / 100;
    const s = (await c.query("insert into sales(customer_id,employee_id,payment_method,subtotal,tax,total,cost,notes) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *",
      [req.body.customer_id || null, req.body.employee_id || null, ["card", "cash", "gift card", "other"].includes(req.body.payment_method) ? req.body.payment_method : "card", subtotal.toFixed(2), tax, (subtotal + tax).toFixed(2), cost.toFixed(2), String(req.body.notes || "").slice(0, 500)])).rows[0];
    for (const r of rows) await c.query("insert into sale_items(sale_id,menu_item_id,name,category,qty,unit_price,unit_cost) values ($1,$2,$3,$4,$5,$6,$7)", [s.id, r.it.id, r.it.name, r.it.category, r.qty, r.price, r.it.cost || 0]);
    if (s.customer_id) await c.query("update customers set loyalty_points = loyalty_points + floor($2)::int where id=$1", [s.customer_id, subtotal]);
    return s;
  });
  await audit(req, "create", "sale", sale.id, { total: sale.total });
  res.json(sale);
}));

router.delete("/sales/:id", requireRole("manager"), wrap(async (req, res) => {
  await db.query("delete from sales where id=$1", [req.params.id]);
  await audit(req, "delete", "sale", req.params.id);
  res.json({ ok: true });
}));

/* ================= Inventory & purchasing ================= */
router.post("/inventory/:id/adjust", wrap(async (req, res) => {
  const change = Number(req.body.change);
  if (!change || Number.isNaN(change)) return bad(res, "Enter how much to add (or a negative number to remove).");
  const reason = ["count", "waste", "used", "received", "adjustment"].includes(req.body.reason) ? req.body.reason : "adjustment";
  const row = await db.tx(async (c) => {
    const r = (await c.query("update inventory_items set on_hand = greatest(on_hand + $2, 0) where id=$1 returning *", [req.params.id, change])).rows[0];
    if (!r) throw Object.assign(new Error("Item not found."), { status: 404 });
    await c.query("insert into stock_movements(item_id,change,reason,ref,created_by) values ($1,$2,$3,$4,$5)", [r.id, change, reason, String(req.body.note || "").slice(0, 200), req.user.id]);
    return r;
  });
  res.json(row);
}));

router.get("/inventory/:id/movements", wrap(async (req, res) => {
  res.json({ rows: await db.many("select m.*, u.name by_name from stock_movements m left join users u on u.id=m.created_by where item_id=$1 order by created_at desc limit 100", [req.params.id]) });
}));

router.get("/purchase-orders", wrap(async (_req, res) => {
  const pos = await db.many("select p.*, s.name supplier, s.email supplier_email, coalesce((select sum(qty*unit_cost) from po_lines where po_id=p.id),0) total from purchase_orders p left join suppliers s on s.id=p.supplier_id order by p.created_at desc limit 200");
  const lines = await db.many("select l.*, i.name item, i.unit from po_lines l join inventory_items i on i.id=l.item_id where po_id = any($1)", [pos.map((p) => p.id)]);
  res.json({ rows: pos.map((p) => ({ ...p, lines: lines.filter((l) => l.po_id === p.id) })) });
}));

router.post("/purchase-orders", requireRole("manager"), wrap(async (req, res) => {
  const lines = (req.body.lines || []).filter((l) => l.item_id && Number(l.qty) > 0);
  if (!lines.length) return bad(res, "Add at least one item with a quantity.");
  const po = await db.tx(async (c) => {
    const p = (await c.query("insert into purchase_orders(supplier_id,notes) values ($1,$2) returning *", [req.body.supplier_id || null, String(req.body.notes || "").slice(0, 1000)])).rows[0];
    for (const l of lines) {
      const item = (await c.query("select unit_cost from inventory_items where id=$1", [l.item_id])).rows[0];
      await c.query("insert into po_lines(po_id,item_id,qty,unit_cost) values ($1,$2,$3,$4)", [p.id, l.item_id, Number(l.qty), l.unit_cost != null && l.unit_cost !== "" ? Number(l.unit_cost) : item ? item.unit_cost : 0]);
    }
    return p;
  });
  await audit(req, "create", "purchase_order", po.id);
  res.json(po);
}));

router.post("/purchase-orders/suggest", requireRole("manager"), wrap(async (req, res) => {
  const low = await db.many("select * from inventory_items where on_hand <= reorder_level and id not in (select l.item_id from po_lines l join purchase_orders p on p.id=l.po_id where p.status in ('draft','ordered'))");
  if (!low.length) return res.json({ created: 0 });
  const groups = {};
  low.forEach((i) => { (groups[i.supplier_id || 0] = groups[i.supplier_id || 0] || []).push(i); });
  let created = 0;
  await db.tx(async (c) => {
    for (const [sid, items] of Object.entries(groups)) {
      const p = (await c.query("insert into purchase_orders(supplier_id,notes) values ($1,'Suggested automatically from low stock') returning id", [Number(sid) || null])).rows[0];
      for (const i of items) await c.query("insert into po_lines(po_id,item_id,qty,unit_cost) values ($1,$2,$3,$4)", [p.id, i.id, Math.max(Number(i.reorder_qty) || 0, Number(i.reorder_level) * 2 - Number(i.on_hand), 1), i.unit_cost]);
      created++;
    }
  });
  await audit(req, "create", "purchase_order", null, { suggested: created });
  res.json({ created });
}));

router.post("/purchase-orders/:id/status", requireRole("manager"), wrap(async (req, res) => {
  const status = req.body.status;
  if (!["ordered", "received", "cancelled", "draft"].includes(status)) return bad(res, "Unknown status.");
  const po = await db.tx(async (c) => {
    const p = (await c.query("select * from purchase_orders where id=$1 for update", [req.params.id])).rows[0];
    if (!p) throw Object.assign(new Error("Purchase order not found."), { status: 404 });
    if (p.status === "received") throw Object.assign(new Error("This order was already received."), { status: 400 });
    if (status === "received") {
      const lines = (await c.query("select * from po_lines where po_id=$1", [p.id])).rows;
      for (const l of lines) {
        await c.query("update inventory_items set on_hand = on_hand + $2, unit_cost = $3 where id=$1", [l.item_id, l.qty, l.unit_cost]);
        await c.query("insert into stock_movements(item_id,change,reason,ref,created_by) values ($1,$2,'received',$3,$4)", [l.item_id, l.qty, "PO #" + p.id, req.user.id]);
      }
      const total = lines.reduce((a, l) => a + l.qty * l.unit_cost, 0);
      const sup = p.supplier_id ? (await c.query("select name from suppliers where id=$1", [p.supplier_id])).rows[0] : null;
      if (total > 0) await c.query("insert into expenses(category,vendor,amount,notes) values ('Inventory',$1,$2,$3)", [sup ? sup.name : "", total.toFixed(2), "PO #" + p.id]);
    }
    return (await c.query("update purchase_orders set status=$2, ordered_at=case when $2='ordered' then now() else ordered_at end, received_at=case when $2='received' then now() else received_at end where id=$1 returning *", [p.id, status])).rows[0];
  });
  await audit(req, "status", "purchase_order", po.id, { status });
  res.json(po);
}));

router.delete("/purchase-orders/:id", requireRole("manager"), wrap(async (req, res) => {
  await db.query("delete from purchase_orders where id=$1 and status in ('draft','cancelled')", [req.params.id]);
  res.json({ ok: true });
}));

/* ================= Analytics & AI ================= */
router.get("/dashboard", wrap(async (req, res) => {
  const d = await analytics.dashboard({ days: req.query.days });
  res.json({ ...d, insights: analytics.ruleInsights(d), aiEnabled: ai.enabled() });
}));

router.post("/ai/:task", auth.rateLimit({ windowMs: 60e3, max: 12 }), wrap(async (req, res) => {
  const task = req.params.task;
  if (!ai.tasks[task]) return bad(res, "Unknown AI tool.", 404);
  const body = { ...req.body };
  if (task === "briefing" || task === "question") {
    if (task === "question" && !String(body.question || "").trim()) return bad(res, "Type a question first.");
    body.dashboard = await analytics.dashboard({ days: body.days || 30 });
  }
  if (task === "reviewHelp" && body.employee_id) {
    const d = await analytics.dashboard({ days: 90 });
    const s = d.staff.find((x) => x.id === Number(body.employee_id));
    if (s) { body.employee = `${s.name} (${s.role})`; body.notes = `${body.notes || ""}\nLast 90 days: ${s.hours} hours worked, ${s.orders} orders, $${s.revenue} sales, $${s.revenuePerHour}/hour, last rating ${s.last_rating ?? "none"}.`; }
  }
  for (const k of Object.keys(body)) if (typeof body[k] === "string") body[k] = body[k].slice(0, 4000);
  try {
    const text = await ai.tasks[task](body);
    await audit(req, "ai", task, null);
    res.json({ text });
  } catch (e) {
    if (e instanceof ai.AIError) return bad(res, e.message, 503);
    throw e;
  }
}));

/* ================= Exports ================= */
const EXPORTS = {
  customers: "select id,name,email,phone,birthday,array_to_string(tags,'; ') tags,source,marketing_consent,loyalty_points,notes,created_at from customers order by id",
  sales: "select s.id,s.sold_at,c.name customer,e.name employee,s.payment_method,s.subtotal,s.tax,s.total,s.cost,(select string_agg(qty||'x '||name,'; ') from sale_items where sale_id=s.id) items from sales s left join customers c on c.id=s.customer_id left join employees e on e.id=s.employee_id order by s.sold_at desc",
  inventory: "select i.name,i.category,i.unit,i.on_hand,i.reorder_level,i.reorder_qty,i.unit_cost,s.name supplier from inventory_items i left join suppliers s on s.id=i.supplier_id order by i.name",
  expenses: "select spent_on,category,vendor,amount,notes from expenses order by spent_on desc",
  messages: "select created_at,name,email,status,message,reply from messages order by created_at desc",
  newsletter: "select email,name,created_at from newsletter where not unsubscribed order by created_at",
  menu: "select c.label category,i.name,i.description,i.price,i.cost,i.visible from menu_items i join menu_categories c on c.id=i.category_id order by c.sort,i.sort",
  shifts: "select e.name employee,sh.starts_at,sh.ends_at,round((extract(epoch from (sh.ends_at-sh.starts_at))/3600)::numeric,2) hours,e.hourly_rate from shifts sh join employees e on e.id=sh.employee_id order by sh.starts_at desc"
};
router.get("/export/:name", requireRole("manager"), wrap(async (req, res) => {
  const sql = EXPORTS[req.params.name.replace(/\.csv$/, "")];
  if (!sql) return bad(res, "Unknown export.", 404);
  const rows = await db.many(sql);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const cell = (v) => {
    if (v == null) return "";
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  await audit(req, "export", req.params.name);
  res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="granvilles-${req.params.name.replace(/\.csv$/, "")}-${new Date().toISOString().slice(0, 10)}.csv"`).send("﻿" + csv);
}));

/* ================= Users, audit, demo data ================= */
router.get("/users", requireRole("owner"), wrap(async (_req, res) => {
  res.json({ rows: await db.many("select id,email,name,role,active,created_at,last_login_at from users order by id") });
}));
router.post("/users", requireRole("owner"), wrap(async (req, res) => {
  const { name, email, role, password } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || "")) return bad(res, "Enter a name and valid email.");
  if (!["owner", "manager", "staff"].includes(role)) return bad(res, "Pick a role.");
  const problem = auth.passwordProblem(password); if (problem) return bad(res, problem);
  try {
    const u = await db.one("insert into users(email,name,password_hash,role) values ($1,$2,$3,$4) returning id,email,name,role,active", [email.toLowerCase().trim(), name.trim(), auth.hashPassword(password), role]);
    await audit(req, "create", "user", u.id, { role });
    res.json(u);
  } catch (e) { if (e.code === "23505") return bad(res, "Someone already uses that email."); throw e; }
}));
router.put("/users/:id", requireRole("owner"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { role, active, password, name } = req.body;
  if (id === req.user.id && (role && role !== "owner" || active === false)) return bad(res, "You can't remove your own owner access.");
  if (role && !["owner", "manager", "staff"].includes(role)) return bad(res, "Pick a role.");
  if (password) { const p = auth.passwordProblem(password); if (p) return bad(res, p); }
  const u = await db.one("update users set role=coalesce($2,role), active=coalesce($3,active), name=coalesce($4,name), password_hash=coalesce($5,password_hash) where id=$1 returning id,email,name,role,active", [id, role || null, typeof active === "boolean" ? active : null, name || null, password ? auth.hashPassword(password) : null]);
  if (!u) return bad(res, "User not found.", 404);
  if (active === false || password) await db.query("delete from sessions where user_id=$1", [id]);
  await audit(req, "update", "user", id, { role, active, password: !!password });
  res.json(u);
}));

router.get("/audit", requireRole("manager"), wrap(async (_req, res) => {
  res.json({ rows: await db.many("select a.*, u.name user_name from audit_log a left join users u on u.id=a.user_id order by a.created_at desc limit 300") });
}));

router.get("/demo", wrap(async (_req, res) => {
  const r = await db.one("select value from site_settings where key='demoData'");
  res.json({ loaded: !!(r && r.value === true) });
}));
router.post("/demo/:action", requireRole("owner"), wrap(async (req, res) => {
  if (req.params.action === "load") await seed.seedDemo();
  else if (req.params.action === "remove") await seed.removeDemo();
  else return bad(res, "Unknown action.", 404);
  invalidate();
  await audit(req, "demo", req.params.action);
  res.json({ ok: true });
}));

module.exports = router;
