/* Granville's Coffee — public site behaviour.
   Every interactive element on the page is wired here. Content comes from content.js and,
   when the Granville's server is running, from the database through /api/public/site. */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const API = (document.querySelector('meta[name="granvilles-api"]')?.content || "api").replace(/\/$/, "");
  const C = JSON.parse(JSON.stringify(window.GRANVILLES_DEFAULTS || {}));
  let apiOnline = false;

  const pick = (arr, old) => {
    const options = arr.filter((v) => v !== old);
    return (options.length ? options : arr)[Math.floor(Math.random() * (options.length || arr.length))];
  };

  // Allow only <br>, <em>, <strong> in rich headings edited from the admin portal.
  function safeRich(text) {
    const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return esc.replace(/&lt;(\/?)(br|em|strong)\s*\/?&gt;/gi, "<$1$2>");
  }

  /* ---------- Header navigation ---------- */
  const navToggle = $("#navToggle"), nav = $("#mainNav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) { nav.classList.remove("open"); navToggle.setAttribute("aria-expanded", "false"); }
    });
  }
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Hero carousel ---------- */
  (function carousel() {
    const root = $(".hero-carousel");
    if (!root) return;
    const track = $(".hero-slides", root);
    const slides = $$(".hero-slide", root);
    const dots = $$(".hero-dot", root);
    const pauseBtn = $(".hero-pause", root);
    if (!track || slides.length < 2) return;
    let index = 0, timer = null, userPaused = reduceMotion.matches, hoverPaused = false;
    const DELAY = 7000;

    function show(n) {
      index = (n + slides.length) % slides.length;
      track.style.transform = "translate3d(-" + index * 100 + "%,0,0)";
      slides.forEach((s, i) => {
        const hidden = i !== index;
        s.toggleAttribute("inert", hidden);
        s.setAttribute("aria-hidden", String(hidden));
      });
      dots.forEach((d, i) => { d.classList.toggle("is-active", i === index); d.setAttribute("aria-pressed", String(i === index)); });
      if (typeof fitHeight === "function") fitHeight();
    }
    const small = window.matchMedia("(max-width: 850px)");
    function fitHeight() { root.style.height = small.matches ? slides[index].offsetHeight + "px" : ""; }
    window.addEventListener("resize", fitHeight);
    window.addEventListener("load", fitHeight);
    function schedule() {
      clearInterval(timer); timer = null;
      if (!userPaused && !hoverPaused && !document.hidden) timer = setInterval(() => show(index + 1), DELAY);
    }
    function go(n) { show(n); schedule(); }
    function syncPause() {
      pauseBtn.textContent = userPaused ? "Play slideshow" : "Pause slideshow";
      pauseBtn.setAttribute("aria-pressed", String(userPaused));
    }
    $(".hero-prev", root).addEventListener("click", () => go(index - 1));
    $(".hero-next", root).addEventListener("click", () => go(index + 1));
    dots.forEach((d, i) => d.addEventListener("click", () => go(i)));
    pauseBtn.addEventListener("click", () => { userPaused = !userPaused; syncPause(); schedule(); });
    root.addEventListener("mouseenter", () => { hoverPaused = true; schedule(); });
    root.addEventListener("mouseleave", () => { hoverPaused = false; schedule(); });
    root.addEventListener("focusin", () => { hoverPaused = true; schedule(); });
    root.addEventListener("focusout", (e) => { if (!root.contains(e.relatedTarget)) { hoverPaused = false; schedule(); } });
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    });
    let startX = null;
    root.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
    root.addEventListener("touchend", (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
      startX = null;
    });
    document.addEventListener("visibilitychange", schedule);
    syncPause(); show(0); schedule();
  })();

  /* ---------- Live Quesnel clock ---------- */
  (function clock() {
    const hands = ["clock-hour", "clock-minute", "clock-second"].map((id) => document.getElementById(id));
    if (hands.some((h) => !h)) return;
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
    let frame = 0, last = -1, tick = null;
    function draw() {
      const now = new Date();
      const p = Object.fromEntries(fmt.formatToParts(now).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
      const s = p.second + (reduceMotion.matches ? 0 : now.getMilliseconds() / 1000);
      const m = p.minute + s / 60;
      const h = (p.hour % 12) + m / 60;
      [h * 30, m * 6, s * 6].forEach((a, i) => hands[i].setAttribute("transform", "rotate(" + a + " 250 250)"));
    }
    function loop(t) { if (t - last >= 30) { draw(); last = t; } frame = requestAnimationFrame(loop); }
    function start() {
      cancelAnimationFrame(frame); clearInterval(tick); draw();
      if (document.hidden) return;
      if (reduceMotion.matches) tick = setInterval(draw, 1000); else frame = requestAnimationFrame(loop);
    }
    document.addEventListener("visibilitychange", start);
    reduceMotion.addEventListener?.("change", start);
    start();
  })();

  /* ---------- Town stage stories ---------- */
  (function town() {
    const world = $("#town-world");
    if (!world) return;
    let i = 0;
    const line = $("#town-story"), caption = $("#town-caption"), bubbles = $$(".town-bubble", world);
    function next() {
      const stories = C.stories || [];
      if (!stories.length) return;
      i = (i + 1) % stories.length;
      const st = stories[i];
      line.textContent = st.line;
      caption.textContent = st.caption || "";
      bubbles.forEach((b, n) => { if (st.bubbles && st.bubbles[n]) b.textContent = st.bubbles[n]; });
      world.classList.remove("town-party"); void world.offsetWidth; world.classList.add("town-party");
      setTimeout(() => world.classList.remove("town-party"), 1600);
    }
    $("#town-spin")?.addEventListener("click", next);
    $("#town-next")?.addEventListener("click", next);
  })();

  /* ---------- Characters & quest ---------- */
  (function people() {
    let round = 0;
    const speech = $("#character-speech");
    $$("[data-character]").forEach((btn) => btn.addEventListener("click", () => {
      const n = Number(btn.dataset.character);
      round = (round + 1) % 3;
      $$("[data-character]").forEach((b) => { b.classList.toggle("selected", b === btn); b.setAttribute("aria-pressed", String(b === btn)); });
      const lines = C.characters || [];
      if (speech && lines[round]) {
        speech.textContent = "“" + lines[round][n] + "”";
        speech.style.animation = "none"; void speech.offsetWidth; speech.style.animation = "";
      }
    }));

    const q = $("#quest-question"), art = $("#quest-art"), choices = $("#quest-choices"), reaction = $("#quest-reaction"), progress = $("#quest-progress");
    if (!q || !choices) return;
    let step = 0, score = 0;
    function render() {
      const steps = C.quest || [];
      if (step >= steps.length) {
        progress.textContent = "QUEST COMPLETE · " + steps.length + " OF " + steps.length;
        art.textContent = "🏆";
        q.textContent = "Congratulations. You are now unofficially from Quesnel.";
        reaction.textContent = "Your reward: " + (score >= 2 ? "the title of Honorary Keeper of Excellent Nonsense." : "one imaginary biscuit and a genuine invitation to visit.") + " No online order required.";
        choices.replaceChildren();
        return;
      }
      const cur = steps[step];
      progress.textContent = "CHAPTER " + (step + 1) + " OF " + steps.length;
      art.textContent = cur.art; q.textContent = cur.q; reaction.textContent = "";
      choices.replaceChildren();
      cur.choices.forEach((answer, n) => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = answer;
        b.addEventListener("click", () => {
          score += n;
          reaction.textContent = cur.reactions[n];
          const nextBtn = document.createElement("button");
          nextBtn.type = "button";
          nextBtn.textContent = step === steps.length - 1 ? "🎉 See your ending" : "→ Continue the story";
          nextBtn.addEventListener("click", () => { step++; render(); q.focus?.(); });
          choices.replaceChildren(nextBtn);
          nextBtn.focus();
        });
        choices.appendChild(b);
      });
    }
    $("#quest-restart")?.addEventListener("click", () => { step = 0; score = 0; render(); });
    render();
  })();

  /* ---------- Menu ---------- */
  const menu = (function () {
    const tabsEl = $("#menu-tabs"), grid = $("#menu-items"), stage = $("#menu-spotlight");
    const title = $("#spotlight-title"), joke = $("#spotlight-joke"), emoji = $("#spotlight-emoji"), label = $("#spotlight-label"), price = $("#spotlight-price");
    let current = null, index = 0;
    const cats = () => (C.menu || []).filter((c) => c.items && c.items.length);
    const money = (v) => (v === null || v === undefined || v === "" ? "" : "$" + Number(v).toFixed(2));
    function spotlight(i) {
      const c = cats().find((x) => x.slug === current);
      if (!c) return;
      index = (i + c.items.length) % c.items.length;
      const it = c.items[index];
      title.textContent = it.name; joke.textContent = it.description || ""; emoji.textContent = it.emoji || c.emoji || "☕";
      label.textContent = c.title || c.label; price.textContent = money(it.price);
      stage.classList.remove("menu-bounce"); void stage.offsetWidth; stage.classList.add("menu-bounce");
      $$(".menu-dish", grid).forEach((el, n) => el.setAttribute("aria-current", String(n === index)));
    }
    function select(slug) {
      current = slug; index = 0;
      $$(".menu-tab", tabsEl).forEach((t) => { const on = t.dataset.category === slug; t.classList.toggle("active", on); t.setAttribute("aria-pressed", String(on)); });
      grid.replaceChildren();
      const c = cats().find((x) => x.slug === slug);
      if (!c) return;
      c.items.forEach((it, i) => {
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "menu-dish";
        const n = document.createElement("strong"); n.textContent = it.name + (it.price != null && it.price !== "" ? " · " + money(it.price) : "");
        const d = document.createElement("span"); d.textContent = it.description || "";
        btn.append(n, d);
        btn.addEventListener("click", () => { spotlight(i); if (window.innerWidth < 800) stage.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" }); });
        grid.append(btn);
      });
      spotlight(0);
    }
    function render() {
      if (!tabsEl || !grid) return;
      tabsEl.replaceChildren();
      const list = cats();
      list.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "menu-tab"; b.dataset.category = c.slug; b.textContent = c.label;
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", () => select(c.slug));
        tabsEl.append(b);
      });
      if (list.length) select(list.some((c) => c.slug === current) ? current : list[0].slug);
    }
    $("#spotlight-next")?.addEventListener("click", () => spotlight(index + 1));
    return { render };
  })();

  /* ---------- Games ---------- */
  function bindPicker(btnId, outId, key) {
    $("#" + btnId)?.addEventListener("click", () => {
      const out = $("#" + outId), arr = (C.lists && C.lists[key]) || [];
      if (out && arr.length) out.textContent = pick(arr, out.textContent);
    });
  }
  bindPicker("directions", "directionsResult", "directions");
  bindPicker("rumour", "rumourResult", "rumours");
  bindPicker("local", "localResult", "locals");

  (function bunGame() {
    const stage = $("#stage"), bun = $("#bun"), start = $("#start"), scoreEl = $("#score"), timerEl = $("#timer"), msg = $("#bunMessage");
    if (!stage || !bun || !start) return;
    let active = false, score = 0, remaining = 15, interval = null;
    function moveBun() {
      const x = Math.max(0, stage.clientWidth - bun.offsetWidth - 8), y = Math.max(0, stage.clientHeight - bun.offsetHeight - 8);
      bun.style.left = Math.round(Math.random() * x) + "px";
      bun.style.top = Math.round(Math.random() * y) + "px";
    }
    function stop() {
      active = false; clearInterval(interval); interval = null; start.textContent = "Try again ↻";
      msg.textContent = score >= 10 ? "The bun fears you. Please use your powers responsibly." : score >= 5 ? "Respectable bun-catching. No certificate will be issued." : "The bun won. We suggest a rematch over coffee.";
    }
    start.addEventListener("click", () => {
      clearInterval(interval); active = true; score = 0; remaining = 15;
      scoreEl.textContent = "Caught: 0"; timerEl.textContent = "Time: 15s";
      msg.textContent = "Catch it before it gets away!"; start.textContent = "Restart ↻";
      moveBun();
      interval = setInterval(() => { remaining--; timerEl.textContent = "Time: " + remaining + "s"; if (remaining <= 0) stop(); }, 1000);
    });
    bun.addEventListener("click", () => {
      if (!active) { msg.textContent = "Press Start first. Even buns have rules."; return; }
      score++; scoreEl.textContent = "Caught: " + score; moveBun();
    });
  })();

  (function fitness() {
    const q = $("#fitnessQuestion"), r = $("#fitnessResult"), b = $("#fitnessNext");
    if (!q || !r || !b) return;
    let i = 0, done = false;
    const label = "Submit suspiciously confident answer →";
    b.addEventListener("click", () => {
      const F = C.fitness || { questions: [], responses: [] };
      if (done) { done = false; i = 0; q.textContent = F.questions[0]; r.textContent = ""; b.textContent = label; return; }
      i++;
      if (i < F.questions.length) { q.textContent = F.questions[i]; r.textContent = F.responses[i - 1] || ""; }
      else { q.textContent = "Examination complete!"; r.textContent = F.verdict; b.textContent = "Retake this nonsense ↻"; done = true; }
    });
  })();

  /* ---------- Journey ribbon & passport ---------- */
  (function journey() {
    const stamps = new Set(), pop = $("#journey-pop"), counter = $("#journey-stamps");
    let popTimer = 0;
    function announce(message) {
      if (!pop) return;
      pop.textContent = message; pop.classList.add("show");
      clearTimeout(popTimer); popTimer = setTimeout(() => pop.classList.remove("show"), 3800);
    }
    function stamp(key) {
      if (stamps.has(key)) return;
      stamps.add(key);
      if (counter) counter.textContent = stamps.size + " / 3 stamps";
      const left = 3 - stamps.size;
      announce(left === 0 ? "🎓 Congratulations! Your diploma is imaginary. Your welcome is real." : "✨ Passport stamped! " + left + " more adventure" + (left === 1 ? "" : "s") + " to go.");
    }
    $$(".journey-stop").forEach((b) => b.addEventListener("click", () => {
      document.getElementById(b.dataset.jump)?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
    }));
    $("#menu-theatre")?.addEventListener("click", (e) => { if (e.target.closest("button")) stamp("menu"); });
    $("#town-stage")?.addEventListener("click", (e) => { if (e.target.closest("button")) stamp("friends"); });
    $("#games")?.addEventListener("click", (e) => { if (e.target.closest("button")) stamp("game"); });

    if (!("IntersectionObserver" in window)) return;
    const ids = ["town-stage", "people", "menu-theatre", "ted", "games", "visit"];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const btn = $('.journey-stop[data-jump="' + entry.target.id + '"]');
        if (btn) { $$(".journey-stop").forEach((b) => b.removeAttribute("aria-current")); btn.setAttribute("aria-current", "step"); }
      });
    }, { rootMargin: "-10% 0px -55% 0px" });
    ids.map((id) => document.getElementById(id)).filter(Boolean).forEach((s) => obs.observe(s));
  })();

  /* ---------- Scroll reveal ---------- */
  if ("IntersectionObserver" in window) {
    const ro = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("show"); ro.unobserve(e.target); } }), { threshold: 0.1 });
    $$(".reveal").forEach((el) => ro.observe(el));
  } else {
    $$(".reveal").forEach((el) => el.classList.add("show"));
  }

  /* ---------- Settings, hours, editable text ---------- */
  function renderSettings() {
    const s = C.settings || {};
    $$("[data-setting]").forEach((el) => { const v = s[el.dataset.setting]; if (v) el.textContent = v; });
    const phone = $('[data-setting-link="phone"]'), email = $('[data-setting-link="email"]');
    if (phone && s.phone) { phone.textContent = s.phone; phone.href = "tel:" + s.phone.replace(/[^\d+]/g, ""); $("#phoneLine").hidden = false; }
    if (email && s.email) { email.textContent = s.email; email.href = "mailto:" + s.email; $("#emailLine").hidden = false; }
    if (s.mapsUrl && /^https:\/\//.test(s.mapsUrl)) $("#mapsLink").href = s.mapsUrl;
    if (s.menuListingUrl && /^https:\/\//.test(s.menuListingUrl)) $("#menuListingLink").href = s.menuListingUrl;
    const list = $("#hoursList");
    if (list && Array.isArray(C.hours) && C.hours.length) {
      list.replaceChildren();
      C.hours.forEach((h) => {
        const li = document.createElement("li");
        const d = document.createElement("span"); d.textContent = h.day;
        const t = document.createElement("span"); t.textContent = h.closed ? "Closed" : (h.open || "?") + " – " + (h.close || "?");
        li.append(d, t); list.append(li);
      });
    }
    if (C.tedPhoto && /^(https:\/\/|\/|uploads\/|assets\/)/.test(C.tedPhoto)) {
      const frame = $("#tedPortrait");
      const img = document.createElement("img");
      img.src = C.tedPhoto; img.alt = "Ted Martindale, owner of Granville's Coffee"; img.loading = "lazy";
      frame.replaceChildren(img);
      const lbl = $("#tedPortraitLabel"); if (lbl) lbl.textContent = "Ted Martindale";
    }
  }
  function renderText() {
    const T = C.text || {};
    $$("[data-content]").forEach((el) => {
      const v = T[el.dataset.content];
      if (typeof v !== "string" || !v.trim()) return;
      if (el.hasAttribute("data-rich")) el.innerHTML = safeRich(v); else el.textContent = v;
    });
  }
  function renderGallery() {
    const grid = $("#inside-grid");
    if (!grid || !Array.isArray(C.gallery) || !C.gallery.length) return;
    grid.replaceChildren();
    C.gallery.forEach((g) => {
      if (!g.src) return;
      const f = document.createElement("figure");
      const img = document.createElement("img");
      img.src = g.src; img.alt = g.alt || g.title || ""; img.loading = "lazy";
      const cap = document.createElement("figcaption");
      const st = document.createElement("strong"); st.textContent = g.title || "";
      cap.append(st, document.createTextNode(g.caption || ""));
      f.append(img, cap); grid.append(f);
    });
  }
  function renderAll() { renderText(); renderSettings(); renderGallery(); menu.render(); }

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
        form.reset(); status.textContent = "Thanks! Your message reached the café. We'll get back to you soon.";
      } catch (err) {
        const email = C.settings && C.settings.email;
        if (email) {
          window.location.href = "mailto:" + email + "?subject=" + encodeURIComponent("Message from " + data.name) + "&body=" + encodeURIComponent(data.message + "\n\n" + data.name + " <" + data.email + ">");
          status.textContent = "Opening your email app to send this message…";
        } else {
          status.textContent = err.message !== "offline" && err.message !== "failed" ? err.message : "Our online form isn't connected right now. Please drop by 383 Reid Street, we'd love to hear it in person.";
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
      ["settings", "text", "lists", "fitness"].forEach((k) => { if (live[k]) C[k] = Object.assign({}, C[k], live[k]); });
      ["menu", "hours", "stories", "gallery", "characters", "quest"].forEach((k) => { if (Array.isArray(live[k]) && live[k].length) C[k] = live[k]; });
      if (live.tedPhoto) C.tedPhoto = live.tedPhoto;
      renderAll();
      navigator.sendBeacon?.(API + "/public/track", new Blob([JSON.stringify({ path: location.pathname + location.hash, referrer: document.referrer.slice(0, 300) })], { type: "application/json" }));
    })
    .catch(() => clearTimeout(timeout));
})();
