// Business analytics, menu engineering, customer segments, staff performance and KPI scoring.
const db = require("./db");

const TZ = process.env.BUSINESS_TZ || "America/Vancouver";
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (a, b) => (b ? r2((a / b) * 100) : 0);

function range(days, endISO) {
  const end = endISO ? new Date(endISO) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - days * 86400e3 + 1);
  const prevStart = new Date(start.getTime() - days * 86400e3);
  return { start, end, prevStart, days };
}

async function totals(from, to) {
  const s = await db.one("select coalesce(sum(subtotal),0) revenue, count(*)::int orders, coalesce(sum(cost),0) cogs, count(distinct customer_id)::int customers from sales where sold_at between $1 and $2", [from, to]);
  const lab = await db.one("select coalesce(sum(extract(epoch from (least(sh.ends_at,$2) - greatest(sh.starts_at,$1)))/3600 * e.hourly_rate),0) labour, coalesce(sum(extract(epoch from (sh.ends_at - sh.starts_at))/3600),0) hours from shifts sh join employees e on e.id=sh.employee_id where sh.starts_at < $2 and sh.ends_at > $1", [from, to]);
  const ex = await db.one("select coalesce(sum(amount),0) expenses from expenses where spent_on between $1::date and $2::date", [from, to]);
  const revenue = s.revenue, gross = revenue - s.cogs;
  return {
    revenue: r2(revenue), orders: s.orders, avgTicket: s.orders ? r2(revenue / s.orders) : 0,
    cogs: r2(s.cogs), grossProfit: r2(gross), grossMargin: pct(gross, revenue),
    labour: r2(lab.labour), labourHours: r2(lab.hours), labourPct: pct(lab.labour, revenue),
    expenses: r2(ex.expenses), netProfit: r2(gross - lab.labour - ex.expenses),
    salesPerLabourHour: lab.hours ? r2(revenue / lab.hours) : 0,
    payingCustomers: s.customers
  };
}

function change(cur, prev) {
  const out = {};
  for (const k of Object.keys(cur)) out[k] = prev[k] ? r2(((cur[k] - prev[k]) / Math.abs(prev[k])) * 100) : null;
  return out;
}

