/* Granville's Coffee — public site behaviour. No animation anywhere.
   Content comes from content.js and, when the Granville's server is running, from the database
   through /api/public/site (everything editable in the Admin Portal). */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const API = (document.querySelector('meta[name="granvilles-api"]')?.content || "api").replace(/\/$/, "");
  const C = JSON.parse(JSON.stringify(window.GRANVILLES_DEFAULTS || {}));
  const TZ = "America/Vancouver";
  let apiOnline = false;

  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
    });
    kids.flat().forEach((k) => k != null && n.append(k));
    return n;
  };
  // Allow only <br>, <em>, <strong> in rich headings edited from the admin portal.
  function safeRich(text) {
    const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return esc.replace(/&lt;(\/?)(br|em|strong)\s*\/?&gt;/gi, "<$1$2>");
  }
  const safeUrl = (u) => typeof u === "string" && /^(https:\/\/|\/|uploads\/|assets\/)/.test(u) ? u : "";
  // A photo that fails to load is replaced by a plain tile so the layout never breaks.
  function photo(src, alt, fallback) {
    const url = safeUrl(src);
    if (!url) return el("div", { class: "noimg", "aria-hidden": "true", text: fallback || "☕" });
    const img = el("img", { src: url, alt: alt || "", loading: "lazy", width: "900", height: "600" });
    img.addEventListener("error", () => img.replaceWith(el("div", { class: "noimg", "aria-hidden": "true", text: fallback || "☕" })), { once: true });
    return img;
  }
  const todayName = () => new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: TZ }).format(new Date());

  /* ---------- Bigger text (remembered on this device) ---------- */
  const sizeBtn = $("#textSize");
  function syncSize() {
    const big = document.documentElement.classList.contains("big");
    if (sizeBtn) { sizeBtn.setAttribute("aria-pressed", String(big)); sizeBtn.textContent = big ? "A− Normal text" : "A+ Bigger text"; }
  }
  if (sizeBtn) sizeBtn.addEventListener("click", () => {
    const big = document.documentElement.classList.toggle("big");
    try { localStorage.setItem("granvilles-big", big ? "1" : "0"); } catch (_) { /* private mode */ }
    syncSize();
  });
  syncSize();

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
  const yearsOpen = $("#yearsOpen");
  if (yearsOpen) yearsOpen.textContent = String(new Date().getFullYear() - 1992);

  /* ---------- Editable text, contact details, hours ---------- */
  function renderText() {
    const T = C.text || {};
    $$("[data-content]").forEach((n) => {
      const v = T[n.dataset.content];
      if (typeof v !== "string" || !v.trim()) return;
      if (n.hasAttribute("data-rich")) n.innerHTML = safeRich(v); else n.textContent = v;
    });
  }
  function renderSettings() {
    const s = C.settings || {};
    $$("[data-setting]").forEach((n) => { const v = s[n.dataset.setting]; if (v) n.textContent = v; });
    if (s.phone) {
      const tel = "tel:" + (s.phone.replace(/[^\d+]/g, "").length === 10 ? "+1" : "") + s.phone.replace(/[^\d+]/g, "");
      $$("[data-setting-tel]").forEach((a) => (a.href = tel));
    }
    if (s.email) {
      $$('[data-setting-link="email"]').forEach((a) => { a.textContent = s.email; a.href = "mailto:" + s.email; });
      $$(".email-line").forEach((n) => (n.hidden = false));
    }
    const maps = $("#mapsLink");
    if (maps && /^https:\/\//.test(s.mapsUrl || "")) maps.href = s.mapsUrl;
    // Find us in one tap: directions, a text message to yourself, or copy the address.
    const addr = s.address || "383 Reid Street, Quesnel, BC V2J 2M5";
    const dir = $("#dirLink");
    if (dir) dir.href = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent("Granville's Coffee, " + addr);
    const sms = $("#smsLink");
    if (sms) sms.href = "sms:?&body=" + encodeURIComponent("Granville's Coffee\n" + addr + "\n" + (/^https:\/\//.test(s.mapsUrl || "") ? s.mapsUrl : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Granville's Coffee " + addr)));
  }
  (function copyAddress() {
    const btn = $("#copyAddress"), status = $("#copyStatus");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const addr = "Granville's Coffee, " + ((C.settings && C.settings.address) || "383 Reid Street, Quesnel, BC V2J 2M5");
      try { await navigator.clipboard.writeText(addr); status.textContent = "Copied. Paste it into your map or a message."; }
      catch (_) { status.textContent = addr; }
    });
  })();
  const span = (h) => (h.closed ? "Closed" : (h.open || "?") + " – " + (h.close || "?"));
  function renderHours() {
    const H = Array.isArray(C.hours) ? C.hours : [];
    const today = todayName();
    const list = $("#hoursList");
    if (list) {
      list.replaceChildren();
      if (!H.length) list.append(el("li", {}, el("span", { text: "Please call for today's hours" })));
      H.forEach((h) => list.append(el("li", { class: h.day === today ? "is-today" : null }, el("span", { text: h.day + (h.day === today ? " (today)" : "") }), el("span", { text: span(h) }))));
    }
    const t = $("#todayHours");
    if (t) { const h = H.find((x) => x.day === today); t.textContent = h ? (h.closed ? "Closed today" : span(h)) : "Call to check"; }
    // Footer: group days with the same hours ("Monday to Saturday: …").
    $$("[data-hours-short]").forEach((ul) => {
      if (!H.length) return;
      const groups = [];
      H.forEach((h) => { const g = groups[groups.length - 1]; if (g && g.text === span(h)) g.days.push(h.day); else groups.push({ text: span(h), days: [h.day] }); });
      ul.replaceChildren(...groups.map((g) => el("li", { text: (g.days.length > 1 ? g.days[0].slice(0, 3) + " to " + g.days[g.days.length - 1].slice(0, 3) : g.days[0]) + ": " + g.text })));
    });
  }

  /* ---------- Home page ---------- */
  function renderQuotes() {
    const box = $("#quotes");
    if (!box || !Array.isArray(C.stories) || !C.stories.length) return;
    box.replaceChildren(...C.stories.slice(0, 3).map((s) => el("blockquote", { class: "quote" }, el("p", { text: s.line }), s.caption ? el("cite", { text: s.caption }) : null)));
  }

  /* ---------- Menu page ---------- */
  function renderMenu() {
    const body = $("#menuBody");
    if (!body || !Array.isArray(C.menu)) return;
    const jump = $("#menuJump");
    if (jump) jump.replaceChildren(...C.menu.map((c) => el("a", { href: "#" + c.slug }, (c.emoji ? c.emoji + " " : "") + stripEmoji(c.label, c.emoji))));
    body.replaceChildren(...C.menu.map((c) => el("section", { class: "menu-cat", id: c.slug, "aria-labelledby": "h-" + c.slug },
      el("div", { class: "menu-cat-head" },
        el("div", {}, el("h2", { id: "h-" + c.slug, text: stripEmoji(c.label, c.emoji) }), c.title ? el("p", { text: c.title }) : null),
        el("a", { href: "#main", class: "small" }, "Back to top ↑")),
      el("div", { class: "dishes" }, (c.items || []).map((i) => el("article", { class: "dish" },
        photo(i.photo || c.photo, i.name, i.emoji || c.emoji),
        el("div", { class: "body" },
          el("h3", {}, el("span", { text: i.name }), i.price != null && i.price !== "" ? el("span", { class: "price", text: "$" + Number(i.price).toFixed(2) }) : null),
          i.description ? el("p", { text: i.description }) : null)))))));
    // Arriving from a home-page tile (menu.html#coffee): jump to the section once it exists.
    const target = !jumped && location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (target) { jumped = true; target.scrollIntoView(); }
  }
  let jumped = false;
  function stripEmoji(label, emoji) {
    label = String(label || "");
    return emoji && label.startsWith(emoji) ? label.slice(emoji.length).trim() : label;
  }
  const printBtn = $("#printMenu");
  if (printBtn) printBtn.addEventListener("click", () => window.print());

  /* ---------- Our Story ---------- */
  function renderStory() {
    const tl = $("#timeline");
    if (tl && Array.isArray(C.timeline) && C.timeline.length) {
      tl.replaceChildren(...C.timeline.map((t) => el("li", {}, el("span", { class: "yr", text: t.year }), el("h3", { text: t.title }), t.text ? el("p", { text: t.text }) : null)));
    }
    const grid = $("#insideGrid");
    if (grid && Array.isArray(C.gallery) && C.gallery.length) {
      grid.replaceChildren(...C.gallery.filter((g) => safeUrl(g.src)).map((g) => el("figure", { class: "photo-frame" },
        el("img", { src: safeUrl(g.src), alt: g.alt || g.title || "", loading: "lazy" }),
        el("figcaption", {}, g.title ? el("strong", { text: g.title }) : null, g.caption || ""))));
    }
    const frame = $("#tedPortrait");
    if (frame && safeUrl(C.tedPhoto)) {
      const first = frame.firstElementChild;
      const img = el("img", { src: safeUrl(C.tedPhoto), alt: "Ted Martindale, owner of Granville's Coffee", loading: "lazy" });
      first.replaceWith(img);
    }
  }

  /* ---------- Awards: the Wall of Honour ---------- */
  const STAMP = { confirmed: "Confirmed", pending: "Pending", milestone: "Milestone" };
  function renderAwards() {
    const wall = $("#wall");
    if (!wall || !Array.isArray(C.awards)) return;
    const plaques = C.awards.map((a) => {
      const st = STAMP[a.status] ? a.status : "confirmed";
      const src = a.source ? el("p", { class: "src" }, "Source: ", safeUrl(a.sourceUrl) ? el("a", { href: a.sourceUrl, rel: "noopener", target: "_blank", text: a.source }) : a.source) : null;
      return el("article", { class: "plaque" + (st === "milestone" ? " milestone" : "") }, el("div", { class: "plaque-in" },
        el("span", { class: "yr", text: a.year || "" }), el("span", { class: "stamp " + st, text: STAMP[st] }),
        el("h3", { text: a.title || "" }), a.from ? el("div", { class: "from", text: a.from }) : null,
        a.text ? el("p", { text: a.text }) : null, src));
    });
    plaques.push(el("article", { class: "plaque blank" }, el("div", { class: "plaque-in" },
      el("span", { class: "yr", text: "Your turn" }), el("h3", { text: "Did we miss one?" }),
      el("p", {}, "If you know of an award, a write-up or a proud moment that belongs on this wall, tell us at the counter or ", el("a", { href: "visit.html#contactForm", text: "send us a message" }), ". Ted won't mention it himself."))));
    wall.replaceChildren(...plaques);
  }

  /* ---------- Visit: the Directions Desk ---------- */
  function renderDesk() {
    const desk = $("#desk");
    if (desk && Array.isArray(C.places)) {
      desk.replaceChildren(...C.places.map((p) => el("article", { class: "place" },
        el("h3", { text: p.name }), p.time ? el("span", { class: "time", text: "🕑 " + p.time }) : null,
        p.how ? el("p", { class: "how" }, el("strong", { text: "The sensible version: " }), p.how) : null,
        p.local ? el("p", { class: "local" }, el("span", { class: "sr-only", text: "What the regulars would say: " }), p.local) : null,
        el("a", { class: "btn line", href: "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent("383 Reid Street, Quesnel, BC") + "&destination=" + encodeURIComponent(p.query || p.name), rel: "noopener", target: "_blank" }, "🗺️ Directions from Granville's"))));
    }
  }

  /* ---------- Visit: from the highway, step by step ---------- */
  function renderHighway() {
    const box = $("#highwaySteps");
    if (!box || !Array.isArray(C.fromHighway)) return;
    box.replaceChildren(...C.fromHighway.map((r) => el("article", { class: "route" },
      el("h3", { text: r.from || "" }),
      el("ol", {}, String(r.steps || "").split(/\n+/).map((t) => t.trim()).filter(Boolean).map((t) => el("li", { text: t }))),
      r.tip ? el("p", { class: "local", text: r.tip }) : null)));
  }

  /* ---------- Our Story: then and now (only pairs with permission) ---------- */
  function renderThenNow() {
    const wrap = $("#thenNow"), list = $("#thenNowList");
    if (!wrap || !list) return;
    const pairs = (Array.isArray(C.thenNow) ? C.thenNow : []).filter((t) => safeUrl(t.thenPhoto) && safeUrl(t.nowPhoto));
    wrap.hidden = !pairs.length;
    list.replaceChildren(...pairs.map((t) => el("article", { class: "pair" },
      t.title ? el("h3", { text: t.title }) : null,
      el("div", { class: "pair-photos" },
        el("figure", {}, photo(t.thenPhoto, (t.title || "Reid Street") + (t.thenYear ? ", " + t.thenYear : ", years ago"), "🏛️"), el("figcaption", { text: "Then" + (t.thenYear ? " · " + t.thenYear : "") })),
        el("figure", {}, photo(t.nowPhoto, (t.title || "Reid Street") + " today", "📷"), el("figcaption", { text: "Now" }))),
      t.caption ? el("p", { text: t.caption }) : null,
      t.credit ? el("p", { class: "small muted", text: t.credit }) : null)));
  }

  /* ---------- Home: live Google reviews (only when the server has a Google key) ---------- */
  function loadReviews() {
    const wrap = $("#reviews");
    if (!wrap) return;
    fetch(API + "/public/reviews", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => {
        if (!g || !Array.isArray(g.reviews) || !g.reviews.length) return;
        const stars = (n) => { const k = Math.max(0, Math.min(5, Math.floor(n))); return el("span", { class: "stars", role: "img", "aria-label": n + " out of 5 stars", text: "★".repeat(k) + "☆".repeat(5 - k) }); };
        const score = $("#reviewsScore");
        if (g.rating) score.replaceChildren(stars(g.rating), " " + g.rating.toFixed(1) + " out of 5 on Google, from " + g.count + " reviews");
        $("#reviewsList").replaceChildren(...g.reviews.map((r) => el("blockquote", { class: "review" },
          el("div", { class: "review-head" }, stars(r.rating || 0), r.when ? el("span", { class: "when", text: r.when }) : null),
          el("p", { text: r.text }),
          el("cite", {}, /^https:\/\//.test(r.authorUrl || "") ? el("a", { href: r.authorUrl, rel: "noopener", target: "_blank", text: r.author }) : r.author, " on Google"))));
        const more = $("#reviewsMore");
        if (/^https:\/\//.test(g.url || "")) more.href = g.url; else more.closest("p").hidden = true;
        wrap.hidden = false;
      })
      .catch(() => { /* no reviews: the section stays hidden */ });
  }

  /* ---------- Today's board: shown only on the day it was written ---------- */
  const todayIso = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ }).format(new Date());
  function renderBoard() {
    const b = C.board;
    const fresh = b && b.date === todayIso() && (b.soup || b.special || b.baking || b.note);
    $$("#todayBoard").forEach((box) => {
      box.hidden = !fresh;
      if (!fresh) return;
      $("#boardDate", box).textContent = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: TZ }).format(new Date());
      const rows = [["Soup of the day", b.soup], ["Today's special", b.special], ["Fresh from the oven", b.baking]].filter((r) => r[1]);
      $("#boardItems", box).replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));
      const note = $("#boardNote", box); note.hidden = !b.note; note.textContent = b.note || "";
    });
  }

  /* ---------- Faces of Granville's (only people who agreed, with a photo) ---------- */
  function renderFaces() {
    const grid = $("#facesGrid");
    if (!grid || !Array.isArray(C.faces) || !C.faces.length) return;
    const invite = grid.querySelector(".invite");
    const cards = C.faces.filter((f) => safeUrl(f.photo)).map((f) => el("article", { class: "face" },
      el("div", { class: "face-photo" }, photo(f.photo, "Photo of " + (f.name || "a Granville's regular"), "☕")),
      el("div", { class: "face-body" }, el("h3", { text: f.name || "" }), f.since ? el("span", { class: "since", text: f.since }) : null, f.line ? el("p", { text: f.line }) : null)));
    grid.replaceChildren(...cards, invite || "");
  }

  function renderAll() { renderText(); renderSettings(); renderHours(); renderBoard(); renderFaces(); renderQuotes(); renderMenu(); renderStory(); renderAwards(); renderDesk(); renderHighway(); renderThenNow(); }

  /* ---------- Contact form ---------- */
  (function contact() {
    const form = $("#contactForm"), status = $("#formStatus");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.newsletter = !!form.newsletter.checked;
      if (!data.name.trim() || !/^\S+@\S+\.\S+$/.test(data.email) || !data.message.trim()) {
        status.textContent = "Please add your name, a valid email and a message."; return;
      }
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true; status.textContent = "Sending…";
      try {
        if (!apiOnline) throw new Error("offline");
        const res = await fetch(API + "/public/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "failed");
        form.reset(); status.textContent = "Thank you. Your message reached the café, and we'll get back to you soon.";
      } catch (err) {
        const email = C.settings && C.settings.email;
        if (email) {
          window.location.href = "mailto:" + email + "?subject=" + encodeURIComponent("Message from " + data.name) + "&body=" + encodeURIComponent(data.message + "\n\n" + data.name + " <" + data.email + ">");
          status.textContent = "Opening your email app to send this message…";
        } else {
          const phone = (C.settings && C.settings.phone) || "250-992-3667";
          status.textContent = err.message !== "offline" && err.message !== "failed" ? err.message : "Our online form isn't connected right now. Please call " + phone + " or drop by 383 Reid Street.";
        }
      } finally { btn.disabled = false; }
    });
  })();

  /* ---------- Load live content from the database (if the server is running) ---------- */
  renderAll();
  const ctrl = "AbortController" in window ? new AbortController() : null;
  const timeout = setTimeout(() => ctrl && ctrl.abort(), 4000);
  fetch(API + "/public/site", { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: "application/json" } })
    .then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : null))
    .then((live) => {
      clearTimeout(timeout);
      if (!live) return;
      apiOnline = true;
      const staff = $("#staffLink"); if (staff) staff.hidden = false; // the admin only works where the server runs
      ["settings", "text"].forEach((k) => { if (live[k]) C[k] = Object.assign({}, C[k], live[k]); });
      ["menu", "hours", "stories", "awards", "timeline", "places", "gallery"].forEach((k) => { if (Array.isArray(live[k]) && live[k].length) C[k] = live[k]; });
      if (live.tedPhoto) C.tedPhoto = live.tedPhoto;
      if (Array.isArray(live.faces)) C.faces = live.faces;
      if (Array.isArray(live.fromHighway) && live.fromHighway.length) C.fromHighway = live.fromHighway;
      if (Array.isArray(live.thenNow)) C.thenNow = live.thenNow;
      if (live.board) C.board = live.board;
      renderAll();
      loadReviews();
      navigator.sendBeacon?.(API + "/public/track", new Blob([JSON.stringify({ path: location.pathname + location.hash, referrer: document.referrer.slice(0, 300) })], { type: "application/json" }));
    })
    .catch(() => clearTimeout(timeout));
})();
