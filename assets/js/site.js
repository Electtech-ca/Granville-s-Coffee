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

  /* ---------- The Bottom of the Cup: swirl, settle, read ---------- */
  (function oracle() {
    const canvas = $("#oracleCup"), btn = $("#oracleSwirl");
    if (!canvas || !btn || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const section = $("#oracle"), box = $("#oracleReading"), kicker = $("#oracleKicker"), nameEl = $("#oracleName"),
      textEl = $("#oracleText"), orderEl = $("#oracleOrder"), tally = $("#oracleTally");
    const FOUND_KEY = "granvilles-cup-symbols";
    const COUNT = window.matchMedia("(max-width: 700px)").matches ? 750 : 1300;
    const store = { get() { try { return JSON.parse(localStorage.getItem(FOUND_KEY) || "[]"); } catch (e) { return []; } },
      set(v) { try { localStorage.setItem(FOUND_KEY, JSON.stringify(v)); } catch (e) { /* private mode: the tally just won't persist */ } } };

    let size = 0, cx = 0, cy = 0, bowl = 0, cupLayer = null;
    let state = "rest", omega = 0, swirlUntil = 0, settleStart = 0, last = 0, lastPick = "", running = false;
    let gold = false, sparks = [];
    const grains = Array.from({ length: COUNT }, () => {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.92;
      return { a, r, x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, delay: Math.random() * 0.35, s: 0.7 + Math.random() * 1.5, shade: Math.random() };
    });

    function resize() {
      const w = canvas.getBoundingClientRect().width || 480, dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size = w; cx = cy = w / 2; bowl = w * 0.31;
      cupLayer = drawCup(w, dpr);
      grains.forEach((g) => { if (state === "rest" || state === "swirl") polar(g); });
      if (state === "shown") grains.forEach((g) => { g.x = cx + g.tx * bowl; g.y = cy + g.ty * bowl; });
      frame(performance.now(), true);
    }
    function polar(g) { g.x = cx + Math.cos(g.a) * g.r * bowl; g.y = cy + Math.sin(g.a) * g.r * bowl; }

    // The cup, seen from above: saucer, green-banded rim, cream bowl with a little sheen. Drawn once per resize.
    function drawCup(w, dpr) {
      const c = document.createElement("canvas"); c.width = w * dpr; c.height = w * dpr;
      const k = c.getContext("2d"); k.scale(dpr, dpr);
      const m = w / 2, b = w * 0.31;
      let g = k.createRadialGradient(m, m * 1.04, b * 1.2, m, m, m * 0.98);
      g.addColorStop(0, "#efe4cf"); g.addColorStop(0.75, "#d9c9ab"); g.addColorStop(1, "#b9a481");
      k.fillStyle = g; k.beginPath(); k.arc(m, m, m * 0.97, 0, Math.PI * 2); k.fill();           // saucer
      k.strokeStyle = "#14382e"; k.lineWidth = w * 0.012; k.beginPath(); k.arc(m, m, m * 0.9, 0, Math.PI * 2); k.stroke();
      k.save(); k.shadowColor = "#00000066"; k.shadowBlur = w * 0.05; k.shadowOffsetY = w * 0.015;
      k.fillStyle = "#f8f1e3"; k.beginPath(); k.arc(m, m, b * 1.22, 0, Math.PI * 2); k.fill(); k.restore();   // rim
      k.strokeStyle = "#14382e"; k.lineWidth = w * 0.022; k.beginPath(); k.arc(m, m, b * 1.15, 0, Math.PI * 2); k.stroke();
      k.strokeStyle = "#ffcb65"; k.lineWidth = w * 0.005; k.beginPath(); k.arc(m, m, b * 1.115, 0, Math.PI * 2); k.stroke();
      g = k.createRadialGradient(m - b * 0.25, m - b * 0.3, b * 0.1, m, m, b * 1.06);
      g.addColorStop(0, "#fffaf0"); g.addColorStop(0.7, "#efe3cb"); g.addColorStop(1, "#cdb894");
      k.fillStyle = g; k.beginPath(); k.arc(m, m, b * 1.06, 0, Math.PI * 2); k.fill();           // bowl
      k.fillStyle = "#6b412233"; k.beginPath(); k.arc(m, m, b * 1.06, 0, Math.PI * 2); k.arc(m, m, b * 0.96, 0, Math.PI * 2, true); k.fill(); // coffee ring
      k.save(); k.translate(m + b * 1.3, m + b * 0.1); k.rotate(0.15);                           // handle
      k.fillStyle = "#f8f1e3"; k.strokeStyle = "#14382e"; k.lineWidth = w * 0.01;
      k.beginPath(); k.ellipse(0, 0, b * 0.28, b * 0.13, 0, 0, Math.PI * 2); k.fill(); k.stroke(); k.restore();
      return c;
    }

    // Turn a symbol into target points by drawing it off-screen and sampling the inked pixels.
    function shapePoints(symbol, fallbackLetter) {
      const n = 220, off = document.createElement("canvas"); off.width = off.height = n;
      const k = off.getContext("2d", { willReadFrequently: true });
      const draw = (txt, font) => { k.clearRect(0, 0, n, n); k.font = font; k.textAlign = "center"; k.textBaseline = "middle"; k.fillStyle = "#000"; k.fillText(txt, n / 2, n / 2 + 8); };
      const sample = () => { const d = k.getImageData(0, 0, n, n).data, pts = []; for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) if (d[(y * n + x) * 4 + 3] > 110) pts.push([x, y]); return pts; };
      draw(symbol, `170px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`);
      let pts = sample();
      if (pts.length < 160) { draw(fallbackLetter, `900 190px Fraunces, Georgia, serif`); pts = sample(); }
      let minX = n, maxX = 0, minY = n, maxY = 0;
      pts.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
      const span = Math.max(maxX - minX, maxY - minY) || 1, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
      return pts.map(([x, y]) => [((x - mx) / span) * 1.3 + (Math.random() - 0.5) * 0.012, ((y - my) / span) * 1.3 + (Math.random() - 0.5) * 0.012]);
    }

    function pickReading() {
      const O = C.oracle || {}, list = (O.readings || []).filter((r) => r && r.name);
      if (O.legendary && Math.random() < 1 / Math.max(2, Number(O.odds) || 40)) return Object.assign({ legendary: true }, O.legendary);
      const pool = list.filter((r) => r.name !== lastPick);
      return (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))] || { symbol: "?", name: "The Mystery", reading: "The grounds are shy today." };
    }
    function luckyOrder() {
      const items = (C.menu || []).flatMap((c) => (c.items || []).filter((i) => i.visible !== false).map((i) => i.name)).filter(Boolean);
      return items.length ? items[Math.floor(Math.random() * items.length)] : "";
    }
    function updateTally(found) {
      const total = ((C.oracle || {}).readings || []).length;
      const n = found.filter((f) => f !== "legendary").length, hasGold = found.includes("legendary");
      tally.textContent = n >= total && total ? `All ${total} symbols found${hasGold ? ", plus the gold" : ""}. Ted owes you a high five.` :
        n ? `${n} of ${total} symbols found${hasGold ? " · gold struck!" : ""}` : `${total} symbols are hiding in this cup`;
    }

    let reading = null;
    function beginSwirl(strength) {
      if (state === "settling") return;
      reading = null; gold = false; section.classList.remove("is-legendary"); sparks = [];
      if (state === "shown") grains.forEach((g) => { const dx = g.x - cx, dy = g.y - cy; g.a = Math.atan2(dy, dx); g.r = Math.min(0.95, Math.hypot(dx, dy) / bowl); });
      state = "swirl"; omega = Math.max(omega, strength); swirlUntil = performance.now() + 1500;
      kicker.textContent = "Swirling…"; start();
    }
    function settle() {
      reading = pickReading(); lastPick = reading.name;
      const pts = shapePoints(reading.symbol || "?", (reading.name || "?").replace(/^The\s+/i, "").charAt(0));
      const shuffled = pts.sort(() => Math.random() - 0.5), use = Math.min(shuffled.length, Math.floor(COUNT * 0.78));
      grains.forEach((g, i) => {
        g.sx = g.x; g.sy = g.y;
        if (i < use) { g.tx = shuffled[i][0] * 0.62; g.ty = shuffled[i][1] * 0.62; g.edge = false; }
        else { const a = Math.random() * Math.PI * 2, r = 0.86 + Math.random() * 0.12; g.tx = Math.cos(a) * r; g.ty = Math.sin(a) * r; g.edge = true; }
      });
      gold = !!reading.legendary; state = "settling"; settleStart = performance.now();
      if (reduceMotion.matches) { grains.forEach((g) => { g.x = cx + g.tx * bowl; g.y = cy + g.ty * bowl; }); reveal(); }
    }
    function reveal() {
      state = "shown"; omega = 0; btn.disabled = false; btn.textContent = "Swirl again";
      const found = store.get(), key = reading.legendary ? "legendary" : reading.name;
      const isNew = !found.includes(key); if (isNew) { found.push(key); store.set(found); }
      updateTally(found);
      box.classList.remove("is-new"); void box.offsetWidth; box.classList.add("is-new");
      const total = ((C.oracle || {}).readings || []).length;
      kicker.textContent = reading.legendary ? `Once in a lifetime · about 1 in ${(C.oracle || {}).odds || 40} cups` : `${isNew ? "New symbol" : "Seen it before"} · ${total} hide in this cup`;
      nameEl.textContent = `${reading.symbol ? reading.symbol + " " : ""}${reading.name}`;
      textEl.textContent = reading.reading || "";
      const order = luckyOrder();
      orderEl.hidden = !order; orderEl.textContent = order ? `Lucky order today: ${order}` : "";
      if (gold) {
        section.classList.add("is-legendary");
        if (!reduceMotion.matches) for (let i = 0; i < 90; i++) { const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 220; sparks.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 }); }
      }
      start();
    }

    function frame(now, still) {
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      if (state === "swirl") {
        if (now > swirlUntil) omega *= Math.pow(0.18, dt);
        grains.forEach((g) => {
          g.a += omega * (1.25 - g.r * 0.55) * dt;
          g.r += ((0.62 + Math.min(omega, 10) / 30) + Math.sin(g.a * 3 + g.shade * 6) * 0.08 - g.r) * Math.min(1, dt * 2.5);
          polar(g);
        });
        if (now > swirlUntil && omega < 1.4) settle();
      } else if (state === "settling") {
        const t = (now - settleStart) / 1000;
        let doneAll = true;
        grains.forEach((g) => {
          const p = Math.min(1, Math.max(0, (t - g.delay) / 1.25)), e = 1 - Math.pow(1 - p, 3);
          if (p < 1) doneAll = false;
          const swirlBack = (1 - e) * 0.6;
          const tx = cx + g.tx * bowl, ty = cy + g.ty * bowl;
          const bx = g.sx + (tx - g.sx) * e, by = g.sy + (ty - g.sy) * e;
          const ang = swirlBack, dx = bx - cx, dy = by - cy;
          g.x = cx + dx * Math.cos(ang) - dy * Math.sin(ang); g.y = cy + dx * Math.sin(ang) + dy * Math.cos(ang);
        });
        if (doneAll) reveal();
      }
      ctx.clearRect(0, 0, size, size);
      if (cupLayer) ctx.drawImage(cupLayer, 0, 0, size, size);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, bowl * 1.05, 0, Math.PI * 2); ctx.clip();
      grains.forEach((g) => {
        const tone = gold && !g.edge ? (g.shade < 0.5 ? "#c8901f" : "#f3c64c") : (g.shade < 0.33 ? "#2b170b" : g.shade < 0.66 ? "#43260f" : "#5c3718");
        ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(g.x, g.y, g.s * size / 520, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
      if (sparks.length) {
        sparks.forEach((s) => { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.97; s.vy *= 0.97; s.life -= dt * 0.7; });
        sparks = sparks.filter((s) => s.life > 0);
        sparks.forEach((s) => { ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = "#ffe08a"; ctx.beginPath(); ctx.arc(s.x, s.y, 2.4 * size / 520, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
      }
      if (still) return;
      if (state === "swirl" || state === "settling" || sparks.length) requestAnimationFrame(frame);
      else running = false;
    }
    function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

    btn.addEventListener("click", () => {
      btn.disabled = true; btn.textContent = "Reading the grounds…";
      if (reduceMotion.matches) { beginSwirl(0); settle(); return; }
      beginSwirl(11);
    });

    // Draw circles on the cup to swirl it by hand; enough turning and the grounds settle on release.
    let dragging = false, prevAng = 0, turned = 0;
    const angleAt = (e) => { const r = canvas.getBoundingClientRect(); return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); };
    canvas.addEventListener("pointerdown", (e) => { if (state === "settling") return; dragging = true; turned = 0; prevAng = angleAt(e); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      let d = angleAt(e) - prevAng; prevAng += d;
      if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      turned += Math.abs(d);
      if (state !== "swirl") beginSwirl(0);
      omega = Math.min(14, omega + Math.abs(d) * 2.2); swirlUntil = performance.now() + 250;
    });
    const release = () => {
      if (!dragging) return; dragging = false;
      if (turned > Math.PI * 2.5) { btn.disabled = true; btn.textContent = "Reading the grounds…"; swirlUntil = performance.now() + 400; omega = Math.max(omega, 6); }
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);

    updateTally(store.get());
    document.addEventListener("granvilles:live", () => updateTally(store.get())); // readings edited in the admin
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas); else window.addEventListener("resize", resize);
    resize();
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
    $("#oracle")?.addEventListener("click", (e) => { if (e.target.closest("button")) stamp("game"); });

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
      ["settings", "text", "lists", "oracle"].forEach((k) => { if (live[k]) C[k] = Object.assign({}, C[k], live[k]); });
      ["menu", "hours", "stories", "gallery", "characters", "quest"].forEach((k) => { if (Array.isArray(live[k]) && live[k].length) C[k] = live[k]; });
      if (live.tedPhoto) C.tedPhoto = live.tedPhoto;
      renderAll();
      document.dispatchEvent(new Event("granvilles:live"));
      navigator.sendBeacon?.(API + "/public/track", new Blob([JSON.stringify({ path: location.pathname + location.hash, referrer: document.referrer.slice(0, 300) })], { type: "application/json" }));
    })
    .catch(() => clearTimeout(timeout));
})();