async function dashboard({ days = 30, end } = {}) {
  days = Math.min(Math.max(parseInt(days, 10) || 30, 1), 730);
  const R = range(days, end);
  const [cur, prev] = await Promise.all([totals(R.start, R.end), totals(R.prevStart, R.start)]);

  const daily = await db.many(
    `select to_char(d::date,'YYYY-MM-DD') as day, coalesce(sum(s.subtotal),0) revenue, count(s.id)::int orders
       from generate_series(($1::timestamptz at time zone $3)::date, ($2::timestamptz at time zone $3)::date, interval '1 day') d
       left join sales s on (s.sold_at at time zone $3)::date = d::date
      group by d order by d`, [R.start, R.end, TZ]);
  const byHour = await db.many("select extract(hour from sold_at at time zone $3)::int as hour, coalesce(sum(subtotal),0) revenue, count(*)::int orders from sales where sold_at between $1 and $2 group by 1 order by 1", [R.start, R.end, TZ]);
  const byWeekday = await db.many("select extract(dow from sold_at at time zone $3)::int as dow, coalesce(sum(subtotal),0) revenue, count(*)::int orders, count(distinct (sold_at at time zone $3)::date)::int as days from sales where sold_at between $1 and $2 group by 1 order by 1", [R.start, R.end, TZ]);
  const categories = await db.many("select coalesce(si.category,'Other') category, sum(si.qty)::int qty, sum(si.qty*si.unit_price) revenue, sum(si.qty*(si.unit_price-si.unit_cost)) profit from sale_items si join sales s on s.id=si.sale_id where s.sold_at between $1 and $2 group by 1 order by revenue desc", [R.start, R.end]);
  const payments = await db.many("select payment_method as method, count(*)::int orders, sum(subtotal) revenue from sales where sold_at between $1 and $2 group by 1 order by 2 desc", [R.start, R.end]);

  // Menu engineering (Kasavana & Smith): popularity vs contribution margin.
  const items = await db.many("select si.name, coalesce(si.category,'Other') category, sum(si.qty)::int qty, sum(si.qty*si.unit_price) revenue, avg(si.unit_price-si.unit_cost) margin from sale_items si join sales s on s.id=si.sale_id where s.sold_at between $1 and $2 group by 1,2 order by qty desc", [R.start, R.end]);
  const totalQty = items.reduce((a, i) => a + i.qty, 0);
  const avgMargin = totalQty ? items.reduce((a, i) => a + i.margin * i.qty, 0) / totalQty : 0;
  const popThreshold = items.length ? (totalQty / items.length) * 0.7 : 0;
  const menuEngineering = items.map((i) => {
    const popular = i.qty >= popThreshold, profitable = i.margin >= avgMargin;
    const cls = popular && profitable ? "Star" : popular ? "Plowhorse" : profitable ? "Puzzle" : "Dog";
    const advice = { Star: "Keep it prominent and consistent.", Plowhorse: "Popular but low margin: review portion cost or nudge the price.", Puzzle: "Profitable but overlooked: feature it, rename it, or suggest it at the counter.", Dog: "Low on both: rework the recipe or consider removing it." }[cls];
    return { name: i.name, category: i.category, qty: i.qty, revenue: r2(i.revenue), margin: r2(i.margin), class: cls, advice };
  });

  // Customers & segments (RFM-style)
  const newCustomers = (await db.one("select count(*)::int n from customers where created_at between $1 and $2", [R.start, R.end])).n;
  const visits = await db.many("select customer_id, count(*)::int visits from sales where customer_id is not null and sold_at between $1 and $2 group by 1", [R.start, R.end]);
  const repeatRate = pct(visits.filter((v) => v.visits >= 2).length, visits.length);
  const segRows = await db.many(
    `select c.id, c.name, c.email, count(s.id)::int visits, coalesce(sum(s.subtotal),0) spend, max(s.sold_at) last_visit, c.created_at
       from customers c left join sales s on s.customer_id=c.id group by c.id`);
  const now = Date.now();
  const segments = { Champions: [], Loyal: [], "New": [], "At risk": [], Lost: [], Prospects: [] };
  for (const c of segRows) {
    const since = c.last_visit ? (now - new Date(c.last_visit).getTime()) / 86400e3 : null;
    let seg;
    if (!c.visits) seg = "Prospects";
    else if (since <= 14 && c.visits >= 8) seg = "Champions";
    else if (since <= 30 && c.visits >= 3) seg = "Loyal";
    else if (since <= 30) seg = "New";
    else if (since <= 75 && c.visits >= 3) seg = "At risk";
    else seg = "Lost";
    segments[seg].push({ id: c.id, name: c.name, email: c.email, visits: c.visits, spend: r2(c.spend), lastVisit: c.last_visit });
  }
  const segmentSummary = Object.entries(segments).map(([name, list]) => ({ name, count: list.length, spend: r2(list.reduce((a, c) => a + c.spend, 0)) }));
  const topCustomers = segRows.filter((c) => c.visits).sort((a, b) => b.spend - a.spend).slice(0, 10).map((c) => ({ id: c.id, name: c.name, visits: c.visits, spend: r2(c.spend), lastVisit: c.last_visit }));
  const atRisk = segments["At risk"].sort((a, b) => b.spend - a.spend).slice(0, 10);

  // Operations
  const lowStock = await db.many("select i.id,i.name,i.unit,i.on_hand,i.reorder_level,i.reorder_qty,s.name supplier from inventory_items i left join suppliers s on s.id=i.supplier_id where i.on_hand <= i.reorder_level order by (i.on_hand / nullif(i.reorder_level,0)) nulls first");
  const inventoryValue = (await db.one("select coalesce(sum(on_hand*unit_cost),0) v from inventory_items")).v;
  const unread = (await db.one("select count(*)::int n from messages where status='new'")).n;
  const replyHours = (await db.one("select avg(extract(epoch from (replied_at-created_at))/3600) h from messages where replied_at is not null and created_at between $1 and $2", [R.start, R.end])).h;

  // Website
  const views = await db.many("select to_char((created_at at time zone $3)::date,'YYYY-MM-DD') as day, count(*)::int views from page_views where created_at between $1 and $2 group by 1 order by 1", [R.start, R.end, TZ]);
  const referrers = await db.many("select coalesce(nullif(substring(referrer from '^https?://([^/]+)'),''),'Direct') source, count(*)::int views from page_views where created_at between $1 and $2 group by 1 order by 2 desc limit 6", [R.start, R.end]);
  const totalViews = views.reduce((a, v) => a + v.views, 0);

  // Staff performance
  const staff = await db.many(
    `select e.id, e.name, e.role, e.hourly_rate,
        coalesce((select sum(extract(epoch from (ends_at-starts_at))/3600) from shifts where employee_id=e.id and starts_at between $1 and $2),0) hours,
        coalesce((select count(*) from sales where employee_id=e.id and sold_at between $1 and $2),0)::int orders,
        coalesce((select sum(subtotal) from sales where employee_id=e.id and sold_at between $1 and $2),0) revenue,
        (select rating from reviews where employee_id=e.id order by reviewed_on desc limit 1) last_rating
       from employees e where e.active order by e.name`, [R.start, R.end]);
  const staffPerf = staff.map((s) => ({ ...s, hours: r2(s.hours), revenue: r2(s.revenue), revenuePerHour: s.hours ? r2(s.revenue / s.hours) : 0, avgTicket: s.orders ? r2(s.revenue / s.orders) : 0 }));

  // Forecast next 7 days: same-weekday average of the last 6 weeks, scaled by recent trend.
  const hist = await db.many("select (sold_at at time zone $1)::date d, sum(subtotal) revenue from sales where sold_at > now() - interval '42 days' group by 1", [TZ]);
  const byDow = {};
  hist.forEach((h) => { const dw = new Date(h.d).getUTCDay(); (byDow[dw] = byDow[dw] || []).push(h.revenue); });
  const last14 = hist.filter((h) => new Date(h.d) > new Date(Date.now() - 14 * 86400e3)).reduce((a, h) => a + h.revenue, 0) / 14;
  const prior28 = hist.filter((h) => new Date(h.d) <= new Date(Date.now() - 14 * 86400e3)).reduce((a, h) => a + h.revenue, 0) / 28;
  const trend = prior28 ? Math.min(Math.max(last14 / prior28, 0.8), 1.2) : 1;
  const forecast = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.now() + i * 86400e3);
    const arr = byDow[d.getDay()] || [];
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    forecast.push({ day: d.toISOString().slice(0, 10), revenue: r2(avg * trend) });
  }

  // KPI scorecard
  const actual = {
    daily_revenue: r2(cur.revenue / days), avg_ticket: cur.avgTicket, gross_margin: cur.grossMargin,
    labour_pct: cur.labourPct, repeat_rate: repeatRate, new_customers: newCustomers, reply_hours: replyHours == null ? null : r2(replyHours)
  };
  const targets = await db.many("select * from kpi_targets order by metric");
  const kpis = targets.map((t) => {
    const a = actual[t.metric];
    let status = "no-data", score = null;
    if (a != null && t.target) {
      score = t.direction === "up" ? a / t.target : t.target / Math.max(a, 0.0001);
      status = score >= 1 ? "on-track" : score >= 0.9 ? "close" : "behind";
    }
    return { ...t, actual: a, score: score == null ? null : r2(score * 100), status };
  });
  const scored = kpis.filter((k) => k.score != null);
  const performanceScore = scored.length ? Math.round(scored.reduce((a, k) => a + Math.min(k.score, 120), 0) / scored.length) : null;

  return {
    period: { days, start: R.start, end: R.end },
    totals: cur, previous: prev, change: change(cur, prev),
    daily: daily.map((d) => ({ ...d, revenue: r2(d.revenue) })),
    byHour, byWeekday: byWeekday.map((w) => ({ ...w, avgRevenue: w.days ? r2(w.revenue / w.days) : 0 })),
    categories, payments, menuEngineering,
    customers: { newCustomers, repeatRate, active: visits.length, segments: segmentSummary, topCustomers, atRisk },
    operations: { lowStock, inventoryValue: r2(inventoryValue), unread, replyHours: replyHours == null ? null : r2(replyHours) },
    web: { totalViews, views, referrers, conversion: totalViews ? pct(newCustomers, totalViews) : 0 },
    staff: staffPerf, forecast, kpis, performanceScore
  };
}

