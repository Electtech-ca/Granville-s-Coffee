/* Granville's Coffee — Admin Portal (no build step, plain JavaScript). */
(function () {
  "use strict";

  /* ================= Helpers ================= */
  const API = new URL("../api/admin", location.href).pathname;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n, d = 2) => (n == null || n === "" ? "—" : "$" + Number(n).toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const num = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("en-CA", { maximumFractionDigits: d }));
  const dt = (v) => (v ? new Date(v).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—");
  const dOnly = (v) => (v ? new Date(v).toLocaleDateString("en-CA", { dateStyle: "medium" }) : "—");
  const ago = (v) => {
    if (!v) return "never";
    const s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " days ago";
  };
  const S = { user: null, ai: false, aiModel: "", unread: 0, days: 30 };
  const rank = { staff: 1, manager: 2, owner: 3 };
  const can = (role) => S.user && rank[S.user.role] >= rank[role];

  async function api(method, path, body, opts = {}) {
    const headers = { "X-Requested-With": "granvilles-admin" };
    let payload;
    if (body instanceof Blob) { payload = body; headers["Content-Type"] = body.type; Object.assign(headers, opts.headers || {}); }
    else if (body !== undefined) { payload = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
    const res = await fetch(API + path, { method, headers, body: payload, credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/me" && path !== "/login") { S.user = null; renderLogin(); throw new Error("Please sign in again."); }
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }
  const get = (p) => api("GET", p), post = (p, b) => api("POST", p, b || {}), put = (p, b) => api("PUT", p, b), del = (p) => api("DELETE", p);

  let toastTimer;
  function toast(msg, err) {
    const t = $("#toast");
    t.textContent = msg; t.className = "show" + (err ? " err" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ""), err ? 5000 : 2600);
  }
  async function busy(btn, fn) {
    const label = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = "Working…"; }
    try { return await fn(); }
    catch (e) { toast(e.message, true); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
  }

  // Every form here is handled in JavaScript; never let Enter reload the page.
  document.addEventListener("submit", (e) => e.preventDefault(), true);
  function modal(html, { wide } = {}) {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `<div class="modal${wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.append(back);
    const prev = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey); prev && prev.focus && prev.focus(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
    $$("[data-close]", back).forEach((b) => b.addEventListener("click", close));
    // Enter inside a modal form presses the modal's main button.
    $$("form", back).forEach((f) => f.addEventListener("submit", () => { const b = $(".actions .btn:not(.light):not(.danger)", back); b && b.click(); }));
    setTimeout(() => { const f = $("input,select,textarea,button", back.firstElementChild); f && f.focus(); }, 30);
    return { el: back.firstElementChild, close };
  }
  function confirmBox(message, okLabel = "Yes, delete") {
    return new Promise((resolve) => {
      const m = modal(`<h2>Are you sure?</h2><p>${esc(message)}</p><div class="actions"><button class="btn light" data-close>Cancel</button><button class="btn danger" id="okBtn">${esc(okLabel)}</button></div>`);
      $("#okBtn", m.el).onclick = () => { m.close(); resolve(true); };
      $$("[data-close]", m.el).forEach((b) => b.addEventListener("click", () => resolve(false)));
    });
  }
  const formData = (form) => {
    const o = {};
    $$("input,select,textarea", form).forEach((el) => {
      if (!el.name) return;
      o[el.name] = el.type === "checkbox" ? el.checked : el.value;
    });
    return o;
  };
  const download = (path) => { if (window.GRANVILLES_PREVIEW) return toast("Exports are off in this preview. On the real server this downloads a CSV file you can open in Excel."); window.location.href = API + path; };

  /* ================= Charts (SVG, no libraries) ================= */
  function lineChart(points, { forecast = [], height = 220, prefix = "$" } = {}) {
    const all = points.concat(forecast);
    if (!all.length) return `<div class="empty">No data yet.</div>`;
    const W = 760, H = height, P = { l: 48, r: 12, t: 12, b: 26 };
    const max = Math.max(1, ...all.map((p) => p.y)) * 1.1;
    const x = (i) => P.l + (i / Math.max(1, all.length - 1)) * (W - P.l - P.r);
    const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
    const path = (arr, off = 0) => arr.map((p, i) => `${i ? "L" : "M"}${x(i + off).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#eee3cf"/><text x="${P.l - 6}" y="${y(max * f) + 4}" text-anchor="end">${prefix}${num(max * f)}</text>`).join("");
    const step = Math.ceil(all.length / 8);
    const labels = all.map((p, i) => (i % step === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>` : "")).join("");
    const area = points.length ? `${path(points)} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : "";
    const fc = forecast.length ? `<path d="M${x(points.length - 1)},${y(points[points.length - 1].y)} ${forecast.map((p, i) => `L${x(points.length + i)},${y(p.y)}`).join(" ")}" fill="none" stroke="#ed794b" stroke-width="2.5" stroke-dasharray="6 5"/>` : "";
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart">${grid}<path d="${area}" fill="#14382e14"/><path d="${path(points)}" fill="none" stroke="#14382e" stroke-width="2.5"/>${fc}${labels}</svg>`;
  }
  function bars(items, { label = (i) => i.label, value = (i) => i.value, fmt = (v) => money(v, 0) } = {}) {
    if (!items.length) return `<div class="empty">No data yet.</div>`;
    const max = Math.max(1, ...items.map(value));
    const top = Math.max(...items.map(value));
    return `<div class="bars">${items.map((i) => `<div class="${value(i) === top ? "hi" : ""}" style="height:${(value(i) / max) * 100}%" title="${esc(label(i))}: ${esc(fmt(value(i)))}"></div>`).join("")}</div>
      <div class="bars-labels">${items.map((i) => `<span>${esc(label(i))}</span>`).join("")}</div>`;
  }
  const delta = (v, invert) => {
    if (v == null) return `<span class="delta flat">no comparison</span>`;
    const good = invert ? v < 0 : v > 0;
    return `<span class="delta ${v === 0 ? "flat" : good ? "up" : "down"}">${v > 0 ? "▲" : v < 0 ? "▼" : "•"} ${Math.abs(v)}% vs previous</span>`;
  };

  /* ================= Login & setup ================= */
  async function renderLogin() {
    let status = { needsSetup: false };
    try { status = await get("/setup-status"); } catch (_) {}
    const app = $("#app");
    if (status.needsSetup) {
      app.innerHTML = `<div class="login"><form class="card stack" id="setupForm">
        <h1>Welcome to Granville's Admin</h1><p class="muted">Let's create the owner account. You'll use it to sign in and to invite your team.</p>
        <label class="field">Your name<input type="text" name="name" required autocomplete="name"></label>
        <label class="field">Email<input type="email" name="email" required autocomplete="email"></label>
        <label class="field">Password <span class="hint">At least 10 characters. A short sentence works well.</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
        ${status.tokenRequired ? `<label class="field">Setup code <span class="hint">From the SETUP_TOKEN setting on the server.</span><input type="text" name="token" required></label>` : ""}
        <button class="btn gold" type="submit">Create owner account</button></form></div>`;
      $("#setupForm").onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post("/setup", formData(e.target)); await boot(); }); };
      return;
    }
    app.innerHTML = `<div class="login"><form class="card stack" id="loginForm">
      <h1>Granville's <span style="color:var(--orange)">Admin</span></h1><p class="muted">Sign in to update the website and run the café.</p>
      <label class="field">Email<input type="email" name="email" required autocomplete="username"></label>
      <label class="field">Password<input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn gold" type="submit">Sign in</button>
      <p class="small muted">Forgot your password? Ask the owner to reset it under Settings → Team logins.</p></form></div>`;
    $("#loginForm").onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post("/login", formData(e.target)); await boot(); }); };
  }

  /* ================= Shell & router ================= */
  const NAV = [
    ["Overview", [["dashboard", "📊", "Dashboard", "staff"], ["ai", "✨", "AI assistant", "staff"]]],
    ["Website", [["website", "🖥️", "Edit website", "manager"], ["inbox", "✉️", "Inbox", "staff"]]],
    ["Customers & sales", [["customers", "🤝", "Customers (CRM)", "staff"], ["sales", "🧾", "Record sales", "staff"]]],
    ["Operations", [["inventory", "📦", "Stock & suppliers", "staff"], ["team", "👥", "Team & shifts", "staff"], ["finance", "💵", "Money", "manager"]]],
    ["Growth", [["performance", "🎯", "Goals & performance", "staff"], ["settings", "⚙️", "Settings", "staff"]]]
  ];

  function renderShell() {
    $("#app").innerHTML = `
      <div class="mobile-bar"><button id="openNav" aria-label="Open menu">☰</button><strong>Granville's Admin</strong></div>
      <div class="shell">
        <aside class="side" id="side">
          <a class="brand" href="#/dashboard">Granville's<span> Admin</span><small>Quesnel · since 1992</small></a>
          ${NAV.map(([g, items]) => `<div class="nav-group">${g}</div>` + items.filter((i) => can(i[3])).map(([id, ico, label]) => `<a class="nav" href="#/${id}" data-nav="${id}"><span class="ico">${ico}</span>${label}${id === "inbox" ? `<span class="badge" id="unreadBadge" hidden></span>` : ""}</a>`).join("")).join("")}
          <a class="nav" href="../" target="_blank" rel="noopener"><span class="ico">↗</span>View website</a>
          <div class="me">Signed in as <strong>${esc(S.user.name)}</strong><br><span class="pill">${esc(S.user.role)}</span> · <button id="logoutBtn">Sign out</button></div>
        </aside>
        <main class="main" id="view" tabindex="-1"></main>
      </div>`;
    $("#logoutBtn").onclick = async () => { await post("/logout").catch(() => {}); S.user = null; renderLogin(); };
    $("#openNav").onclick = () => $("#side").classList.add("open");
    $("#side").addEventListener("click", (e) => { if (e.target.closest("a")) $("#side").classList.remove("open"); });
  }

  async function refreshUnread() {
    try {
      const m = await get("/messages?status=new");
      S.unread = m.rows.length;
      const b = $("#unreadBadge");
      if (b) { b.hidden = !S.unread; b.textContent = S.unread; }
    } catch (_) {}
  }

  const views = {};
  async function route() {
    if (!S.user) return;
    const [name, ...rest] = (location.hash.replace(/^#\//, "") || "dashboard").split("/");
    const view = views[name] ? name : "dashboard";
    $$(".side a.nav").forEach((a) => a.classList.toggle("active", a.dataset.nav === view));
    // Each visit renders into its own box, so a slow earlier page can't paint over this one.
    const el = document.createElement("div");
    el.innerHTML = `<div class="empty">Loading…</div>`;
    $("#view").replaceChildren(el);
    try { await views[view](el, rest); }
    catch (e) { el.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
    if (el.isConnected) { $("#view").focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }
  const header = (title, sub, actions = "") => `<div class="topbar"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row">${actions}</div></div>`;
  const periodPicker = () => `<div class="seg" id="period">${[[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "12 months"]].map(([d, l]) => `<button data-days="${d}" class="${S.days === d ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const bindPeriod = (el, rerender) => $$("#period button", el).forEach((b) => (b.onclick = () => { S.days = Number(b.dataset.days); rerender(); }));
  const aiButton = (attrs, label = "✨ Ask AI") => `<button class="btn ai sm" ${attrs} ${S.ai ? "" : 'title="Add ANTHROPIC_API_KEY on the server to enable"'}>${label}</button>`;

  /* ================= Dashboard ================= */
  views.dashboard = async (el) => {
    const d = await get("/dashboard?days=" + S.days);
    const t = d.totals, c = d.change;
    const daily = d.daily.map((p) => ({ label: p.day.slice(5), y: p.revenue }));
    const fc = d.forecast.map((p) => ({ label: p.day.slice(5), y: p.revenue }));
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const hours = Array.from({ length: 12 }, (_, i) => i + 6).map((h) => ({ label: h > 12 ? h - 12 + "p" : h + (h === 12 ? "p" : "a"), value: (d.byHour.find((x) => x.hour === h) || {}).revenue || 0 }));
    const weekdays = [1, 2, 3, 4, 5, 6, 0].map((w) => ({ label: days[w], value: (d.byWeekday.find((x) => x.dow === w) || {}).avgRevenue || 0 }));
    const tile = (label, value, ch, invert) => `<div class="tile"><div class="label">${label}</div><div class="value">${value}</div>${delta(ch, invert)}</div>`;
    const noData = !t.orders;
    el.innerHTML = header(`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${esc(S.user.name.split(" ")[0])}`, "Here's how Granville's is doing.", periodPicker()) + `
      ${noData ? `<div class="notice info" style="margin-bottom:16px">No sales recorded in this period yet. Record sales under <a href="#/sales">Record sales</a>${can("owner") ? `, or load sample data under <a href="#/settings">Settings</a> to explore the dashboard` : ""}.</div>` : ""}
      <div class="grid g6">
        ${tile("Revenue", money(t.revenue, 0), c.revenue)}
        ${tile("Orders", num(t.orders), c.orders)}
        ${tile("Average ticket", money(t.avgTicket), c.avgTicket)}
        ${tile("Gross margin", t.grossMargin + "%", c.grossMargin)}
        ${tile("Labour % of sales", t.labourPct + "%", c.labourPct, true)}
        ${tile("Net profit (est.)", money(t.netProfit, 0), c.netProfit)}
      </div>
      <div class="grid g3" style="margin-top:16px">
        <div class="card span2"><div class="row"><h2>Sales trend</h2><span class="spacer"></span><span class="small muted">— actual · <span style="color:var(--orange)">- - next 7 days forecast</span></span></div>${lineChart(daily, { forecast: fc })}
          <div class="grid g3" style="margin-top:12px">
            <div class="tile"><div class="label">Forecast, next 7 days</div><div class="value">${money(d.forecast.reduce((a, p) => a + p.revenue, 0), 0)}</div></div>
            <div class="tile"><div class="label">Best day in range</div><div class="value">${daily.length ? money(Math.max(...daily.map((p) => p.y)), 0) : "–"}</div></div>
            <div class="tile"><div class="label">Expenses in range</div><div class="value">${money(t.expenses || 0, 0)}</div></div>
          </div></div>
        <div class="card"><div class="row"><h2>What to know</h2><span class="spacer"></span>${aiButton('id="briefBtn"', "✨ Weekly briefing")}</div>
          <ul class="insights">${d.insights.map((i) => `<li>${esc(i)}</li>`).join("") || "<li>All quiet. Nothing needs your attention.</li>"}</ul>
          <div id="briefOut"></div></div>
      </div>
      <div class="grid g3" style="margin-top:16px">
        <div class="card"><h2>Busiest hours</h2><p class="sub">Revenue by hour of day</p>${bars(hours)}</div>
        <div class="card"><h2>Best days</h2><p class="sub">Average revenue per trading day</p>${bars(weekdays)}</div>
        <div class="card"><h2>Performance score</h2><p class="sub">How you're tracking against your goals</p>
          <div class="row"><div class="score-ring">${d.performanceScore ?? "—"}</div><div class="small muted">out of 100<br><a href="#/performance">See goals →</a></div></div>
          <div class="stack" style="margin-top:10px">${d.kpis.slice(0, 4).map((k) => kpiLine(k)).join("")}</div></div>
      </div>
      <div class="grid g3" style="margin-top:16px">
        <div class="card"><h2>Top sellers</h2><table class="t"><tbody>${d.menuEngineering.slice(0, 7).map((m) => `<tr><td>${esc(m.name)}</td><td class="right">${num(m.qty)} sold</td><td class="right">${money(m.revenue, 0)}</td></tr>`).join("") || `<tr><td class="empty">No sales yet</td></tr>`}</tbody></table></div>
        <div class="card"><h2>Needs attention</h2>
          <h3 style="margin-top:4px">Low stock</h3>${d.operations.lowStock.length ? `<table class="t"><tbody>${d.operations.lowStock.slice(0, 5).map((i) => `<tr><td>${esc(i.name)}</td><td class="right"><span class="pill bad">${num(i.on_hand, 1)} ${esc(i.unit)}</span></td></tr>`).join("")}</tbody></table><a class="small" href="#/inventory">Reorder →</a>` : `<p class="small muted">Everything is stocked.</p>`}
          <h3 style="margin-top:12px">Messages</h3><p class="small">${d.operations.unread ? `<a href="#/inbox">${d.operations.unread} unread message${d.operations.unread > 1 ? "s" : ""} →</a>` : "Inbox is clear."}</p>
          <h3 style="margin-top:12px">Regulars to win back</h3>${d.customers.atRisk.length ? d.customers.atRisk.slice(0, 4).map((c) => `<div class="small"><a href="#/customers/${c.id}">${esc(c.name)}</a> · last visit ${ago(c.lastVisit)}</div>`).join("") : `<p class="small muted">No regulars are slipping away.</p>`}
        </div>
        <div class="card"><h2>Customers & website</h2>
          <div class="grid g2"><div class="tile"><div class="label">New customers</div><div class="value">${num(d.customers.newCustomers)}</div></div><div class="tile"><div class="label">Repeat rate</div><div class="value">${d.customers.repeatRate}%</div></div>
          <div class="tile"><div class="label">Website visits</div><div class="value">${num(d.web.totalViews)}</div></div><div class="tile"><div class="label">Sales / labour hr</div><div class="value">${money(t.salesPerLabourHour, 0)}</div></div></div>
          <p class="small muted" style="margin-top:10px">Top traffic sources: ${d.web.referrers.map((r) => `${esc(r.source)} (${r.views})`).join(", ") || "none yet"}</p></div>
      </div>`;
    bindPeriod(el, () => views.dashboard(el));
    $("#briefBtn").onclick = (e) => busy(e.currentTarget, async () => {
      const r = await post("/ai/briefing", { days: S.days });
      $("#briefOut").innerHTML = `<div style="margin-top:12px"><div class="ai-tag">AI briefing</div><div class="ai-out">${esc(r.text)}</div></div>`;
    });
  };
  function kpiLine(k) {
    const pct = k.score == null ? 0 : Math.min(k.score, 100);
    const cls = k.status === "on-track" ? "" : k.status === "close" ? "warn" : "bad";
    const fmt = (v) => (v == null ? "—" : k.unit === "$" ? money(v) : k.unit === "%" ? v + "%" : k.unit === "h" ? v + " h" : num(v));
    return `<div><div class="row small"><strong>${esc(k.label)}</strong><span class="spacer"></span>${fmt(k.actual)} <span class="muted">/ ${fmt(k.target)}</span></div><div class="meter ${cls}"><i style="width:${pct}%"></i></div></div>`;
  }

  /* ================= Website editor ================= */
  views.website = async (el, [tab = "text"]) => {
    const tabs = [["text", "Page text"], ["menu", "Menu"], ["photos", "Photos"], ["contact", "Contact & hours"], ["fun", "Stories & games"]];
    el.innerHTML = header("Edit website", "Changes go live on the website within a few seconds.", `<a class="btn light" href="../" target="_blank" rel="noopener">View website ↗</a>`) +
      `<nav class="tabs">${tabs.map(([id, l]) => `<a href="#/website/${id}" class="${tab === id ? "on" : ""}">${l}</a>`).join("")}</nav><div id="tab"></div>`;
    const box = $("#tab", el);
    const content = await get("/content");
    if (tab === "text") return websiteText(box, content);
    if (tab === "menu") return websiteMenu(box, content);
    if (tab === "photos") return websitePhotos(box, content);
    if (tab === "contact") return websiteContact(box, content);
    if (tab === "fun") return websiteFun(box, content);
  };

  function websiteText(box, content) {
    const groups = {};
    content.text.forEach((t) => { const g = (t.label || t.key).split(" · ")[0]; (groups[g] = groups[g] || []).push(t); });
    box.innerHTML = `<form id="textForm" class="stack">
      <div class="notice info">Headlines can use <code>&lt;br&gt;</code> for a new line and <code>&lt;em&gt;…&lt;/em&gt;</code> for the coloured words. Everything else is plain text.</div>
      ${Object.entries(groups).map(([g, items]) => `<div class="card"><h2>${esc(g)}</h2><div class="stack">${items.map((t) => `
        <label class="field">${esc((t.label || t.key).split(" · ")[1] || t.key)}
          <textarea name="${esc(t.key)}" rows="${t.value.length > 160 ? 4 : 2}">${esc(t.value)}</textarea></label>
        <div class="row">${aiButton(`data-ai-field="${esc(t.key)}"`, "✨ Rewrite with AI")}<span class="small muted">Last saved ${ago(t.updated_at)}</span></div>`).join("")}</div></div>`).join("")}
      <div class="row" style="position:sticky;bottom:10px"><button class="btn gold" type="submit">💾 Save all text</button></div></form>`;
    $("#textForm").onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await put("/content/text", formData(e.target)); toast("Website text saved. It's live."); }); };
    $$("[data-ai-field]", box).forEach((b) => (b.onclick = () => aiRewrite(b.dataset.aiField, $(`textarea[name="${CSS.escape(b.dataset.aiField)}"]`, box))));
  }
  function aiRewrite(field, textarea) {
    const m = modal(`<h2>✨ Rewrite with AI</h2><label class="field">What should change? <span class="hint">e.g. "make it shorter", "mention the carrot cake", "more welcoming to tourists"</span><input type="text" id="aiInstr" placeholder="Make it fresher, same voice"></label>
      <div id="aiRes" style="margin-top:12px"></div><div class="actions"><button class="btn light" data-close>Close</button><button class="btn ai" id="aiGo">Suggest</button><button class="btn gold" id="aiUse" hidden>Use this</button></div>`);
    let text = "";
    $("#aiGo", m.el).onclick = (e) => busy(e.currentTarget, async () => {
      const r = await post("/ai/writeCopy", { field, current: textarea.value, instruction: $("#aiInstr", m.el).value });
      text = r.text; $("#aiRes", m.el).innerHTML = `<div class="ai-out">${esc(text)}</div>`; $("#aiUse", m.el).hidden = false;
    });
    $("#aiUse", m.el).onclick = () => { textarea.value = text; m.close(); toast("Inserted. Remember to save."); };
  }

  async function websiteMenu(box, content) {
    const cats = await get("/menu");
    const showPrices = !!(content.settings.settings && content.settings.settings.showPrices);
    box.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="row"><label class="check"><input type="checkbox" id="showPrices" ${showPrices ? "checked" : ""}> Show prices on the website</label><span class="spacer"></span><button class="btn light sm" id="addCat">+ Add category</button></div>
      <p class="small muted" style="margin:8px 0 0">Prices and costs are always used for sales and profit reports. Untick to keep the website price-free.</p></div>
      ${cats.map((c) => `<details class="menu-cat" open><summary>${esc(c.emoji)} ${esc(c.label.startsWith(c.emoji) ? c.label.slice(c.emoji.length).trim() : c.label)} <span class="pill">${c.items.length} items</span>${c.visible ? "" : '<span class="pill warn">hidden</span>'}<span class="spacer"></span><button class="icon-btn" data-edit-cat="${c.id}" type="button">Edit category</button></summary>
        <div class="items">
          <div class="item-row small muted" style="border:0"><span>Name</span><span>Description</span><span>Price</span><span>Cost</span><span></span></div>
          ${c.items.map((i) => itemRow(i)).join("")}
          <button class="btn light sm" data-add-item="${c.id}" style="margin-top:10px">+ Add item to ${esc(c.label)}</button>
        </div></details>`).join("")}`;
    $("#showPrices").onchange = async (e) => {
      const s = Object.assign({}, content.settings.settings, { showPrices: e.target.checked });
      try { await put("/content/settings/settings", { value: s }); content.settings.settings = s; toast(e.target.checked ? "Prices now show on the website." : "Prices hidden on the website."); } catch (err) { toast(err.message, true); }
    };
    $("#addCat").onclick = () => editCategory(null, () => websiteMenu(box, content));
    $$("[data-edit-cat]", box).forEach((b) => (b.onclick = (e) => { e.preventDefault(); editCategory(cats.find((c) => c.id == b.dataset.editCat), () => websiteMenu(box, content)); }));
    $$("[data-add-item]", box).forEach((b) => (b.onclick = async () => {
      await busy(b, async () => { await post("/r/items", { category_id: b.dataset.addItem, name: "New item", description: "", sort: 99, visible: true }); });
      websiteMenu(box, content);
    }));
    $$(".item-row[data-id]", box).forEach((row) => {
      const id = row.dataset.id;
      $("[data-save]", row).onclick = (e) => busy(e.currentTarget, async () => { await put("/r/items/" + id, formData(row)); toast("Saved."); });
      $("[data-del]", row).onclick = async () => { if (await confirmBox("Delete this menu item? Past sales keep their history.")) { await del("/r/items/" + id).catch((e) => toast(e.message, true)); websiteMenu(box, content); } };
      $("[data-ai]", row).onclick = (e) => busy(e.currentTarget, async () => {
        const r = await post("/ai/menuDescription", { name: $("[name=name]", row).value, category: row.closest(".menu-cat").querySelector("summary").textContent });
        $("[name=description]", row).value = r.text; toast("Description written. Click Save to keep it.");
      });
    });
  }
  const itemRow = (i) => `<div class="item-row" data-id="${i.id}">
      <input type="text" name="name" value="${esc(i.name)}" aria-label="Name">
      <textarea name="description" rows="2" aria-label="Description">${esc(i.description)}</textarea>
      <input type="number" step="0.01" min="0" name="price" value="${i.price != null ? Number(i.price).toFixed(2) : ""}" placeholder="0.00" aria-label="Price">
      <input type="number" step="0.01" min="0" name="cost" value="${i.cost != null ? Number(i.cost).toFixed(2) : ""}" placeholder="0.00" aria-label="Cost to make">
      <div class="row"><label class="check small"><input type="checkbox" name="visible" ${i.visible ? "checked" : ""}> Show</label>
        <button class="btn sm" data-save type="button">Save</button>${aiButton('data-ai type="button"', "✨")}<button class="icon-btn" data-del type="button" aria-label="Delete">🗑</button></div></div>`;
  function editCategory(c, done) {
    const m = modal(`<h2>${c ? "Edit" : "Add"} menu category</h2><form class="form-grid" id="catForm">
      <label class="field">Tab label <span class="hint">Shown on the menu tabs, e.g. "🥪 Sandwiches"</span><input type="text" name="label" required value="${esc(c ? c.label : "")}"></label>
      <label class="field">Emoji<input type="text" name="emoji" value="${esc(c ? c.emoji : "☕")}"></label>
      <label class="field full">Spotlight title <span class="hint">e.g. "THE SANDWICH DEPARTMENT"</span><input type="text" name="title" value="${esc(c ? c.title : "")}"></label>
      <label class="field">Order<input type="number" name="sort" value="${c ? c.sort : 10}"></label>
      <label class="check"><input type="checkbox" name="visible" ${!c || c.visible ? "checked" : ""}> Show on website</label>
      <input type="hidden" name="slug" value="${esc(c ? c.slug : "")}">
      </form><div class="actions">${c ? `<button class="btn danger" id="delCat">Delete category</button><span class="spacer"></span>` : ""}<button class="btn light" data-close>Cancel</button><button class="btn" id="saveCat">Save</button></div>`);
    $("#saveCat", m.el).onclick = (e) => busy(e.currentTarget, async () => {
      const f = formData($("#catForm", m.el));
      if (!f.slug) f.slug = f.label.replace(/[^\w\s-]/g, "").trim() || "category-" + Date.now();
      if (c) await put("/r/categories/" + c.id, f); else await post("/r/categories", f);
      m.close(); toast("Category saved."); done();
    });
    if (c) $("#delCat", m.el).onclick = async () => { if (await confirmBox(`Delete "${c.label}" and all its items?`)) { await del("/r/categories/" + c.id).catch((e) => toast(e.message, true)); m.close(); done(); } };
  }

  async function uploadImage(file) {
    if (!file) return null;
    if (file.size > 6 * 1024 * 1024) throw new Error("That image is over 6 MB. Please pick a smaller one.");
    const r = await api("POST", "/upload", file, { headers: { "X-Filename": file.name } });
    return r.url;
  }
  const imgSrc = (src) => (/^((https?:)?\/\/|blob:|data:)/.test(src) || src.startsWith("/") ? src : "../" + src);

  async function websitePhotos(box, content) {
    const { rows } = await get("/r/gallery");
    const ted = content.settings.tedPhoto || "";
    box.innerHTML = `<div class="grid g4">${rows.map((p) => `<form class="card photo-card stack" data-id="${p.id}">
        <img src="${esc(imgSrc(p.src))}" alt="">
        <label class="btn light sm" style="justify-content:center">Replace photo<input type="file" accept="image/*" hidden data-file></label>
        <input type="hidden" name="src" value="${esc(p.src)}">
        <label class="field">Title<input type="text" name="title" value="${esc(p.title)}"></label>
        <label class="field">Caption<textarea name="caption" rows="2">${esc(p.caption)}</textarea></label>
        <label class="field">Description for screen readers<input type="text" name="alt" value="${esc(p.alt)}"></label>
        <div class="row"><label class="field" style="width:80px">Order<input type="number" name="sort" value="${p.sort}"></label><label class="check"><input type="checkbox" name="visible" ${p.visible ? "checked" : ""}> Show</label></div>
        <div class="row"><button class="btn sm" data-save type="button">Save</button><button class="icon-btn" data-del type="button">🗑 Delete</button></div></form>`).join("")}
      <div class="card stack" style="justify-content:center;align-items:center;text-align:center"><h3>Add a photo</h3><p class="small muted">JPG, PNG or WebP, up to 6 MB.</p><label class="btn gold">Upload photo<input type="file" accept="image/*" hidden id="newPhoto"></label></div></div>
      <div class="card" style="margin-top:16px"><h2>Ted's portrait</h2><p class="sub">The "Meet Ted" section shows an illustration until you upload an approved photo.</p>
        <div class="row">${ted ? `<img src="${esc(imgSrc(ted))}" alt="" style="width:120px;border-radius:12px">` : `<span class="pill warn">Using the illustration</span>`}
        <label class="btn light">Upload Ted's photo<input type="file" accept="image/*" hidden id="tedPhoto"></label>${ted ? `<button class="btn danger sm" id="tedRemove">Use illustration again</button>` : ""}</div></div>`;
    $$("form[data-id]", box).forEach((f) => {
      const id = f.dataset.id;
      $("[data-file]", f).onchange = (e) => busy(null, async () => { const url = await uploadImage(e.target.files[0]); $("[name=src]", f).value = url; $("img", f).src = imgSrc(url); toast("Photo uploaded. Click Save to publish it."); });
      $("[data-save]", f).onclick = (e) => busy(e.currentTarget, async () => { await put("/r/gallery/" + id, formData(f)); toast("Photo saved."); });
      $("[data-del]", f).onclick = async () => { if (await confirmBox("Remove this photo from the website?")) { await del("/r/gallery/" + id); websitePhotos(box, content); } };
    });
    $("#newPhoto").onchange = (e) => busy(null, async () => { const url = await uploadImage(e.target.files[0]); await post("/r/gallery", { src: url, title: "New photo", caption: "", alt: "", sort: rows.length, visible: true }); toast("Photo added."); websitePhotos(box, content); });
    $("#tedPhoto").onchange = (e) => busy(null, async () => { const url = await uploadImage(e.target.files[0]); await put("/content/settings/tedPhoto", { value: url }); content.settings.tedPhoto = url; toast("Ted's photo is live."); websitePhotos(box, content); });
    const rm = $("#tedRemove"); if (rm) rm.onclick = () => busy(rm, async () => { await put("/content/settings/tedPhoto", { value: "" }); content.settings.tedPhoto = ""; websitePhotos(box, content); });
  }

  function websiteContact(box, content) {
    const s = content.settings.settings || {};
    const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const hours = DAYS.map((d) => (content.settings.hours || []).find((h) => h.day === d) || { day: d, open: "", close: "", closed: false });
    box.innerHTML = `<div class="grid g2">
      <form class="card stack" id="contactForm"><h2>Contact details</h2>
        <label class="field">Street address<input type="text" name="address" value="${esc(s.address || "")}"></label>
        <label class="field">Phone<input type="tel" name="phone" value="${esc(s.phone || "")}" placeholder="(250) 555-0123"></label>
        <label class="field">Email <span class="hint">Shown on the site; the contact form also falls back to it.</span><input type="email" name="email" value="${esc(s.email || "")}"></label>
        <label class="field">Google Maps link<input type="url" name="mapsUrl" value="${esc(s.mapsUrl || "")}"></label>
        <label class="field">Published menu link<input type="url" name="menuListingUrl" value="${esc(s.menuListingUrl || "")}"></label>
        <button class="btn gold" type="submit">Save contact details</button></form>
      <form class="card stack" id="hoursForm"><h2>Opening hours</h2><p class="sub">Leave all days blank to show "Call ahead" instead.</p>
        <table class="t"><tbody>${hours.map((h, i) => `<tr><td><strong>${h.day}</strong></td>
          <td><input type="time" name="open${i}" value="${esc(h.open)}" aria-label="${h.day} opens"></td><td><input type="time" name="close${i}" value="${esc(h.close)}" aria-label="${h.day} closes"></td>
          <td><label class="check small"><input type="checkbox" name="closed${i}" ${h.closed ? "checked" : ""}> Closed</label></td></tr>`).join("")}</tbody></table>
        <button class="btn gold" type="submit">Save hours</button></form></div>`;
    $("#contactForm").onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { const v = Object.assign({}, s, formData(e.target)); await put("/content/settings/settings", { value: v }); content.settings.settings = v; toast("Contact details saved."); }); };
    $("#hoursForm").onsubmit = (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const fmt = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`; };
      const any = DAYS.some((_, i) => f["open" + i] || f["closed" + i]);
      const value = any ? DAYS.map((d, i) => ({ day: d, open: f["open" + i] ? fmt(f["open" + i]) : "", close: f["close" + i] ? fmt(f["close" + i]) : "", closed: !!f["closed" + i], open24: f["open" + i], close24: f["close" + i] })) : [];
      busy(e.submitter, async () => { await put("/content/settings/hours", { value }); content.settings.hours = value; toast("Hours saved."); });
    };
    // Show saved 24h values in the time inputs
    (content.settings.hours || []).forEach((h) => { const i = DAYS.indexOf(h.day); if (i >= 0) { $(`[name=open${i}]`, box).value = h.open24 || ""; $(`[name=close${i}]`, box).value = h.close24 || ""; } });
  }

  function websiteFun(box, content) {
    const L = content.settings.lists || {};
    const stories = content.settings.stories || [];
    const lines = (arr) => esc((arr || []).join("\n"));
    box.innerHTML = `<div class="notice info" style="margin-bottom:14px">One item per line. These feed the buttons in the games section of the website.</div>
      <form class="grid g3" id="listsForm">
        <label class="card field">Local Directions Machine<textarea name="directions" rows="8">${lines(L.directions)}</textarea></label>
        <label class="card field">Rumour or ridiculous?<textarea name="rumours" rows="8">${lines(L.rumours)}</textarea></label>
        <label class="card field">How long until you're a local?<textarea name="locals" rows="8">${lines(L.locals)}</textarea></label>
        <div class="span2"><button class="btn gold" type="submit">Save game lines</button></div></form>
      <form class="card stack" id="storiesForm" style="margin-top:16px"><h2>Community table stories</h2><p class="sub">Shown when visitors press "Another story". Speech bubbles are for the three characters.</p>
        <div id="storyRows" class="stack">${stories.map(storyRow).join("")}</div>
        <div class="row"><button class="btn light sm" type="button" id="addStory">+ Add story</button><span class="spacer"></span><button class="btn gold" type="submit">Save stories</button></div></form>`;
    $("#listsForm").onsubmit = (e) => {
      e.preventDefault();
      const f = formData(e.target), split = (v) => v.split("\n").map((s) => s.trim()).filter(Boolean);
      const value = { directions: split(f.directions), rumours: split(f.rumours), locals: split(f.locals) };
      busy(e.submitter, async () => { await put("/content/settings/lists", { value }); content.settings.lists = value; toast("Game lines saved."); });
    };
    $("#addStory").onclick = () => $("#storyRows").insertAdjacentHTML("beforeend", storyRow({ line: "", caption: "", bubbles: ["", "", ""] }));
    $("#storyRows").addEventListener("click", (e) => { if (e.target.matches("[data-rm]")) e.target.closest(".story").remove(); });
    $("#storiesForm").onsubmit = (e) => {
      e.preventDefault();
      const value = $$(".story", box).map((s) => ({ line: $("[data-k=line]", s).value.trim(), caption: $("[data-k=caption]", s).value.trim(), bubbles: $$("[data-k=bubble]", s).map((b) => b.value.trim()) })).filter((s) => s.line);
      busy(e.submitter, async () => { await put("/content/settings/stories", { value }); content.settings.stories = value; toast("Stories saved."); });
    };
  }
  const storyRow = (s) => `<div class="story" style="border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff">
    <div class="form-grid"><label class="field full">Story<textarea data-k="line" rows="2">${esc(s.line)}</textarea></label>
    <label class="field full">Caption<input type="text" data-k="caption" value="${esc(s.caption)}"></label>
    ${[0, 1, 2].map((i) => `<label class="field">Bubble ${i + 1}<input type="text" data-k="bubble" value="${esc((s.bubbles || [])[i] || "")}"></label>`).join("")}
    <div class="row"><button type="button" class="btn danger sm" data-rm>Remove</button></div></div></div>`;

  /* ================= Inbox ================= */
  views.inbox = async (el, [filter = "open"]) => {
    const { rows } = await get("/messages" + (filter === "open" ? "" : "?status=" + filter));
    el.innerHTML = header("Inbox", "Messages from the website's contact form.", `<div class="seg">${[["open", "Open"], ["new", "Unread"], ["replied", "Replied"], ["archived", "Archived"]].map(([k, l]) => `<button onclick="location.hash='#/inbox/${k}'" class="${filter === k ? "on" : ""}">${l}</button>`).join("")}</div>${can("manager") ? `<button class="btn light" id="expMsg">Export CSV</button>` : ""}`) +
      `<div class="card table-wrap">${rows.length ? `<table class="t"><thead><tr><th>From</th><th>Message</th><th>Status</th><th>Received</th></tr></thead><tbody>${rows.map((m) => `<tr class="click" data-id="${m.id}"><td><strong>${esc(m.name)}</strong><br><span class="small muted">${esc(m.email)}</span></td><td>${esc(m.message.slice(0, 140))}${m.message.length > 140 ? "…" : ""}</td><td>${statusPill(m.status)}</td><td class="small">${ago(m.created_at)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">No messages here. 🎉</div>`}</div>`;
    const exp = $("#expMsg"); if (exp) exp.onclick = () => download("/export/messages");
    $$("tr[data-id]", el).forEach((tr) => (tr.onclick = () => openMessage(rows.find((m) => m.id == tr.dataset.id), () => views.inbox(el, [filter]))));
  };
  const statusPill = (s) => `<span class="pill ${{ new: "warn", read: "info", replied: "good", archived: "" }[s] || ""}">${esc(s)}</span>`;
  function openMessage(msg, done) {
    if (msg.status === "new") put("/messages/" + msg.id, { status: "read" }).then(refreshUnread).catch(() => {});
    const m = modal(`<h2>Message from ${esc(msg.name)}</h2><p class="small muted">${esc(msg.email)} · ${dt(msg.created_at)}${msg.customer_id ? ` · <a href="#/customers/${msg.customer_id}" data-close>Customer profile</a>` : ""}</p>
      <div class="ai-out" style="border-color:var(--line)">${esc(msg.message)}</div>
      <label class="field" style="margin-top:14px">Your reply<textarea id="replyText" rows="7">${esc(msg.reply || "")}</textarea></label>
      <div class="row" style="margin-top:8px">${aiButton('id="draftBtn"', "✨ Draft a reply")}</div>
      <div class="actions"><button class="btn light" id="archBtn">Archive</button><span class="spacer"></span><button class="btn light" data-close>Close</button><button class="btn gold" id="sendBtn">Open in email & mark replied</button></div>`, { wide: true });
    $("#draftBtn", m.el).onclick = (e) => busy(e.currentTarget, async () => { const r = await post("/ai/replyDraft", { message: msg.message, name: msg.name }); $("#replyText", m.el).value = r.text; });
    $("#archBtn", m.el).onclick = (e) => busy(e.currentTarget, async () => { await put("/messages/" + msg.id, { status: "archived" }); m.close(); toast("Archived."); refreshUnread(); done(); });
    $("#sendBtn", m.el).onclick = (e) => busy(e.currentTarget, async () => {
      const reply = $("#replyText", m.el).value.trim();
      if (!reply) throw new Error("Write a reply first.");
      await put("/messages/" + msg.id, { status: "replied", reply });
      window.location.href = `mailto:${encodeURIComponent(msg.email)}?subject=${encodeURIComponent("Re: your message to Granville's Coffee")}&body=${encodeURIComponent(reply)}`;
      m.close(); toast("Marked as replied."); refreshUnread(); done();
    });
  }

  /* ================= Generic list/edit helper ================= */
  // fields: [{k,label,type,options,full,hint,required}]
  function editForm(fields, rec = {}) {
    return `<form class="form-grid">${fields.map((f) => {
      const v = rec[f.k] ?? f.def ?? "";
      const req = f.required ? "required" : "";
      const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : "";
      if (f.type === "bool") return `<label class="check ${f.full ? "full" : ""}"><input type="checkbox" name="${f.k}" ${v ? "checked" : ""}> ${esc(f.label)}</label>`;
      if (f.type === "textarea") return `<label class="field full">${esc(f.label)}${hint}<textarea name="${f.k}" rows="3">${esc(v)}</textarea></label>`;
      if (f.type === "select") return `<label class="field ${f.full ? "full" : ""}">${esc(f.label)}${hint}<select name="${f.k}" ${req}>${f.blank ? `<option value="">${esc(f.blank)}</option>` : ""}${f.options.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? "selected" : ""}>${esc(ol)}</option>`).join("")}</select></label>`;
      let val = v;
      if (f.type === "date" && v) val = String(v).slice(0, 10);
      if (f.type === "datetime-local" && v) { const d = new Date(v); val = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
      if (f.type === "tags") val = Array.isArray(v) ? v.join(", ") : v;
      return `<label class="field ${f.full ? "full" : ""}">${esc(f.label)}${hint}<input type="${f.type === "tags" ? "text" : f.type || "text"}" ${f.type === "number" ? 'step="any"' : ""} name="${f.k}" value="${esc(val)}" ${req}></label>`;
    }).join("")}</form>`;
  }
  function recordModal({ title, res, fields, rec, done, extra = "" }) {
    const m = modal(`<h2>${esc(title)}</h2>${editForm(fields, rec || {})}${extra}<div class="actions">${rec && rec.id != null || (rec && rec.metric) ? `<button class="btn danger" id="recDel">Delete</button><span class="spacer"></span>` : ""}<button class="btn light" data-close>Cancel</button><button class="btn" id="recSave">Save</button></div>`, { wide: fields.length > 8 });
    const pk = rec && (rec.id ?? rec.metric);
    $("#recSave", m.el).onclick = (e) => busy(e.currentTarget, async () => {
      const form = $("form", m.el);
      if (!form.reportValidity()) return;
      const data = formData(form);
      fields.filter((f) => f.type === "datetime-local").forEach((f) => { if (data[f.k]) data[f.k] = new Date(data[f.k]).toISOString(); });
      const saved = pk != null ? await put(`/r/${res}/${encodeURIComponent(pk)}`, data) : await post(`/r/${res}`, data);
      m.close(); toast("Saved."); done && done(saved);
    });
    const d = $("#recDel", m.el);
    if (d) d.onclick = async () => { if (await confirmBox("Delete this record? This can't be undone.")) { try { await del(`/r/${res}/${encodeURIComponent(pk)}`); m.close(); toast("Deleted."); done && done(); } catch (e) { toast(e.message, true); } } };
    return m;
  }

  /* ================= Customers (CRM) ================= */
  const CUSTOMER_FIELDS = [
    { k: "name", label: "Name", required: true }, { k: "email", label: "Email", type: "email" }, { k: "phone", label: "Phone", type: "tel" },
    { k: "birthday", label: "Birthday", type: "date", hint: "For a birthday treat" }, { k: "tags", label: "Tags", type: "tags", hint: "Comma separated, e.g. regular, oat milk, catering" },
    { k: "source", label: "How they found us", type: "select", options: [["walk-in", "Walk-in"], ["website", "Website"], ["referral", "Friend / referral"], ["event", "Event"], ["social", "Social media"], ["other", "Other"]] },
    { k: "loyalty_points", label: "Loyalty points", type: "number" }, { k: "marketing_consent", label: "Agreed to receive news by email", type: "bool" },
    { k: "notes", label: "Notes", type: "textarea", hint: "Usual order, allergies, family names…" }
  ];
  views.customers = async (el, [id]) => {
    if (id) return customerDetail(el, id);
    const q = sessionStorage.getItem("custQ") || "";
    const [{ rows, total }, dash] = await Promise.all([get("/r/customers?limit=500&q=" + encodeURIComponent(q)), get("/dashboard?days=90").catch(() => null)]);
    el.innerHTML = header("Customers", `${num(total)} people in your little black book.`, `${can("manager") ? `<button class="btn light" id="expCust">Export CSV</button>` : ""}<button class="btn gold" id="addCust">+ Add customer</button>`) +
      (dash ? `<div class="grid g6" style="margin-bottom:16px">${dash.customers.segments.map((s) => `<div class="tile"><div class="label">${esc(s.name)}</div><div class="value">${num(s.count)}</div><span class="small muted">${money(s.spend, 0)} lifetime</span></div>`).join("")}</div>` : "") +
      `<div class="card"><div class="row" style="margin-bottom:10px"><input type="search" id="custQ" placeholder="Search name, email, phone or notes…" value="${esc(q)}" style="max-width:380px"></div>
       <div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Contact</th><th>Tags</th><th>Points</th><th>Since</th></tr></thead><tbody>
       ${rows.map((c) => `<tr class="click" data-id="${c.id}"><td><strong>${esc(c.name)}</strong>${c.marketing_consent ? ' <span title="Agreed to email news">📬</span>' : ""}</td><td class="small">${esc(c.email || "")}<br>${esc(c.phone || "")}</td><td>${(c.tags || []).map((t) => `<span class="pill">${esc(t)}</span>`).join(" ")}</td><td>${num(c.loyalty_points)}</td><td class="small">${dOnly(c.created_at)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No customers found.</td></tr>`}
       </tbody></table></div></div>
       <p class="small muted">Segments: Champions visited 8+ times and recently · Loyal 3+ visits this month · At risk were regulars but haven't visited in 30–75 days · Lost longer than that · Prospects haven't bought yet.</p>`;
    let t;
    $("#custQ").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { sessionStorage.setItem("custQ", e.target.value); views.customers(el, []); }, 350); };
    $("#addCust").onclick = () => recordModal({ title: "Add customer", res: "customers", fields: CUSTOMER_FIELDS, done: (c) => (location.hash = "#/customers/" + c.id) });
    const ex = $("#expCust"); if (ex) ex.onclick = () => download("/export/customers");
    $$("tr[data-id]", el).forEach((tr) => (tr.onclick = () => (location.hash = "#/customers/" + tr.dataset.id)));
  };
  async function customerDetail(el, id) {
    const d = await get("/customers/" + id);
    const c = d.customer;
    el.innerHTML = header(esc(c.name), `<a href="#/customers">← All customers</a>`, `<button class="btn light" id="editCust">Edit</button>${c.email ? `<a class="btn light" href="mailto:${esc(c.email)}">Email</a>` : ""}${c.phone ? `<a class="btn light" href="tel:${esc(c.phone)}">Call</a>` : ""}`) + `
      <div class="grid g4"><div class="tile"><div class="label">Visits</div><div class="value">${num(d.stats.visits)}</div></div><div class="tile"><div class="label">Lifetime spend</div><div class="value">${money(d.stats.spend)}</div></div>
      <div class="tile"><div class="label">Last visit</div><div class="value" style="font-size:20px">${ago(d.stats.last_visit)}</div></div><div class="tile"><div class="label">Loyalty points</div><div class="value">${num(c.loyalty_points)}</div></div></div>
      <div class="grid g3" style="margin-top:16px">
        <div class="card"><h2>Profile</h2><p class="small">${esc(c.email || "No email")}<br>${esc(c.phone || "No phone")}<br>${c.birthday ? "🎂 " + dOnly(c.birthday) : ""}</p>
          <p>${(c.tags || []).map((t) => `<span class="pill">${esc(t)}</span>`).join(" ")}</p><p class="small"><strong>Found us via:</strong> ${esc(c.source)}<br><strong>Email news:</strong> ${c.marketing_consent ? "Yes" : "No"}</p>
          <p class="small" style="white-space:pre-wrap">${esc(c.notes)}</p>
          <h3>Favourites</h3>${d.favourites.map((f) => `<div class="small">${esc(f.name)} × ${f.qty}</div>`).join("") || `<p class="small muted">No purchases yet.</p>`}</div>
        <div class="card"><h2>Timeline</h2><form id="noteForm" class="row" style="margin-bottom:12px"><select name="kind" style="width:auto"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="visit">Visit</option><option value="complaint">Complaint</option><option value="compliment">Compliment</option></select><input type="text" name="summary" placeholder="Add a note…" style="flex:1;min-width:140px"><button class="btn sm">Add</button></form>
          <ul class="timeline">${d.interactions.map((i) => `<li><strong>${esc(i.kind)}</strong> · <span class="small muted">${dt(i.created_at)}${i.by_name ? " · " + esc(i.by_name) : ""}</span><br>${esc(i.summary)}</li>`).join("") || `<li class="muted">No notes yet.</li>`}</ul></div>
        <div class="card"><h2>Purchases</h2><table class="t"><tbody>${d.sales.map((s) => `<tr><td class="small">${dt(s.sold_at)}<br>${esc(s.items || "")}</td><td class="right">${money(s.total)}</td></tr>`).join("") || `<tr><td class="empty">No purchases yet</td></tr>`}</tbody></table></div>
      </div>`;
    $("#editCust").onclick = () => recordModal({ title: "Edit customer", res: "customers", fields: CUSTOMER_FIELDS, rec: c, done: (s) => (s ? customerDetail(el, id) : (location.hash = "#/customers")) });
    $("#noteForm").onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post(`/customers/${id}/interactions`, formData(e.target)); customerDetail(el, id); }); };
  }

  /* ================= Sales (quick till) ================= */
  views.sales = async (el) => {
    const [cats, cust, emps, recent] = await Promise.all([get("/menu"), get("/r/customers?limit=1000"), get("/r/employees"), get("/sales?days=2")]);
    const cart = [];
    el.innerHTML = header("Record sales", "Tap items to ring up a sale. Use this if your till doesn't sync automatically.") + `
      <div class="till"><div class="card"><div class="row" style="margin-bottom:10px"><input type="search" id="itemQ" placeholder="Find an item…" style="max-width:300px"></div><div id="tillItems"></div></div>
      <div class="card stack" style="align-self:start;position:sticky;top:16px"><h2>Current sale</h2><div id="cart"></div>
        <label class="field">Customer (optional)<input list="custList" id="custPick" placeholder="Start typing a name"><datalist id="custList">${cust.rows.map((c) => `<option value="${esc(c.name)}${c.email ? " · " + esc(c.email) : ""}" data-id="${c.id}">`).join("")}</datalist></label>
        <div class="form-grid"><label class="field">Served by<select id="empPick"><option value="">—</option>${emps.rows.filter((e) => e.active).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></label>
        <label class="field">Payment<select id="payPick"><option value="card">Card</option><option value="cash">Cash</option><option value="gift card">Gift card</option><option value="other">Other</option></select></label></div>
        <label class="check small"><input type="checkbox" id="taxPick" checked> Add 5% GST</label>
        <button class="btn gold" id="ringUp">Record sale</button></div></div>
      <div class="card" style="margin-top:16px"><h2>Recent sales</h2><div class="table-wrap"><table class="t"><thead><tr><th>When</th><th>Items</th><th>Customer</th><th>Total</th><th></th></tr></thead><tbody id="recent">${recentRows(recent.rows)}</tbody></table></div></div>`;
    const renderItems = (q = "") => {
      $("#tillItems").innerHTML = cats.map((c) => {
        const items = c.items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
        if (!items.length) return "";
        return `<h3 style="margin:10px 0 6px">${esc(c.label)}</h3><div class="till-items">${items.map((i) => `<button data-id="${i.id}" ${i.price == null ? 'title="Set a price under Edit website → Menu"' : ""}><b>${esc(i.name)}</b><span>${i.price == null ? "No price set" : money(i.price)}</span></button>`).join("")}</div>`;
      }).join("");
    };
    const all = cats.flatMap((c) => c.items);
    const renderCart = () => {
      const tax = $("#taxPick").checked ? 0.05 : 0;
      const sub = cart.reduce((a, l) => a + l.price * l.qty, 0);
      $("#cart").innerHTML = cart.length ? cart.map((l, i) => `<div class="cart-line"><span class="name">${esc(l.name)}</span><button class="icon-btn" data-dec="${i}">−</button><strong>${l.qty}</strong><button class="icon-btn" data-inc="${i}">+</button><span style="width:70px" class="right">${money(l.price * l.qty)}</span></div>`).join("") +
        `<div class="row" style="margin-top:8px"><span>Subtotal</span><span class="spacer"></span>${money(sub)}</div><div class="row small muted"><span>GST</span><span class="spacer"></span>${money(sub * tax)}</div><div class="row" style="font-weight:800;font-size:18px"><span>Total</span><span class="spacer"></span>${money(sub * (1 + tax))}</div>` : `<p class="muted small">Tap items on the left to add them.</p>`;
    };
    renderItems(); renderCart();
    $("#itemQ").oninput = (e) => renderItems(e.target.value);
    $("#taxPick").onchange = renderCart;
    $("#tillItems").onclick = (e) => {
      const b = e.target.closest("button[data-id]"); if (!b) return;
      const it = all.find((i) => i.id == b.dataset.id);
      if (it.price == null) return toast(`Set a price for "${it.name}" first under Edit website → Menu.`, true);
      const line = cart.find((l) => l.id === it.id);
      line ? line.qty++ : cart.push({ id: it.id, name: it.name, price: it.price, qty: 1 });
      renderCart();
    };
    $("#cart").onclick = (e) => {
      const i = e.target.dataset.inc ?? e.target.dataset.dec; if (i == null) return;
      cart[i].qty += e.target.dataset.inc != null ? 1 : -1;
      if (cart[i].qty <= 0) cart.splice(i, 1);
      renderCart();
    };
    $("#ringUp").onclick = (e) => busy(e.currentTarget, async () => {
      if (!cart.length) throw new Error("Add at least one item.");
      const pickVal = $("#custPick").value;
      const opt = $$("#custList option").find((o) => o.value === pickVal);
      if (pickVal && !opt) throw new Error("Pick a customer from the list, or leave it blank.");
      const sale = await post("/sales", { items: cart.map((l) => ({ menu_item_id: l.id, qty: l.qty })), customer_id: opt ? opt.dataset.id : null, employee_id: $("#empPick").value || null, payment_method: $("#payPick").value, taxRate: $("#taxPick").checked ? 0.05 : 0 });
      toast(`Sale recorded: ${money(sale.total)}`);
      cart.length = 0; $("#custPick").value = ""; renderCart();
      $("#recent").innerHTML = recentRows((await get("/sales?days=2")).rows);
    });
    $("#recent").onclick = async (e) => {
      const id = e.target.dataset.delSale; if (!id) return;
      if (await confirmBox("Delete this sale? Use this only for mistakes.")) { await del("/sales/" + id).catch((er) => toast(er.message, true)); $("#recent").innerHTML = recentRows((await get("/sales?days=2")).rows); }
    };
  };
  const recentRows = (rows) => rows.slice(0, 25).map((s) => `<tr><td class="small">${dt(s.sold_at)}</td><td class="small">${esc(s.items || "")}</td><td class="small">${esc(s.customer || "")}</td><td>${money(s.total)}</td><td>${can("manager") ? `<button class="icon-btn" data-del-sale="${s.id}" aria-label="Delete sale">🗑</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No sales in the last two days.</td></tr>`;

  /* ================= Inventory, suppliers, purchasing ================= */
  views.inventory = async (el, [tab = "stock"]) => {
    const tabs = [["stock", "Stock levels"], ["orders", "Purchase orders"], ["suppliers", "Suppliers"]];
    el.innerHTML = header("Stock & suppliers", "Know what you have, what's running low, and what's on order.", can("manager") ? `<button class="btn light" id="expInv">Export CSV</button>` : "") +
      `<nav class="tabs">${tabs.map(([id, l]) => `<a href="#/inventory/${id}" class="${tab === id ? "on" : ""}">${l}</a>`).join("")}</nav><div id="tab"></div>`;
    const ex = $("#expInv"); if (ex) ex.onclick = () => download("/export/inventory");
    const box = $("#tab", el);
    const sup = await get("/r/suppliers");
    const supOpts = sup.rows.map((s) => [s.id, s.name]);
    const ITEM_FIELDS = [{ k: "name", label: "Item", required: true }, { k: "category", label: "Category", def: "Ingredients" }, { k: "unit", label: "Unit", def: "each", hint: "kg, L, loaf, sleeve…" },
      { k: "on_hand", label: "On hand", type: "number", def: 0 }, { k: "reorder_level", label: "Reorder when at or below", type: "number", def: 0 }, { k: "reorder_qty", label: "Usual order quantity", type: "number", def: 0 },
      { k: "unit_cost", label: "Cost per unit ($)", type: "number", def: 0 }, { k: "supplier_id", label: "Supplier", type: "select", blank: "—", options: supOpts }];
    if (tab === "stock") {
      const { rows } = await get("/r/inventory");
      const value = rows.reduce((a, i) => a + i.on_hand * i.unit_cost, 0);
      box.innerHTML = `<div class="row" style="margin-bottom:12px"><span class="pill">${rows.length} items</span><span class="pill">Stock value ${money(value, 0)}</span><span class="pill bad">${rows.filter((i) => i.on_hand <= i.reorder_level).length} low</span><span class="spacer"></span>${can("manager") ? `<button class="btn gold" id="addItem">+ Add stock item</button>` : ""}</div>
        <div class="card table-wrap"><table class="t"><thead><tr><th>Item</th><th>On hand</th><th>Status</th><th>Supplier</th><th>Unit cost</th><th>Quick count</th><th></th></tr></thead><tbody>
        ${rows.map((i) => { const low = i.on_hand <= i.reorder_level; const s = sup.rows.find((x) => x.id === i.supplier_id); return `<tr data-id="${i.id}"><td><strong>${esc(i.name)}</strong><br><span class="small muted">${esc(i.category)}</span></td><td>${num(i.on_hand, 2)} ${esc(i.unit)}</td><td>${low ? `<span class="pill bad">Reorder</span>` : i.on_hand <= i.reorder_level * 1.5 ? `<span class="pill warn">Getting low</span>` : `<span class="pill good">OK</span>`}</td><td class="small">${esc(s ? s.name : "—")}</td><td>${money(i.unit_cost)}</td>
          <td><div class="row" style="flex-wrap:nowrap"><button class="icon-btn" data-adj="-1">−1</button><button class="icon-btn" data-adj="1">+1</button><button class="icon-btn" data-adjx>±…</button></div></td><td>${can("manager") ? `<button class="icon-btn" data-edit>Edit</button>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">No stock items yet.</td></tr>`}</tbody></table></div>`;
      const add = $("#addItem"); if (add) add.onclick = () => recordModal({ title: "Add stock item", res: "inventory", fields: ITEM_FIELDS, done: () => views.inventory(el, ["stock"]) });
      $$("tr[data-id]", box).forEach((tr) => {
        const item = rows.find((i) => i.id == tr.dataset.id);
        $$("[data-adj]", tr).forEach((b) => (b.onclick = () => busy(null, async () => { await post(`/inventory/${item.id}/adjust`, { change: Number(b.dataset.adj), reason: Number(b.dataset.adj) > 0 ? "received" : "used" }); views.inventory(el, ["stock"]); })));
        $("[data-adjx]", tr).onclick = () => {
          const m = modal(`<h2>Adjust ${esc(item.name)}</h2><p class="small muted">Currently ${num(item.on_hand, 2)} ${esc(item.unit)}</p><form class="form-grid" id="adjForm"><label class="field">Change<span class="hint">Positive to add, negative to remove</span><input type="number" step="any" name="change" required></label>
            <label class="field">Reason<select name="reason"><option value="count">Stock count correction</option><option value="received">Delivery received</option><option value="used">Used</option><option value="waste">Waste / spoiled</option></select></label><label class="field full">Note<input type="text" name="note"></label></form>
            <h3 style="margin-top:14px">Recent movements</h3><div id="moves" class="small muted">Loading…</div><div class="actions"><button class="btn light" data-close>Cancel</button><button class="btn" id="adjSave">Save</button></div>`);
          get(`/inventory/${item.id}/movements`).then((r) => { $("#moves", m.el).innerHTML = r.rows.slice(0, 8).map((mv) => `${dt(mv.created_at)} · ${mv.change > 0 ? "+" : ""}${mv.change} · ${esc(mv.reason)} ${esc(mv.ref || "")}`).join("<br>") || "None yet."; });
          $("#adjSave", m.el).onclick = (e) => busy(e.currentTarget, async () => { await post(`/inventory/${item.id}/adjust`, formData($("#adjForm", m.el))); m.close(); views.inventory(el, ["stock"]); });
        };
        const ed = $("[data-edit]", tr); if (ed) ed.onclick = () => recordModal({ title: "Edit stock item", res: "inventory", fields: ITEM_FIELDS, rec: item, done: () => views.inventory(el, ["stock"]) });
      });
    }
    if (tab === "orders") {
      const [{ rows }, inv] = await Promise.all([get("/purchase-orders"), get("/r/inventory")]);
      box.innerHTML = `${can("manager") ? `<div class="row" style="margin-bottom:12px"><button class="btn gold" id="suggest">⚡ Create orders for low stock</button><button class="btn light" id="newPo">+ New purchase order</button></div>` : ""}
        ${rows.map((p) => `<div class="card" style="margin-bottom:12px"><div class="row"><h3 style="margin:0">PO #${p.id} · ${esc(p.supplier || "No supplier")}</h3>${statusPill2(p.status)}<span class="spacer"></span><strong>${money(p.total)}</strong></div>
          <p class="small muted">Created ${dOnly(p.created_at)}${p.ordered_at ? " · ordered " + dOnly(p.ordered_at) : ""}${p.received_at ? " · received " + dOnly(p.received_at) : ""}${p.notes ? " · " + esc(p.notes) : ""}</p>
          <table class="t"><tbody>${p.lines.map((l) => `<tr><td>${esc(l.item)}</td><td>${num(l.qty, 2)} ${esc(l.unit)}</td><td class="right">${money(l.unit_cost)} each</td></tr>`).join("")}</tbody></table>
          ${can("manager") ? `<div class="row" style="margin-top:10px">${p.status === "draft" ? `<button class="btn sm" data-po="${p.id}" data-st="ordered">Mark as ordered</button>${p.supplier_email ? `<a class="btn light sm" href="mailto:${esc(p.supplier_email)}?subject=${encodeURIComponent("Order from Granville's Coffee (PO #" + p.id + ")")}&body=${encodeURIComponent("Hello,\n\nPlease send:\n" + p.lines.map((l) => `- ${l.qty} ${l.unit} ${l.item}`).join("\n") + "\n\nThank you,\nGranville's Coffee, 383 Reid Street, Quesnel")}">Email supplier</a>` : ""}<button class="btn danger sm" data-podel="${p.id}">Delete</button>` : ""}
            ${p.status === "ordered" ? `<button class="btn gold sm" data-po="${p.id}" data-st="received">Received: add to stock</button><button class="btn light sm" data-po="${p.id}" data-st="cancelled">Cancel</button>` : ""}</div>` : ""}</div>`).join("") || `<div class="card empty">No purchase orders yet. Use "Create orders for low stock" to start.</div>`}`;
      const sg = $("#suggest"); if (sg) sg.onclick = (e) => busy(e.currentTarget, async () => { const r = await post("/purchase-orders/suggest"); toast(r.created ? `Created ${r.created} draft order${r.created > 1 ? "s" : ""}.` : "Nothing is low (or it's already on order)."); views.inventory(el, ["orders"]); });
      const np = $("#newPo"); if (np) np.onclick = () => {
        const m = modal(`<h2>New purchase order</h2><label class="field">Supplier<select id="poSup"><option value="">—</option>${supOpts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select></label>
          <h3 style="margin-top:14px">Items</h3><div id="poLines" class="stack"></div><button class="btn light sm" id="poAdd" style="margin-top:8px">+ Add line</button>
          <label class="field" style="margin-top:12px">Notes<input type="text" id="poNotes"></label><div class="actions"><button class="btn light" data-close>Cancel</button><button class="btn" id="poSave">Create draft</button></div>`, { wide: true });
        const addLine = () => $("#poLines", m.el).insertAdjacentHTML("beforeend", `<div class="row po-line"><select style="flex:2">${inv.rows.map((i) => `<option value="${i.id}">${esc(i.name)} (${esc(i.unit)})</option>`).join("")}</select><input type="number" step="any" min="0" placeholder="Qty" style="flex:1"><input type="number" step="0.01" min="0" placeholder="Unit cost (optional)" style="flex:1"></div>`);
        addLine(); $("#poAdd", m.el).onclick = addLine;
        $("#poSave", m.el).onclick = (e) => busy(e.currentTarget, async () => {
          const lines = $$(".po-line", m.el).map((r) => { const [s, q, c] = $$("select,input", r); return { item_id: s.value, qty: q.value, unit_cost: c.value }; });
          await post("/purchase-orders", { supplier_id: $("#poSup", m.el).value || null, notes: $("#poNotes", m.el).value, lines });
          m.close(); views.inventory(el, ["orders"]);
        });
      };
      $$("[data-po]", box).forEach((b) => (b.onclick = () => busy(b, async () => { await post(`/purchase-orders/${b.dataset.po}/status`, { status: b.dataset.st }); toast(b.dataset.st === "received" ? "Stock updated and expense recorded." : "Updated."); views.inventory(el, ["orders"]); })));
      $$("[data-podel]", box).forEach((b) => (b.onclick = async () => { if (await confirmBox("Delete this draft order?")) { await del("/purchase-orders/" + b.dataset.podel); views.inventory(el, ["orders"]); } }));
    }
    if (tab === "suppliers") {
      const F = [{ k: "name", label: "Supplier", required: true }, { k: "contact", label: "Contact person" }, { k: "email", label: "Email", type: "email" }, { k: "phone", label: "Phone", type: "tel" }, { k: "lead_days", label: "Delivery lead time (days)", type: "number", def: 3 }, { k: "notes", label: "Notes", type: "textarea" }];
      box.innerHTML = `${can("manager") ? `<div class="row" style="margin-bottom:12px"><button class="btn gold" id="addSup">+ Add supplier</button></div>` : ""}<div class="card table-wrap"><table class="t"><thead><tr><th>Supplier</th><th>Contact</th><th>Lead time</th><th>Notes</th></tr></thead><tbody>
        ${sup.rows.map((s) => `<tr class="click" data-id="${s.id}"><td><strong>${esc(s.name)}</strong></td><td class="small">${esc(s.contact || "")} ${esc(s.email || "")} ${esc(s.phone || "")}</td><td>${s.lead_days} days</td><td class="small">${esc(s.notes)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No suppliers yet.</td></tr>`}</tbody></table></div>`;
      const a = $("#addSup"); if (a) a.onclick = () => recordModal({ title: "Add supplier", res: "suppliers", fields: F, done: () => views.inventory(el, ["suppliers"]) });
      if (can("manager")) $$("tr[data-id]", box).forEach((tr) => (tr.onclick = () => recordModal({ title: "Edit supplier", res: "suppliers", fields: F, rec: sup.rows.find((s) => s.id == tr.dataset.id), done: () => views.inventory(el, ["suppliers"]) })));
    }
  };
  const statusPill2 = (s) => `<span class="pill ${{ draft: "", ordered: "info", received: "good", cancelled: "bad" }[s]}">${esc(s)}</span>`;

  /* ================= Team ================= */
  views.team = async (el, [tab = "people"]) => {
    const tabs = [["people", "Team"], ["shifts", "Shifts"], ["reviews", "Reviews"]];
    el.innerHTML = header("Team & shifts", "Your people, their hours and how they're doing.") + `<nav class="tabs">${tabs.filter((t) => t[0] !== "reviews" || can("manager")).map(([id, l]) => `<a href="#/team/${id}" class="${tab === id ? "on" : ""}">${l}</a>`).join("")}</nav><div id="tab"></div>`;
    const box = $("#tab", el);
    const emps = await get("/r/employees");
    const empOpts = emps.rows.map((e) => [e.id, e.name]);
    const empName = (id) => (emps.rows.find((e) => e.id === id) || {}).name || "—";
    if (tab === "people") {
      const F = [{ k: "name", label: "Name", required: true }, { k: "role", label: "Role", def: "Barista" }, { k: "email", label: "Email", type: "email" }, { k: "phone", label: "Phone", type: "tel" }, { k: "hourly_rate", label: "Hourly rate ($)", type: "number", def: 17.85 }, { k: "hired_on", label: "Start date", type: "date" }, { k: "active", label: "Currently working here", type: "bool", def: true }];
      const dash = await get("/dashboard?days=30").catch(() => null);
      box.innerHTML = `${can("manager") ? `<div class="row" style="margin-bottom:12px"><button class="btn gold" id="addEmp">+ Add team member</button></div>` : ""}
        <div class="card table-wrap"><table class="t"><thead><tr><th>Name</th><th>Role</th><th>Rate</th><th>Hours (30d)</th><th>Sales (30d)</th><th>Sales / hour</th><th>Avg ticket</th><th>Last review</th></tr></thead><tbody>
        ${emps.rows.map((e) => { const p = dash ? dash.staff.find((s) => s.id === e.id) : null; return `<tr class="${can("manager") ? "click" : ""}" data-id="${e.id}"><td><strong>${esc(e.name)}</strong>${e.active ? "" : ' <span class="pill">former</span>'}</td><td>${esc(e.role)}</td><td>${money(e.hourly_rate)}</td><td>${p ? num(p.hours, 1) : "—"}</td><td>${p ? money(p.revenue, 0) : "—"}</td><td>${p ? money(p.revenuePerHour, 0) : "—"}</td><td>${p ? money(p.avgTicket) : "—"}</td><td>${p && p.last_rating ? "★".repeat(p.last_rating) : "—"}</td></tr>`; }).join("") || `<tr><td colspan="8" class="empty">Add your team to track shifts and labour cost.</td></tr>`}</tbody></table></div>`;
      const a = $("#addEmp"); if (a) a.onclick = () => recordModal({ title: "Add team member", res: "employees", fields: F, done: () => views.team(el, ["people"]) });
      if (can("manager")) $$("tr[data-id]", box).forEach((tr) => (tr.onclick = () => recordModal({ title: "Edit team member", res: "employees", fields: F, rec: emps.rows.find((e) => e.id == tr.dataset.id), done: () => views.team(el, ["people"]) })));
    }
    if (tab === "shifts") {
      const { rows } = await get("/r/shifts?limit=300");
      const F = [{ k: "employee_id", label: "Team member", type: "select", options: empOpts, required: true }, { k: "starts_at", label: "Starts", type: "datetime-local", required: true }, { k: "ends_at", label: "Ends", type: "datetime-local", required: true }, { k: "notes", label: "Notes", type: "textarea" }];
      const week = rows.filter((s) => new Date(s.starts_at) > new Date(Date.now() - 7 * 86400e3));
      const hours = (s) => (new Date(s.ends_at) - new Date(s.starts_at)) / 3600e3;
      const cost = week.reduce((a, s) => a + hours(s) * ((emps.rows.find((e) => e.id === s.employee_id) || {}).hourly_rate || 0), 0);
      box.innerHTML = `<div class="row" style="margin-bottom:12px"><span class="pill">Last 7 days: ${num(week.reduce((a, s) => a + hours(s), 0), 1)} hours</span><span class="pill">Labour cost ${money(cost, 0)}</span><span class="spacer"></span>${can("manager") ? `<button class="btn light" id="expShifts">Export CSV</button><button class="btn gold" id="addShift">+ Add shift</button>` : ""}</div>
        <div class="card table-wrap"><table class="t"><thead><tr><th>Who</th><th>Starts</th><th>Ends</th><th>Hours</th><th>Notes</th></tr></thead><tbody>
        ${rows.slice(0, 150).map((s) => `<tr class="${can("manager") ? "click" : ""}" data-id="${s.id}"><td>${esc(empName(s.employee_id))}</td><td>${dt(s.starts_at)}</td><td>${dt(s.ends_at)}</td><td>${num(hours(s), 2)}</td><td class="small">${esc(s.notes)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No shifts yet.</td></tr>`}</tbody></table></div>`;
      const nowISO = new Date(); nowISO.setMinutes(0, 0, 0);
      const a = $("#addShift"); if (a) a.onclick = () => recordModal({ title: "Add shift", res: "shifts", fields: F, rec: { starts_at: nowISO.toISOString(), ends_at: new Date(nowISO.getTime() + 8 * 3600e3).toISOString() }, done: () => views.team(el, ["shifts"]) });
      const ex = $("#expShifts"); if (ex) ex.onclick = () => download("/export/shifts");
      if (can("manager")) $$("tr[data-id]", box).forEach((tr) => (tr.onclick = () => recordModal({ title: "Edit shift", res: "shifts", fields: F, rec: rows.find((s) => s.id == tr.dataset.id), done: () => views.team(el, ["shifts"]) })));
    }
    if (tab === "reviews") {
      const { rows } = await get("/r/reviews");
      const F = [{ k: "employee_id", label: "Team member", type: "select", options: empOpts, required: true }, { k: "reviewed_on", label: "Date", type: "date", required: true, def: new Date().toISOString().slice(0, 10) }, { k: "rating", label: "Overall rating", type: "select", options: [[5, "★★★★★ Outstanding"], [4, "★★★★ Strong"], [3, "★★★ Solid"], [2, "★★ Needs support"], [1, "★ Serious concerns"]], required: true }, { k: "strengths", label: "Strengths", type: "textarea" }, { k: "improvements", label: "Growth areas", type: "textarea" }, { k: "goals", label: "Goals for next 90 days", type: "textarea" }];
      box.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn gold" id="addRev">+ Write a review</button></div><div class="grid g2">${rows.map((r) => `<div class="card click" data-id="${r.id}" style="cursor:pointer"><div class="row"><h3 style="margin:0">${esc(empName(r.employee_id))}</h3><span class="spacer"></span>${"★".repeat(r.rating)}</div><p class="small muted">${dOnly(r.reviewed_on)}</p><p class="small"><strong>Strengths:</strong> ${esc(r.strengths)}</p><p class="small"><strong>Growth:</strong> ${esc(r.improvements)}</p><p class="small"><strong>Goals:</strong> ${esc(r.goals)}</p></div>`).join("") || `<div class="card empty">No reviews yet. Regular, short reviews help people grow.</div>`}</div>`;
      const aiExtra = `<div class="notice info" style="margin-top:12px"><div class="row"><span class="small">Let AI draft this from the person's numbers and your notes.</span><span class="spacer"></span>${aiButton('id="revAi" type="button"', "✨ Draft review")}</div></div>`;
      const open = (rec) => {
        const m = recordModal({ title: rec ? "Edit review" : "Write a review", res: "reviews", fields: F, rec, extra: aiExtra, done: () => views.team(el, ["reviews"]) });
        $("#revAi", m.el).onclick = (e) => busy(e.currentTarget, async () => {
          const f = formData($("form", m.el));
          const r = await post("/ai/reviewHelp", { employee_id: f.employee_id, notes: [f.strengths, f.improvements, f.goals].filter(Boolean).join("\n") });
          const part = (name) => { const mm = r.text.match(new RegExp(name + "[:\\s]*\\n?([\\s\\S]*?)(?=\\n\\s*(?:#+\\s*)?(?:\\*\\*)?(Strengths|Growth areas|Goals)|$)", "i")); return mm ? mm[1].replace(/^[*#\s]+/, "").trim() : ""; };
          $("[name=strengths]", m.el).value = part("Strengths") || r.text;
          $("[name=improvements]", m.el).value = part("Growth areas");
          $("[name=goals]", m.el).value = part("Goals for next 90 days") || part("Goals");
        });
      };
      $("#addRev").onclick = () => open(null);
      $$("[data-id]", box).forEach((c) => (c.onclick = () => open(rows.find((r) => r.id == c.dataset.id))));
    }
  };

  /* ================= Money ================= */
  views.finance = async (el) => {
    const [d, ex] = await Promise.all([get("/dashboard?days=" + S.days), get("/r/expenses?limit=300")]);
    const t = d.totals;
    const F = [{ k: "spent_on", label: "Date", type: "date", required: true, def: new Date().toISOString().slice(0, 10) }, { k: "category", label: "Category", type: "select", options: ["Supplies", "Inventory", "Rent", "Utilities", "Repairs", "Marketing", "Insurance", "Wages", "Fees", "Other"].map((c) => [c, c]) }, { k: "vendor", label: "Paid to" }, { k: "amount", label: "Amount ($)", type: "number", required: true }, { k: "notes", label: "Notes", type: "textarea" }];
    const line = (l, v, strong) => `<tr><td>${strong ? "<strong>" + l + "</strong>" : l}</td><td class="right">${strong ? "<strong>" + money(v) + "</strong>" : money(v)}</td></tr>`;
    el.innerHTML = header("Money", "A simple profit & loss view plus your expenses.", periodPicker() + `<button class="btn light" id="expSales">Export sales</button><button class="btn light" id="expEx">Export expenses</button>`) + `
      <div class="grid g3"><div class="card"><h2>Profit & loss (estimate)</h2><p class="sub">Last ${d.period.days} days</p><table class="t"><tbody>
        ${line("Sales (before tax)", t.revenue)}${line("Cost of food & drink", -t.cogs)}${line("Gross profit", t.grossProfit, true)}${line("Wages (from shifts)", -t.labour)}${line("Other expenses", -t.expenses)}${line("Net profit", t.netProfit, true)}</tbody></table>
        <p class="small muted">Cost of goods uses the "cost" you set on each menu item. Wages use logged shifts × hourly rate.</p></div>
        <div class="card span2"><h2>Sales by category</h2><table class="t"><thead><tr><th>Category</th><th>Sold</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr></thead><tbody>${d.categories.map((c) => `<tr><td>${esc(c.category)}</td><td>${num(c.qty)}</td><td>${money(c.revenue, 0)}</td><td>${money(c.profit, 0)}</td><td>${c.revenue ? Math.round((c.profit / c.revenue) * 100) : 0}%</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No sales yet.</td></tr>`}</tbody></table>
        <h3 style="margin-top:14px">Payment methods</h3><p class="small">${d.payments.map((p) => `${esc(p.method)}: ${money(p.revenue, 0)} (${p.orders})`).join(" · ") || "—"}</p></div></div>
      <div class="card" style="margin-top:16px"><div class="row"><h2>Expenses</h2><span class="spacer"></span><button class="btn gold" id="addEx">+ Add expense</button></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Category</th><th>Paid to</th><th>Amount</th><th>Notes</th></tr></thead><tbody>
        ${ex.rows.map((x) => `<tr class="click" data-id="${x.id}"><td>${dOnly(x.spent_on)}</td><td>${esc(x.category)}</td><td>${esc(x.vendor)}</td><td>${money(x.amount)}</td><td class="small">${esc(x.notes)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No expenses yet.</td></tr>`}</tbody></table></div></div>`;
    bindPeriod(el, () => views.finance(el));
    $("#expSales").onclick = () => download("/export/sales");
    $("#expEx").onclick = () => download("/export/expenses");
    $("#addEx").onclick = () => recordModal({ title: "Add expense", res: "expenses", fields: F, done: () => views.finance(el) });
    $$("tr[data-id]", el).forEach((tr) => (tr.onclick = () => recordModal({ title: "Edit expense", res: "expenses", fields: F, rec: ex.rows.find((x) => x.id == tr.dataset.id), done: () => views.finance(el) })));
  };

  /* ================= Goals & performance ================= */
  views.performance = async (el) => {
    const d = await get("/dashboard?days=" + S.days);
    const groups = { Star: [], Plowhorse: [], Puzzle: [], Dog: [] };
    d.menuEngineering.forEach((m) => groups[m.class].push(m));
    const colors = { Star: "#dcf0e2", Plowhorse: "#fbecc8", Puzzle: "#dde9f7", Dog: "#f8dcd8" };
    const blurb = { Star: "Popular and profitable: protect these.", Plowhorse: "Popular, lower margin: adjust cost or price.", Puzzle: "Profitable, under-ordered: promote these.", Dog: "Neither: rethink or retire." };
    el.innerHTML = header("Goals & performance", "Set targets, see how you're tracking, and find what to improve.", periodPicker()) + `
      <div class="grid g3"><div class="card"><h2>Performance score</h2><p class="sub">Average of your goal scores (capped at 120 each)</p><div class="score-ring">${d.performanceScore ?? "—"}<span class="small muted"> / 100</span></div>
        <p class="small muted">On track ✓ means at or better than target · close is within 10%.</p></div>
        <div class="card span2"><div class="row"><h2>Goals</h2><span class="spacer"></span>${can("manager") ? `<button class="btn light sm" id="addKpi">+ Add goal</button>` : ""}</div>
          <div class="stack">${d.kpis.map((k) => `<div class="row" style="flex-wrap:nowrap"><div style="flex:1">${kpiLine(k)}</div><span class="pill ${k.status === "on-track" ? "good" : k.status === "close" ? "warn" : k.status === "behind" ? "bad" : ""}">${esc(k.status.replace("-", " "))}</span>${can("manager") ? `<button class="icon-btn" data-kpi="${esc(k.metric)}">Edit</button>` : ""}</div>`).join("")}</div></div></div>
      <div class="card" style="margin-top:16px"><h2>Menu engineering</h2><p class="sub">Each item is placed by how often it sells and how much it earns per sale, compared with your menu average.</p>
        <div class="matrix">${Object.entries(groups).map(([k, list]) => `<div style="background:${colors[k]}"><h3>${k === "Star" ? "⭐" : k === "Plowhorse" ? "🐴" : k === "Puzzle" ? "🧩" : "🐕"} ${k}s <span class="small muted">(${list.length})</span></h3><p class="small">${blurb[k]}</p><div class="small">${list.slice(0, 8).map((m) => `${esc(m.name)} <span class="muted">· ${m.qty} sold · ${money(m.margin)} margin</span>`).join("<br>") || "—"}</div></div>`).join("")}</div></div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h2>Customer health</h2><table class="t"><tbody>${d.customers.segments.map((s) => `<tr><td>${esc(s.name)}</td><td class="right">${num(s.count)} people</td><td class="right">${money(s.spend, 0)}</td></tr>`).join("")}</tbody></table>
          <h3 style="margin-top:12px">Top customers</h3>${d.customers.topCustomers.slice(0, 6).map((c) => `<div class="small"><a href="#/customers/${c.id}">${esc(c.name)}</a> · ${c.visits} visits · ${money(c.spend, 0)}</div>`).join("") || `<p class="small muted">No data yet.</p>`}</div>
        <div class="card"><h2>Team productivity</h2><table class="t"><thead><tr><th>Name</th><th>Hours</th><th>Sales/hr</th><th>Avg ticket</th></tr></thead><tbody>${d.staff.map((s) => `<tr><td>${esc(s.name)}</td><td>${num(s.hours, 1)}</td><td>${money(s.revenuePerHour, 0)}</td><td>${money(s.avgTicket)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No shifts logged.</td></tr>`}</tbody></table></div></div>`;
    bindPeriod(el, () => views.performance(el));
    const KF = [{ k: "metric", label: "Metric", type: "select", options: [["daily_revenue", "Average daily revenue ($)"], ["avg_ticket", "Average ticket ($)"], ["gross_margin", "Gross margin (%)"], ["labour_pct", "Labour % of revenue"], ["repeat_rate", "Repeat customer rate (%)"], ["new_customers", "New customers"], ["reply_hours", "Message reply time (hours)"]] }, { k: "label", label: "Name shown", required: true }, { k: "target", label: "Target", type: "number", required: true }, { k: "direction", label: "Better when", type: "select", options: [["up", "Higher"], ["down", "Lower"]] }, { k: "unit", label: "Unit", type: "select", options: [["$", "$"], ["%", "%"], ["#", "count"], ["h", "hours"]] }];
    const a = $("#addKpi"); if (a) a.onclick = () => recordModal({ title: "Add goal", res: "kpis", fields: KF, done: () => views.performance(el) });
    $$("[data-kpi]", el).forEach((b) => (b.onclick = () => recordModal({ title: "Edit goal", res: "kpis", fields: KF.slice(1), rec: d.kpis.find((k) => k.metric === b.dataset.kpi), done: () => views.performance(el) })));
  };

  /* ================= AI assistant ================= */
  views.ai = async (el) => {
    el.innerHTML = header("✨ AI assistant", S.ai ? `Powered by Claude (${esc(S.aiModel)}). It reads your live numbers; it never changes anything by itself.` : "Not switched on yet.") +
      (S.ai ? "" : `<div class="notice" style="margin-bottom:16px"><strong>To turn on AI:</strong> add an <code>ANTHROPIC_API_KEY</code> setting to the server (get one at console.anthropic.com) and restart it. Everything else in the portal works without it, and the dashboard still shows automatic insights.</div>`) + `
      <div class="grid g2">
        <div class="card stack"><h2>Ask about your business</h2><p class="sub">Questions are answered from your sales, customers, stock and staffing data.</p>
          <div class="row">${["What should I promote next week?", "Are we overstaffed at any time?", "Which items should I raise the price of?", "How can I grow repeat visits?"].map((q) => `<button class="btn light sm" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
          <textarea id="aiQ" rows="3" placeholder="Type your own question…"></textarea><div class="row"><button class="btn ai" id="askBtn">Ask</button></div><div id="askOut"></div></div>
        <div class="card stack"><h2>Weekly briefing</h2><p class="sub">A plain-English summary with three things to do this week.</p><button class="btn ai" id="briefBtn2">Write my briefing</button><div id="briefOut2"></div></div>
        <div class="card stack"><h2>Marketing helper</h2><label class="field">What do you want to achieve?<input type="text" id="mkGoal" placeholder="e.g. Fill the quiet 3pm hour with a pie-and-coffee deal"></label>
          <div class="form-grid"><label class="field">Who for?<input type="text" id="mkAud" placeholder="Locals, tourists, students…"></label><label class="field">Where?<select id="mkCh"><option>Facebook post</option><option>Instagram caption</option><option>Email newsletter</option><option>Counter sign / chalkboard</option><option>Local newspaper ad</option></select></label></div>
          <button class="btn ai" id="mkBtn">Write it</button><div id="mkOut"></div></div>
        <div class="card stack"><h2>Other AI helpers in the portal</h2><ul class="small" style="margin:0;padding-left:18px;line-height:1.9">
          <li><a href="#/website/text">Edit website → Page text</a>: "Rewrite with AI" on every field</li><li><a href="#/website/menu">Menu</a>: ✨ writes dish descriptions in the café's voice</li>
          <li><a href="#/inbox">Inbox</a>: drafts friendly replies to customers</li><li><a href="#/team/reviews">Team → Reviews</a>: drafts fair staff reviews from real numbers</li><li><a href="#/dashboard">Dashboard</a>: one-click weekly briefing</li></ul></div>
      </div>`;
    const out = (id, text) => ($(id).innerHTML = `<div class="ai-out">${esc(text)}</div>`);
    $$("[data-q]", el).forEach((b) => (b.onclick = () => { $("#aiQ").value = b.dataset.q; $("#askBtn").click(); }));
    $("#askBtn").onclick = (e) => busy(e.currentTarget, async () => out("#askOut", (await post("/ai/question", { question: $("#aiQ").value, days: S.days })).text));
    $("#briefBtn2").onclick = (e) => busy(e.currentTarget, async () => out("#briefOut2", (await post("/ai/briefing", { days: S.days })).text));
    $("#mkBtn").onclick = (e) => busy(e.currentTarget, async () => { if (!$("#mkGoal").value.trim()) throw new Error("Describe what you want to achieve."); out("#mkOut", (await post("/ai/marketing", { goal: $("#mkGoal").value, audience: $("#mkAud").value, channel: $("#mkCh").value })).text); });
  };

  /* ================= Settings ================= */
  views.settings = async (el) => {
    const demo = await get("/demo").catch(() => ({ loaded: false }));
    el.innerHTML = header("Settings") + `<div class="grid g2">
      <form class="card stack" id="pwForm"><h2>Change your password</h2>
        <label class="field">Current password<input type="password" name="current" required autocomplete="current-password"></label>
        <label class="field">New password <span class="hint">At least 10 characters</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
        <button class="btn">Update password</button></form>
      ${can("manager") ? `<div class="card stack"><h2>Download your data</h2><p class="sub">Spreadsheet (CSV) files you can open in Excel or Google Sheets.</p><div class="row">${[["customers", "Customers"], ["sales", "Sales"], ["menu", "Menu"], ["inventory", "Stock"], ["expenses", "Expenses"], ["shifts", "Shifts"], ["messages", "Messages"], ["newsletter", "Newsletter list"]].map(([k, l]) => `<button class="btn light sm" data-exp="${k}">${l}</button>`).join("")}</div></div>` : ""}
      ${can("owner") ? `<div class="card span2" id="usersCard"><div class="row"><h2>Team logins</h2><span class="spacer"></span><button class="btn gold sm" id="addUser">+ Invite someone</button></div><p class="sub">Owner: everything. Manager: website, stock, money, team. Staff: sales, customers, inbox.</p><div id="users">Loading…</div></div>
      <div class="card stack"><h2>Sample data</h2><p class="small">${demo.loaded ? "Sample sales, customers and stock are loaded so you can explore. Remove them before you start using the portal for real." : "Load four months of realistic sample sales, customers, stock and shifts to explore the dashboards. Everything is marked (Demo) and can be removed."}</p>
        <div>${demo.loaded ? `<button class="btn danger" id="demoRm">Remove sample data</button>` : `<button class="btn light" id="demoLoad">Load sample data</button>`}</div></div>` : ""}
      ${can("manager") ? `<div class="card ${can("owner") ? "" : "span2"}"><h2>Activity log</h2><p class="sub">Who changed what, most recent first.</p><div id="audit" class="small" style="max-height:300px;overflow:auto">Loading…</div></div>` : ""}
      </div>`;
    $("#pwForm").onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { await post("/me/password", formData(e.target)); e.target.reset(); toast("Password updated."); }); };
    $$("[data-exp]", el).forEach((b) => (b.onclick = () => download("/export/" + b.dataset.exp)));
    if (can("manager")) get("/audit").then((r) => { $("#audit").innerHTML = r.rows.map((a) => `<div>${dt(a.created_at)} · <strong>${esc(a.user_name || "system")}</strong> ${esc(a.action)} ${esc(a.entity)}${a.entity_id ? " #" + esc(a.entity_id) : ""}</div>`).join("") || "Nothing yet."; });
    if (!can("owner")) return;
    const loadUsers = async () => {
      const { rows } = await get("/users");
      $("#users").innerHTML = `<table class="t"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th></th></tr></thead><tbody>${rows.map((u) => `<tr data-id="${u.id}"><td>${esc(u.name)}${u.active ? "" : ' <span class="pill bad">disabled</span>'}</td><td>${esc(u.email)}</td><td><select data-role ${u.id === S.user.id ? "disabled" : ""} style="width:auto">${["owner", "manager", "staff"].map((r) => `<option ${u.role === r ? "selected" : ""}>${r}</option>`).join("")}</select></td><td class="small">${ago(u.last_login_at)}</td>
        <td class="row">${u.id === S.user.id ? "<span class='small muted'>you</span>" : `<button class="icon-btn" data-reset>Reset password</button><button class="icon-btn" data-toggle>${u.active ? "Disable" : "Enable"}</button>`}</td></tr>`).join("")}</tbody></table>`;
      $$("#users tr[data-id]").forEach((tr) => {
        const id = tr.dataset.id, u = rows.find((x) => x.id == id);
        const role = $("[data-role]", tr); role.onchange = () => busy(null, async () => { await put("/users/" + id, { role: role.value }); toast("Role updated."); });
        const tg = $("[data-toggle]", tr); if (tg) tg.onclick = () => busy(tg, async () => { await put("/users/" + id, { active: !u.active }); loadUsers(); });
        const rs = $("[data-reset]", tr); if (rs) rs.onclick = () => {
          const m = modal(`<h2>Reset password for ${esc(u.name)}</h2><label class="field">New password<input type="text" id="np" minlength="10" value="${esc(suggestPassword())}"></label><p class="small muted">Share it with them privately; they can change it under Settings.</p><div class="actions"><button class="btn light" data-close>Cancel</button><button class="btn" id="npSave">Set password</button></div>`);
          $("#npSave", m.el).onclick = (e) => busy(e.currentTarget, async () => { await put("/users/" + id, { password: $("#np", m.el).value }); m.close(); toast("Password reset."); });
        };
      });
    };
    loadUsers();
    $("#addUser").onclick = () => {
      const m = modal(`<h2>Invite someone</h2><form class="form-grid" id="uForm"><label class="field">Name<input type="text" name="name" required></label><label class="field">Email<input type="email" name="email" required></label>
        <label class="field">Role<select name="role"><option value="staff">Staff</option><option value="manager">Manager</option><option value="owner">Owner</option></select></label><label class="field">Temporary password<input type="text" name="password" value="${esc(suggestPassword())}" minlength="10" required></label></form>
        <p class="small muted">Send them the admin address (${esc(location.origin + location.pathname)}), their email and this password.</p><div class="actions"><button class="btn light" data-close>Cancel</button><button class="btn" id="uSave">Create login</button></div>`);
      $("#uSave", m.el).onclick = (e) => busy(e.currentTarget, async () => { const f = $("#uForm", m.el); if (!f.reportValidity()) return; await post("/users", formData(f)); m.close(); toast("Login created."); loadUsers(); });
    };
    const dl = $("#demoLoad"); if (dl) dl.onclick = (e) => busy(e.currentTarget, async () => { await post("/demo/load"); toast("Sample data loaded."); location.hash = "#/dashboard"; });
    const dr = $("#demoRm"); if (dr) dr.onclick = async (e) => { if (await confirmBox("Remove all sample data, including all recorded sales, shifts and website visit stats?", "Remove sample data")) busy(e.target, async () => { await post("/demo/remove"); toast("Sample data removed."); views.settings(el); }); };
  };
  function suggestPassword() {
    const words = ["maple", "kettle", "reuben", "cariboo", "pie", "latte", "fraser", "biscuit", "quesnel", "mocha", "spruce", "gravy"];
    const a = new Uint32Array(3); crypto.getRandomValues(a);
    return `${words[a[0] % words.length]}-${words[a[1] % words.length]}-${1000 + (a[2] % 9000)}`;
  }

  /* ================= Boot ================= */
  async function boot() {
    try {
      const me = await get("/me");
      S.user = me.user; S.ai = me.aiEnabled; S.aiModel = me.aiModel;
    } catch (_) { return renderLogin(); }
    renderShell();
    refreshUnread();
    route();
  }
  window.addEventListener("hashchange", route);
  setInterval(() => { if (S.user && !document.hidden) refreshUnread(); }, 60000);
  boot();
})();
