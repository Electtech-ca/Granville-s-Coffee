// Seeds website content from the public site's own defaults, plus optional demo business data.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const db = require("./db");

const ROOT = path.join(__dirname, "..");

function loadDefaults() {
  const code = fs.readFileSync(path.join(ROOT, "assets/js/content.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { timeout: 1000 });
  return sandbox.window.GRANVILLES_DEFAULTS;
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Reads every data-content="key" element from index.html so the admin starts with the live text.
function loadPageText() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const re = /<(\w+)([^>]*?)data-content="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const rich = /data-rich/.test(m[2] + m[4]);
    let v = m[5].trim().replace(/\s+/g, " ");
    v = rich ? v.replace(/<(?!\/?(br|em|strong)\b)[^>]*>/g, "") : v.replace(/<[^>]*>/g, "");
    out.push({ key: m[3], value: decode(v), rich });
  }
  return out;
}

const LABELS = {
  "hero.eyebrow": "Welcome banner · small line above the headline",
  "hero.title": "Welcome banner · headline",
  "hero.lead": "Welcome banner · intro paragraph",
  "town.title": "Community table · headline",
  "town.intro": "Community table · intro",
  "people.title": "Our people · headline",
  "people.intro": "Our people · intro",
  "menu.title": "Menu · headline",
  "menu.intro": "Menu · intro",
  "menu.note": "Menu · small print under the menu",
  "ted.title": "Meet Ted · headline",
  "ted.p1": "Meet Ted · paragraph 1",
  "ted.p2": "Meet Ted · paragraph 2",
  "ted.p3": "Meet Ted · paragraph 3",
  "inside.title": "Photos · headline",
  "inside.intro": "Photos · intro",
  "visit.title": "Visit · headline",
  "visit.intro": "Visit · intro",
  "visit.hoursNote": "Visit · note under the hours"
};

const DEFAULT_GALLERY = [
  { src: "assets/img/ceiling-one.webp", title: "Look up.", caption: "The ceiling is upholstered in coffee sacks. Colombia says hello.", alt: "Ceiling lined with burlap coffee sacks stamped 'Product of Colombia'" },
  { src: "assets/img/ceiling-two.webp", title: "Keep looking.", caption: "A fan, a hundred sacks, and walls that collect stories.", alt: "Coffee-sack ceiling with a vintage ceiling fan" },
  { src: "assets/img/clock.webp", title: "The clock.", caption: "The real one. It keeps better time than the conversations do.", alt: "The green Granville's Coffee wall clock" },
  { src: "assets/img/pager.webp", title: "When flashing, wave us down.", caption: "Your food is ready. Your conversation can continue.", alt: "An orange table pager labelled 'When flashing, wave us down'" }
];

const DEFAULT_KPIS = [
  ["daily_revenue", "Average daily revenue", 1400, "up", "$"],
  ["avg_ticket", "Average ticket", 14.5, "up", "$"],
  ["gross_margin", "Gross margin", 68, "up", "%"],
  ["labour_pct", "Labour cost (% of revenue)", 30, "down", "%"],
  ["repeat_rate", "Repeat customer rate", 45, "up", "%"],
  ["new_customers", "New customers (per period)", 40, "up", "#"],
  ["reply_hours", "Average message reply time", 24, "down", "h"]
];

async function seedContent() {
  const D = loadDefaults();
  const have = await db.one("select count(*)::int n from menu_categories");
  if (have.n === 0) {
    for (const [ci, c] of D.menu.entries()) {
      const cat = await db.one("insert into menu_categories(slug,label,title,emoji,sort) values ($1,$2,$3,$4,$5) returning id", [c.slug, c.label, c.title, c.emoji, ci]);
      for (const [ii, it] of c.items.entries()) {
        await db.query("insert into menu_items(category_id,name,description,sort) values ($1,$2,$3,$4)", [cat.id, it.name, it.description || "", ii]);
      }
    }
  }
  for (const t of loadPageText()) {
    await db.query("insert into site_text(key,label,value) values ($1,$2,$3) on conflict (key) do nothing", [t.key, LABELS[t.key] || t.key, t.value]);
  }
  const settings = {
    settings: Object.assign({ showPrices: false }, D.settings),
    hours: D.hours || [],
    lists: D.lists,
    stories: D.stories,
    characters: D.characters,
    quest: D.quest,
    fitness: D.fitness,
    tedPhoto: ""
  };
  for (const [k, v] of Object.entries(settings)) {
    await db.query("insert into site_settings(key,value) values ($1,$2) on conflict (key) do nothing", [k, JSON.stringify(v)]);
  }
  const g = await db.one("select count(*)::int n from gallery");
  if (g.n === 0) for (const [i, p] of DEFAULT_GALLERY.entries()) await db.query("insert into gallery(src,title,caption,alt,sort) values ($1,$2,$3,$4,$5)", [p.src, p.title, p.caption, p.alt, i]);
  for (const k of DEFAULT_KPIS) await db.query("insert into kpi_targets(metric,label,target,direction,unit) values ($1,$2,$3,$4,$5) on conflict do nothing", k);
}

// ---------- Demo business data (clearly marked, removable from the admin) ----------
const DEMO_PRICES = { sandwiches: [13.5, 4.6], comfort: [14.5, 4.8], breakfast: [12.5, 3.9], sweets: [5.75, 1.6], drinks: [4.75, 1.05] };
const FIRST = ["Mabel", "Doug", "Alex", "Gary", "Margaret", "Bill", "Dave", "Priya", "Jordan", "Sam", "Lena", "Owen", "Rosa", "Tom", "Aiyana", "Kenji", "Claire", "Marcus", "Nora", "Ravi"];
const LAST = ["Abbott", "Bennett", "Chu", "Dhillon", "Eriksen", "Fraser", "Gill", "Hughes", "Ito", "Jensen", "Klassen", "Lam", "McLeod", "Nash", "Olsen", "Paquette"];

const TZ = process.env.BUSINESS_TZ || "America/Vancouver";
const pad = (n) => String(n).padStart(2, "0");
// Local café wall-clock time as text; Postgres converts it with "at time zone".
const localTs = (date, h, m = 0, s = 0) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(h)}:${pad(m)}:${pad(s)}`;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

async function seedDemo({ days = 120 } = {}) {
  const already = await db.one("select value from site_settings where key='demoData'");
  if (already && already.value === true) return { skipped: true };
  const r = rng(1992);
  const pick = (a) => a[Math.floor(r() * a.length)];
  await db.tx(async (c) => {
    // demo prices & costs (public site still hides prices until "Show prices" is switched on)
    const cats = (await c.query("select id,slug from menu_categories")).rows;
    for (const cat of cats) {
      const [p, cost] = DEMO_PRICES[cat.slug] || [8, 2.5];
      await c.query("update menu_items set price=round(($1 + (random()*3 - 1.5))::numeric,2), cost=round(($2 + random()*0.6)::numeric,2) where category_id=$3 and price is null", [p, cost, cat.id]);
    }
    const items = (await c.query("select mi.id,mi.name,mi.price,mi.cost,mc.label category,mc.slug from menu_items mi join menu_categories mc on mc.id=mi.category_id")).rows;

    const emp = [];
    for (const [name, role, rate] of [["Ted Martindale", "Owner", 0], ["Kim (Demo)", "Shift lead", 21.5], ["Jesse (Demo)", "Barista", 17.85], ["Morgan (Demo)", "Cook", 19.25], ["Riley (Demo)", "Barista", 17.85]]) {
      emp.push((await c.query("insert into employees(name,role,hourly_rate,hired_on) values ($1,$2,$3,current_date - 400) returning id", [name, role, rate])).rows[0].id);
    }
    const customers = [];
    for (let i = 0; i < 140; i++) {
      const name = pick(FIRST) + " " + pick(LAST);
      const email = name.toLowerCase().replace(/[^a-z]+/g, ".") + i + "@example.com";
      const created = Math.floor(r() * days);
      const res = await c.query("insert into customers(name,email,tags,source,marketing_consent,notes,created_at) values ($1,$2,$3,$4,$5,$6, now() - ($7 || ' days')::interval) returning id", [name, email, ["demo", pick(["regular", "newcomer", "lunch crowd", "coffee only", "family"])], pick(["walk-in", "walk-in", "website", "referral", "event"]), r() > 0.4, "Demo customer", String(created)]);
      // About one in six regulars quietly stops coming, so the win-back list has someone on it.
      customers.push({ id: res.rows[0].id, created, stop: r() < 0.16 ? 25 + Math.floor(r() * 50) : 0 });
    }
    const sup = [];
    for (const [n, e, d] of [["Cariboo Coffee Roasters (Demo)", "orders@example.com", 4], ["Quesnel Fresh Produce (Demo)", "fresh@example.com", 1], ["Northern Dairy Co. (Demo)", "dairy@example.com", 2], ["Bakery Supply BC (Demo)", "bakery@example.com", 5]]) {
      sup.push((await c.query("insert into suppliers(name,email,lead_days) values ($1,$2,$3) returning id", [n, e, d])).rows[0].id);
    }
    const inv = [["Espresso beans", "kg", 18, 8, 20, 24.5, 0], ["Whole milk", "L", 40, 25, 60, 1.45, 2], ["Oat milk", "L", 9, 10, 24, 3.2, 2], ["Rye bread", "loaf", 12, 10, 30, 4.1, 3], ["Smoked meat", "kg", 6, 5, 12, 21, 1], ["Cheddar & havarti", "kg", 7, 4, 10, 13.5, 2], ["Eggs", "dozen", 14, 12, 30, 4.6, 1], ["Potatoes (fries)", "kg", 30, 20, 50, 1.6, 1], ["Cream cheese", "kg", 5, 3, 8, 9.8, 2], ["Takeaway cups", "sleeve", 22, 15, 40, 6.5, 3], ["Chai concentrate", "L", 3, 4, 10, 8.2, 0], ["Chocolate syrup", "L", 4, 2, 6, 7.4, 3]];
    for (const [n, u, oh, rl, rq, uc, s] of inv) await c.query("insert into inventory_items(name,unit,on_hand,reorder_level,reorder_qty,unit_cost,supplier_id,category) values ($1,$2,$3,$4,$5,$6,$7,$8)", [n, u, oh, rl, rq, uc, sup[s], u === "sleeve" ? "Packaging" : "Ingredients"]);

    // sales & shifts per day
    const weights = { sandwiches: 1.2, comfort: 0.8, breakfast: 0.9, sweets: 1.1, drinks: 2.6 };
    for (let d = days; d >= 1; d--) { // stop at yesterday so no sample sale is in the future
      const date = new Date(); date.setDate(date.getDate() - d); date.setHours(0, 0, 0, 0);
      const dow = date.getDay();
      if (dow === 0 && r() < 0.7) continue; // mostly closed Sundays
      const growth = 1 + (days - d) / days * 0.12;
      const base = (dow === 6 ? 95 : dow === 5 ? 88 : 75) * growth * (0.85 + r() * 0.3);
      const n = Math.round(base);
      for (let s = 0; s < n; s++) {
        const hour = r() < 0.55 ? 7 + Math.floor(r() * 4) : r() < 0.8 ? 11 + Math.floor(r() * 3) : 14 + Math.floor(r() * 3);
        const when = localTs(date, hour, Math.floor(r() * 60), Math.floor(r() * 60));
        const lines = [];
        const count = 1 + (r() < 0.45 ? 1 : 0) + (r() < 0.15 ? 1 : 0);
        for (let k = 0; k < count; k++) {
          let it;
          do { it = pick(items); } while (r() > (weights[it.slug] || 1) / 2.6);
          lines.push({ it, qty: r() < 0.12 ? 2 : 1 });
        }
        const subtotal = lines.reduce((a, l) => a + l.it.price * l.qty, 0);
        const cost = lines.reduce((a, l) => a + l.it.cost * l.qty, 0);
        const tax = Math.round(subtotal * 0.05 * 100) / 100;
        const eligible = customers.filter((cu) => cu.created >= d && d >= cu.stop);
        const cust = r() < 0.38 && eligible.length ? pick(eligible).id : null;
        const sale = await c.query("insert into sales(sold_at,customer_id,employee_id,payment_method,subtotal,tax,total,cost) values ($1::timestamp at time zone '"+TZ+"',$2,$3,$4,$5,$6,$7,$8) returning id", [when, cust, pick(emp.slice(1)), r() < 0.78 ? "card" : "cash", subtotal.toFixed(2), tax, (subtotal + tax).toFixed(2), cost.toFixed(2)]);
        for (const l of lines) await c.query("insert into sale_items(sale_id,menu_item_id,name,category,qty,unit_price,unit_cost) values ($1,$2,$3,$4,$5,$6,$7)", [sale.rows[0].id, l.it.id, l.it.name, l.it.category, l.qty, l.it.price, l.it.cost]);
      }
      for (const [e, start, len] of [[emp[1], 6, 8], [emp[2], 7, 7], [emp[3], 9, 6], [emp[4], 11, 5]]) {
        if (r() < 0.12) continue;
        await c.query("insert into shifts(employee_id,starts_at,ends_at) values ($1,$2::timestamp at time zone '" + TZ + "',$2::timestamp at time zone '" + TZ + "' + ($3 || ' hours')::interval)", [e, localTs(date, start, 30), String(len)]);
      }
      if (d % 7 === 0) {
        await c.query("insert into expenses(spent_on,category,vendor,amount,notes) values ($1,'Rent','Landlord (Demo)',$2,'Demo'),($1,'Utilities','BC Hydro (Demo)',$3,'Demo')", [date, (3200 / 4.3).toFixed(2), (150 + r() * 60).toFixed(2)]);
      }
      for (let v = 0; v < 30 + r() * 50; v++) {
        const when = localTs(date, 6 + Math.floor(r() * 17), Math.floor(r() * 60));
        await c.query("insert into page_views(path,referrer,created_at) values ($1,$2,$3::timestamp at time zone '" + TZ + "')", [pick(["/", "/", "/#menu-theatre", "/#visit", "/#games", "/#ted"]), pick(["", "", "https://www.google.com/", "https://www.facebook.com/", "https://maps.google.com/"]), when]);
      }
    }
    await c.query("update customers cu set loyalty_points = coalesce((select floor(sum(total))::int from sales where customer_id=cu.id),0)");
    const msgs = [["Priya Dhillon (Demo)", "priya@example.com", "Do you cater small office lunches? We'd need about 12 sandwiches on Friday."], ["Tom Hughes (Demo)", "tom@example.com", "Loved the carrot cake story. Are you open on the long weekend?"], ["Lena Olsen (Demo)", "lena@example.com", "Is there gluten-free bread for the Reuben?"]];
    for (const [n, e, m] of msgs) await c.query("insert into messages(name,email,message) values ($1,$2,$3)", [n, e, m]);
    await c.query("insert into site_settings(key,value) values ('demoData','true') on conflict (key) do update set value='true'");
  });
  return { ok: true };
}

async function removeDemo() {
  await db.tx(async (c) => {
    await c.query("delete from sales");
    await c.query("delete from shifts");
    await c.query("delete from page_views");
    await c.query("delete from expenses where notes='Demo'");
    await c.query("delete from messages where name like '%(Demo)'");
    await c.query("delete from customers where 'demo' = any(tags)");
    await c.query("delete from employees where name like '%(Demo)'");
    await c.query("delete from inventory_items where supplier_id in (select id from suppliers where name like '%(Demo)')");
    await c.query("delete from suppliers where name like '%(Demo)'");
    await c.query("update menu_items set price=null, cost=null");
    await c.query("delete from site_settings where key='demoData'");
  });
}

module.exports = { seedContent, seedDemo, removeDemo, loadDefaults };

if (require.main === module) {
  (async () => {
    await db.migrate();
    await seedContent();
    if (process.argv.includes("--demo")) console.log("[seed] demo:", await seedDemo());
    console.log("[seed] done");
    await db.pool.end();
  })().catch((e) => { console.error(e); process.exit(1); });
}