// Plain-language insights used when no AI key is configured, and as facts for the AI.
function ruleInsights(d) {
  const out = [];
  const ch = d.change, t = d.totals;
  if (ch.revenue != null) out.push(`Revenue is ${ch.revenue >= 0 ? "up" : "down"} ${Math.abs(ch.revenue)}% versus the previous ${d.period.days} days ($${t.revenue.toLocaleString()}).`);
  if (ch.avgTicket != null && Math.abs(ch.avgTicket) >= 3) out.push(`Average ticket moved ${ch.avgTicket > 0 ? "up" : "down"} ${Math.abs(ch.avgTicket)}% to $${t.avgTicket}.`);
  if (t.labourPct > 32) out.push(`Labour is ${t.labourPct}% of revenue, above the usual 25–32% café range. Check quiet-hour staffing.`);
  const peak = [...d.byHour].sort((a, b) => b.revenue - a.revenue)[0];
  const quiet = [...d.byHour].filter((h) => h.orders > 0).sort((a, b) => a.revenue - b.revenue)[0];
  if (peak) out.push(`Busiest hour is ${peak.hour}:00${quiet ? `; quietest trading hour is ${quiet.hour}:00, a good slot for a promo or prep` : ""}.`);
  const puzzles = d.menuEngineering.filter((m) => m.class === "Puzzle").slice(0, 2).map((m) => m.name);
  if (puzzles.length) out.push(`High-margin items people overlook: ${puzzles.join(", ")}. Feature them on the specials board.`);
  const plow = d.menuEngineering.filter((m) => m.class === "Plowhorse").slice(0, 2).map((m) => m.name);
  if (plow.length) out.push(`Popular but thin-margin: ${plow.join(", ")}. Review portion cost or price.`);
  if (d.customers.atRisk.length) out.push(`${d.customers.atRisk.length} regulars haven't visited in over a month (e.g. ${d.customers.atRisk.slice(0, 2).map((c) => c.name).join(", ")}). A personal "we miss you" note works well.`);
  if (d.operations.lowStock.length) out.push(`${d.operations.lowStock.length} stock items are at or below reorder level: ${d.operations.lowStock.slice(0, 3).map((i) => i.name).join(", ")}.`);
  if (d.operations.unread) out.push(`${d.operations.unread} website message${d.operations.unread === 1 ? " is" : "s are"} waiting for a reply.`);
  const behind = d.kpis.filter((k) => k.status === "behind").map((k) => k.label);
  if (behind.length) out.push(`Behind target: ${behind.join(", ")}.`);
  return out;
}

module.exports = { dashboard, ruleInsights };
