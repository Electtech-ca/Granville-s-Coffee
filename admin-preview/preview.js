/* GitHub Pages preview only (admin-preview/): answers the admin portal's API calls in the browser from a snapshot
   so the portal can be clicked through without a server. Changes live in memory until reload. */
(function () {
  "use strict";
  // Storage can be blocked in sandboxed previews; fall back to memory.
  ["sessionStorage", "localStorage"].forEach((k) => {
    try { window[k].setItem("_t", "1"); window[k].removeItem("_t"); }
    catch (e) { const m = {}; Object.defineProperty(window, k, { configurable: true, value: { getItem: (x) => (x in m ? m[x] : null), setItem: (x, v) => { m[x] = String(v); }, removeItem: (x) => { delete m[x]; } } }); }
  });
  const SNAP = window.__DEMO_SNAPSHOT__ || {};
  const keyOf = (url) => { const i = url.indexOf("/api/"); return i < 0 ? null : url.slice(i); };
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  const keysFor = (path) => Object.keys(SNAP).filter((k) => k.split("?")[0] === path);
  let nextId = 100000;
  const me = (SNAP["/api/admin/me"] || {}).body || { user: { id: 1, name: "Ted", email: "owner@granvilles.test", role: "owner" }, aiEnabled: false };
  const realFetch = window.fetch.bind(window);

  function listRows(res) { const k = keysFor("/api/admin/r/" + res); return k.map((x) => SNAP[x].body); }
  function menuItems() { return ((SNAP["/api/admin/menu"] || {}).body || []).flatMap((c) => c.items || []); }

  window.fetch = function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    const key = keyOf(url);
    if (!key) return realFetch(input, init);
    const method = (init.method || "GET").toUpperCase();
    const [path, qs] = key.split("?");
    const q = new URLSearchParams(qs || "");
    let body = {};
    try { if (typeof init.body === "string") body = JSON.parse(init.body); } catch (e) {}

    if (method === "GET") {
      if (path === "/api/admin/me") return json(me);
      if (SNAP[key]) return json(SNAP[key].body, SNAP[key].status);
      const cust = path.match(/^\/api\/admin\/customers\/(\d+)$/);
      if (cust) {
        const rec = listRows("customers").flatMap((l) => l.rows).find((c) => c.id == cust[1]);
        if (!rec) return json({ error: "Customer not found." }, 404);
        SNAP[key] = { status: 200, body: { customer: rec, interactions: [], sales: [], stats: { visits: 0, spend: 0, last_visit: null, first_visit: null }, favourites: [] } };
        return json(SNAP[key].body);
      }
      const res = path.match(/^\/api\/admin\/r\/(\w+)$/);
      if (res) {
        const base = keysFor(path).map((k) => SNAP[k].body).sort((a, b) => (b.rows || []).length - (a.rows || []).length)[0];
        if (base) {
          const term = (q.get("q") || "").toLowerCase();
          const rows = term ? base.rows.filter((r) => JSON.stringify(r).toLowerCase().includes(term)) : base.rows;
          return json({ rows, total: rows.length });
        }
        return json({ rows: [], total: 0 });
      }
      const near = keysFor(path)[0];
      if (near) return json(SNAP[near].body);
      return json({ rows: [] });
    }

    // Writes
    if (path === "/api/admin/login" || path === "/api/admin/logout" || path === "/api/admin/setup") return json({ ok: true });
    if (path.startsWith("/api/admin/ai/")) return json({ error: "The AI assistant is off in this preview. On the real server, adding an Anthropic API key switches it on." }, 503);
    if (path === "/api/admin/upload") return json({ url: URL.createObjectURL(init.body) });
    if (path === "/api/admin/sales" && method === "POST") {
      const items = menuItems();
      const sub = (body.items || []).reduce((a, l) => { const it = items.find((i) => i.id == l.menu_item_id); return a + (it ? it.price * l.qty : 0); }, 0);
      const total = Math.round(sub * (1 + Number(body.taxRate ?? 0.05)) * 100) / 100;
      const sk = "/api/admin/sales?days=2";
      if (SNAP[sk]) SNAP[sk].body.rows.unshift({ id: nextId++, sold_at: new Date().toISOString(), total, items: (body.items || []).map((l) => { const it = items.find((i) => i.id == l.menu_item_id); return `${l.qty}× ${it ? it.name : "Item"}`; }).join(", "), customer_name: null });
      return json({ ok: true, total });
    }
    if (path === "/api/admin/content/text") {
      const t = ((SNAP["/api/admin/content"] || {}).body || {}).text || [];
      Object.entries(body).forEach(([k, v]) => { const row = t.find((r) => r.key === k); if (row) row.value = v; });
      return json({ ok: true, saved: Object.keys(body).length });
    }
    const note = path.match(/^\/api\/admin\/customers\/(\d+)\/interactions$/);
    if (note) {
      const d = SNAP["/api/admin/customers/" + note[1]];
      const rec = Object.assign({ id: nextId++, created_at: new Date().toISOString(), author: me.user.name }, body);
      if (d) d.body.interactions.unshift(rec);
      return json(rec);
    }
    const res = path.match(/^\/api\/admin\/r\/(\w+)(?:\/([^/]+))?$/);
    if (res) {
      const [, name, id] = res;
      const lists = listRows(name);
      if (name === "items") {
        const it = menuItems().find((i) => i.id == id);
        if (it && method === "PUT") Object.assign(it, body);
        if (method === "DELETE") (SNAP["/api/admin/menu"].body || []).forEach((c) => { c.items = c.items.filter((i) => i.id != id); });
        if (method === "POST") { const c = (SNAP["/api/admin/menu"].body || []).find((x) => x.id == body.category_id); const rec = Object.assign({ id: nextId++, visible: true }, body); if (c) c.items.push(rec); return json(rec); }
        return json(Object.assign({ id: Number(id) }, it || {}, body));
      }
      if (method === "POST") { const rec = Object.assign({ id: nextId++, created_at: new Date().toISOString(), tags: [] }, body); lists.forEach((l) => { l.rows.unshift(rec); l.total = (l.total || 0) + 1; }); return json(rec); }
      if (method === "PUT") { let rec = Object.assign({ id: Number(id) }, body); lists.forEach((l) => { const r = l.rows.find((x) => String(x.id ?? x.metric ?? x.email) === decodeURIComponent(id)); if (r) { Object.assign(r, body); rec = r; } }); return json(rec); }
      if (method === "DELETE") { lists.forEach((l) => { l.rows = l.rows.filter((x) => String(x.id ?? x.metric ?? x.email) !== decodeURIComponent(id)); }); return json({ ok: true }); }
    }
    return json({ ok: true, created: 0 });
  };

  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = "<strong>Preview with sample data.</strong> Click anything. Changes stay until you reload; nothing is saved.";
    document.body.prepend(bar);
  });
})();
