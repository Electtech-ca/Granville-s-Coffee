import * as config from '../../config.js';
import { LocalStore, REWARD_POINTS, REWARD_VALUE } from './store-local.js';

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n || 0).toFixed(2);
const fmtDate = d => new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDateTime = d => new Date(d).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const safeImg = s => /^(https:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/.test(s || '') ? s : '';
const artSrc = a => `assets/img/${/^[a-z]+$/.test(a || '') ? a : 'latte'}.svg`;
const ARTS = ['latte', 'iced', 'tea', 'croissant', 'muffin', 'bar', 'sandwich', 'toast', 'soup'];
const STATUSES = ['new', 'preparing', 'ready', 'completed', 'cancelled'];
const statusBadge = s => `<span class="badge ${{ new: 'warn', preparing: 'warn', ready: 'ok', completed: 'dark', cancelled: 'bad' }[s] || ''}">${esc(s)}</span>`;
const img = (p, attrs = '') => `<img src="${esc(safeImg(p.image_url) || artSrc(p.art))}" alt="${esc(p.name)}" loading="lazy" ${attrs} onerror="this.onerror=null;this.src='${artSrc(p.art)}'">`;
const TIERS = [{ name: 'Bean', min: 0, perk: 'Earn 1 point per dollar' }, { name: 'Roast', min: 100, perk: 'Birthday treat + early access to new menu items' }, { name: 'Reserve', min: 300, perk: 'Members-only tastings and seasonal gifts' }];
const tierFor = spend => [...TIERS].reverse().find(t => spend >= t.min);

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', 4200);
}
function download(name, text, type = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csv = rows => rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
const formData = f => Object.fromEntries(new FormData(f).entries());

// Shrinks an uploaded photo so it fits comfortably in the database.
function compressImage(file, max = 1000) {
  return new Promise((res, rej) => {
    if (!file.type.startsWith('image/')) return rej(Error('Please choose an image file'));
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', .8));
      };
      im.onerror = () => rej(Error('Could not read that image'));
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

// ---------- state ----------
let store;
const state = { pub: { settings: {}, products: [], promos: [] }, user: null, cart: {}, receipt: null, authTab: 'in', menuCat: 'All', editing: null, orderFilter: 'open', loyalty: null };
try { state.cart = JSON.parse(localStorage.getItem('gv_cart')) || {}; } catch { }
const saveCart = () => { try { localStorage.setItem('gv_cart', JSON.stringify(state.cart)); } catch { } updateHeader(); };
const product = id => state.pub.products.find(p => p.id === id);
const cartLines = () => Object.entries(state.cart).map(([id, q]) => ({ p: product(id), q })).filter(l => l.p && l.q > 0);
const cartCount = () => cartLines().reduce((a, l) => a + l.q, 0);

async function refreshData() {
  state.pub = await store.loadPublic();
  state.user = await store.currentUser();
  for (const id of Object.keys(state.cart)) if (!product(id)) delete state.cart[id];
  updateHeader(); updateChrome();
}

function updateHeader() {
  const n = cartCount(), c = $('#cartCount');
  c.textContent = n; c.hidden = !n;
  const u = state.user;
  $('#accountBtn').textContent = u ? (u.role === 'admin' ? 'Account' : u.full_name?.split(' ')[0] || 'Account') : 'Sign in';
  $('#adminLink').hidden = u?.role !== 'admin';
}

function hoursRows(s) {
  return (s.hours || '').split('\n').filter(Boolean).map(l => { const [d, t] = l.split('|'); return [d, t || '']; });
}

function updateChrome() {
  const s = state.pub.settings;
  const a = $('#announce'); a.textContent = s.announcement || ''; a.hidden = !s.announcement;
  $('#footAddress').textContent = s.address || '';
  $('#footHours').innerHTML = hoursRows(s).map(([d, t]) => `<div>${esc(d)}<br><strong>${esc(t)}</strong></div>`).join('<div style="height:8px"></div>');
  $('#footSocial').innerHTML = [['Instagram', s.instagram], ['Facebook', s.facebook]].filter(([, u]) => /^https:\/\//.test(u || '')).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n} ↗</a>`).join('')
    + (s.phone ? `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a>` : '') + (s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '');
  $('#year').textContent = new Date().getFullYear();
  $('#modeNote').textContent = store.mode === 'cloud'
    ? 'Demonstration site connected to a shared cloud database. Online orders are not charged.'
    : 'Demonstration site. Data is stored in this browser. Online orders are not charged and are not sent to the café.';
}

// ---------- components ----------
function productCard(p) {
  const q = state.cart[p.id] || 0, out = p.stock < 1;
  const stock = out ? '<span class="badge bad">Sold out</span>' : p.stock < 10 ? `<span class="badge warn">Only ${p.stock} left</span>` : '';
  const ctl = out ? '' : q
    ? `<div class="stepper"><button data-act="dec" data-id="${esc(p.id)}" aria-label="Remove one ${esc(p.name)}">−</button><span>${q}</span><button data-act="inc" data-id="${esc(p.id)}" aria-label="Add one ${esc(p.name)}">+</button></div>`
    : `<button class="btn sm" data-act="inc" data-id="${esc(p.id)}">Add +</button>`;
  return `<article class="card" data-cat="${esc(p.category)}" data-name="${esc((p.name + ' ' + p.description).toLowerCase())}">
    <div class="ph">${img(p)}</div>
    <div class="body"><div class="row"><div class="eyebrow" style="margin:0">${esc(p.category)}</div>${stock}</div>
    <h3 style="margin-top:6px">${esc(p.name)}</h3><p>${esc(p.description)}</p>
    <div class="row"><span class="price">${money(p.price)}</span>${ctl}</div></div></article>`;
}

function heroStyle(s) {
  const src = safeImg(s.hero_image);
  return `background-image:${src ? `url('${esc(src.replace(/['()\\]/g, ''))}'),` : ''}url('assets/img/hero.svg')`;
}

const newsletter = () => `<form class="newsletter" data-form="subscribe"><label class="sr-only" for="nl">Email</label><input id="nl" name="email" type="email" required placeholder="you@example.com"><button class="btn gold">Subscribe</button></form>`;

// ---------- pages ----------
const pages = {
  home() {
    const s = state.pub.settings, featured = state.pub.products.filter(p => p.featured).slice(0, 8);
    return `
    <section class="hero" style="${heroStyle(s)}"><div>
      <div class="eyebrow">A Quesnel Original · British Columbia</div>
      <h1>${esc(s.hero_title)}</h1><p>${esc(s.hero_text)}</p>
      <div class="actions"><a class="btn gold" href="#/order">Order ahead</a><a class="btn ghost" href="#/menu">Explore the menu</a></div>
    </div></section>
    <div class="wrap" style="padding-top:0;padding-bottom:0"><div class="features">
      <div class="feature"><div class="ico">☕</div><h3>Crafted with care</h3><p class="muted">Espresso pulled to order, house-made syrups and drip brewed fresh all day.</p></div>
      <div class="feature"><div class="ico">🥐</div><h3>Baked every morning</h3><p class="muted">Croissants, muffins and cinnamon buns from our ovens, plus a hearty kitchen menu.</p></div>
      <div class="feature"><div class="ico">★</div><h3>Rewards that add up</h3><p class="muted">Earn a point for every dollar and turn ${REWARD_POINTS} points into ${money(REWARD_VALUE)} off.</p></div>
    </div></div>
    <section class="wrap">
      <div class="row" style="align-items:end;flex-wrap:wrap"><div><div class="eyebrow">Freshly made · Thoughtfully served</div><h2>Guest favourites</h2></div><a class="btn ghost" href="#/menu">Full menu →</a></div>
      <div class="grid" style="margin-top:28px">${featured.map(productCard).join('') || '<p class="muted">Menu coming soon.</p>'}</div>
    </section>
    <section class="wrap" style="padding-top:0"><div class="two">
      <div><div class="eyebrow">Our story</div><h2>Coffee, conversation and community.</h2><p class="lead">${esc(s.story_text)}</p><a class="btn" href="#/story">Read our story</a></div>
      <div class="media"><img src="https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=900" alt="A cappuccino on a café table" loading="lazy" onerror="this.onerror=null;this.src='assets/img/latte.svg'"></div>
    </div></section>
    <section class="wrap" style="padding-top:0"><div class="rewards">
      <div><div class="eyebrow">Granville's Rewards</div><h2>Every visit counts.</h2><p style="opacity:.85">Join free, earn a point for every dollar you spend, unlock member-only offers and see your full order history.</p>
      <a class="btn gold" href="#/account">${state.user ? 'View my rewards' : 'Join for free'}</a></div>
      <div class="tiers">${TIERS.map(t => `<div class="tier"><strong>${t.name}</strong> <small style="opacity:.7">· from ${money(t.min)} spent</small><div style="opacity:.85;font-size:14px">${t.perk}</div></div>`).join('')}</div>
    </div></section>
    ${visitBand()}
    <section class="wrap center"><div class="eyebrow">Stay in the loop</div><h2>News, specials and events</h2><p class="lead" style="margin:0 auto 22px">One friendly email when there is something worth sharing. Unsubscribe anytime.</p><div style="display:flex;justify-content:center">${newsletter()}</div></section>`;
  },

  menu() {
    const cats = ['All', ...new Set(state.pub.products.map(p => p.category))];
    if (!cats.includes(state.menuCat)) state.menuCat = 'All';
    return `<section class="page-hero"><div class="eyebrow">Freshly made · Thoughtfully served</div><h1>The Menu</h1><p>Add items to your order and pick them up at the counter. Prices in CAD.</p></section>
    <section class="wrap tight">
      <div class="toolbar"><label class="sr-only" for="menuSearch">Search the menu</label><input id="menuSearch" type="search" placeholder="Search the menu…" data-input="menuSearch">
      ${cartCount() ? `<a class="btn gold" href="#/order" style="margin-left:auto">View order (${cartCount()}) →</a>` : ''}</div>
      <div class="chips">${cats.map(c => `<button class="chip ${c === state.menuCat ? 'on' : ''}" data-act="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="grid" id="menuGrid">${state.pub.products.map(productCard).join('')}</div>
      <p class="empty" id="menuEmpty" hidden>Nothing matches your search.</p>
      <p class="muted center" style="margin-top:30px"><small>Please tell our team about allergies. Menu items and prices may change.</small></p>
    </section>`;
  },

  async order() {
    if (state.receipt) {
      const r = state.receipt;
      return `<section class="wrap" style="max-width:640px"><div class="receipt">
        <div class="eyebrow">Order confirmed</div><div class="num">${esc(r.order_number)}</div>
        <p>Thanks, ${esc(r.name)}! Your order total is <strong>${money(r.total)}</strong>${r.discount > 0 ? ` (you saved ${money(r.discount)})` : ''}.</p>
        ${r.points ? `<p><span class="badge ok">+${r.points} loyalty points</span></p>` : ''}
        <p class="muted">Show this number at the counter. This is a demonstration: no payment was taken and the café has not been notified.</p>
        <div class="row" style="justify-content:center;flex-wrap:wrap"><a class="btn" href="#/menu" data-act="clearReceipt">Order something else</a>${state.user ? '<a class="btn ghost" href="#/account">My orders</a>' : ''}</div>
      </div></section>`;
    }
    const lines = cartLines();
    if (!lines.length) return `<section class="page-hero"><h1>Your order</h1><p>Order ahead and skip the line.</p></section>
      <section class="wrap center"><p class="lead" style="margin:0 auto 20px">Your basket is empty.</p><a class="btn" href="#/menu">Browse the menu</a></section>`;
    const u = state.user;
    if (u) { try { state.loyalty = await store.myLoyalty(); } catch { state.loyalty = null; } }
    const canRedeem = u && state.loyalty?.points >= REWARD_POINTS;
    return `<section class="page-hero"><h1>Your order</h1><p>Review your basket and choose a pickup name.</p></section>
    <section class="wrap tight"><div class="split">
      <div class="panel"><h3>Basket</h3>
        ${lines.map(({ p, q }) => `<div class="line">${img(p)}<div><strong>${esc(p.name)}</strong><div class="muted" style="font-size:14px">${money(p.price)} each</div></div>
        <div style="text-align:right"><div class="stepper"><button data-act="dec" data-id="${esc(p.id)}" aria-label="Remove one">−</button><span>${q}</span><button data-act="inc" data-id="${esc(p.id)}" aria-label="Add one">+</button></div><div style="margin-top:6px;font-weight:600">${money(p.price * q)}</div></div></div>`).join('')}
        <div style="margin-top:14px"><a href="#/menu">+ Add more items</a></div>
      </div>
      <form class="panel" data-form="checkout">
        <h3>Pickup details</h3>
        <label>Pickup name<input name="name" required maxlength="100" value="${esc(u?.full_name || '')}" autocomplete="name"></label>
        <label>Email for loyalty points ${u ? '' : '(optional)'}<input name="email" type="email" value="${esc(u?.email || '')}" ${u ? 'readonly' : ''} autocomplete="email" placeholder="you@example.com"></label>
        <label>Discount code<input name="coupon" data-input="coupon" placeholder="e.g. WELCOME10" autocomplete="off"></label>
        ${canRedeem ? `<label class="check"><input type="checkbox" name="redeem" data-input="coupon">Redeem ${REWARD_POINTS} points for ${money(REWARD_VALUE)} off (you have ${state.loyalty.points})</label>` : u ? `<p class="muted" style="font-size:14px">You have ${state.loyalty?.points || 0} points. Rewards unlock at ${REWARD_POINTS}.</p>` : `<p class="muted" style="font-size:14px"><a href="#/account">Sign in or join</a> to earn and redeem rewards.</p>`}
        <div class="totals" id="totals"></div>
        <button class="btn gold" style="width:100%;margin-top:16px" id="placeBtn">Place order</button>
        <p class="muted center" style="font-size:13px;margin:12px 0 0">No payment is collected. This is a demonstration ordering experience.</p>
      </form>
    </div></section>`;
  },

  story() {
    const s = state.pub.settings;
    return `<section class="page-hero"><div class="eyebrow">Our story</div><h1>Rooted in Quesnel.</h1><p>${esc(s.story_text)}</p></section>
    <section class="wrap"><div class="two">
      <div><h2>More than a coffee shop.</h2>${esc(s.story_long).split(/\n+/).map(p => `<p class="lead">${p}</p>`).join('')}</div>
      <div class="media"><img src="https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=900" alt="Coffee being poured" loading="lazy" onerror="this.onerror=null;this.src='assets/img/hero.svg'"></div>
    </div></section>
    <section class="wrap" style="padding-top:0"><div class="grid">
      <div class="panel"><div class="eyebrow">Community</div><h3>A place to gather</h3><p class="muted">Friends, families, students and neighbours: everyone has a seat at our tables.</p></div>
      <div class="panel"><div class="eyebrow">Craft</div><h3>Done properly</h3><p class="muted">Carefully chosen beans, dialled-in espresso and baking that starts before sunrise.</p></div>
      <div class="panel"><div class="eyebrow">Comfort</div><h3>Warm welcome</h3><p class="muted">A cozy downtown spot that feels like home on the coldest Cariboo morning.</p></div>
    </div><div class="center" style="margin-top:40px"><a class="btn gold" href="#/visit">Come visit us</a></div></section>`;
  },

  rewards() {
    const member = state.pub.promos.filter(p => p.members_only);
    return `<section class="page-hero"><div class="eyebrow">Granville's Rewards</div><h1>Sip. Earn. Repeat.</h1><p>Free to join. A point for every dollar, rewards you can actually use, and perks that grow with you.</p></section>
    <section class="wrap"><div class="grid">
      <div class="panel"><div class="eyebrow">1 · Join</div><h3>Create a free account</h3><p class="muted">Sign up in under a minute with your name and email.</p></div>
      <div class="panel"><div class="eyebrow">2 · Earn</div><h3>1 point per $1</h3><p class="muted">Points are added automatically every time you order while signed in.</p></div>
      <div class="panel"><div class="eyebrow">3 · Redeem</div><h3>${REWARD_POINTS} points = ${money(REWARD_VALUE)} off</h3><p class="muted">Tick "redeem" at checkout once you have enough points.</p></div>
    </div></section>
    <section class="wrap" style="padding-top:0"><div class="rewards"><div><h2>Member tiers</h2><p style="opacity:.85">Your tier is based on what you've spent with us. Higher tiers unlock bigger perks.</p>
      ${member.length ? `<p style="margin-top:20px"><strong>Members-only offers right now:</strong></p>${member.map(p => `<span class="badge" style="margin-right:6px">${esc(p.code)} · ${p.percent}% off</span>`).join('')}` : ''}
      <p style="margin-top:24px"><a class="btn gold" href="#/account">${state.user ? 'View my rewards' : 'Join for free'}</a></p></div>
      <div class="tiers">${TIERS.map(t => `<div class="tier"><strong>${t.name}</strong> <small style="opacity:.7">· from ${money(t.min)} spent</small><div style="opacity:.85;font-size:14px">${t.perk}</div></div>`).join('')}</div></div></section>`;
  },

  visit() {
    const s = state.pub.settings;
    return `<section class="page-hero"><div class="eyebrow">Visit &amp; contact</div><h1>Come say hello.</h1><p>${esc(s.address)}</p></section>
    ${visitBand(true)}
    <section class="wrap"><div class="two" style="align-items:start">
      <div><div class="eyebrow">Get in touch</div><h2>Questions, catering or feedback?</h2><p class="lead">Send us a note and our team will get back to you.</p>
        ${s.phone ? `<p><strong>Phone:</strong> <a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a></p>` : ''}
        ${s.email ? `<p><strong>Email:</strong> <a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p>` : ''}</div>
      <form class="panel" data-form="contact">
        <div class="form-grid"><label>Your name<input name="name" required maxlength="100" value="${esc(state.user?.full_name || '')}"></label><label>Email<input name="email" type="email" required value="${esc(state.user?.email || '')}"></label></div>
        <label>Topic<select name="subject"><option>General</option><option>Catering</option><option>Events &amp; bookings</option><option>Feedback</option><option>Careers</option></select></label>
        <label>Message<textarea name="body" required maxlength="4000"></textarea></label>
        <button class="btn">Send message</button>
      </form>
    </div></section>`;
  },

  async account() {
    const u = state.user;
    if (!u) {
      const up = state.authTab === 'up';
      return `<section class="page-hero"><div class="eyebrow">Members</div><h1>${up ? 'Join Granville\'s Rewards' : 'Welcome back'}</h1><p>${up ? 'Earn points, unlock offers and track your orders.' : 'Sign in to your member or staff account.'}</p></section>
      <section class="wrap tight"><div class="auth-box panel">
        <div class="tabs" role="tablist"><button class="${up ? '' : 'on'}" data-act="authTab" data-tab="in" role="tab">Sign in</button><button class="${up ? 'on' : ''}" data-act="authTab" data-tab="up" role="tab">Create account</button></div>
        ${up ? `<form data-form="signup">
          <label>Full name<input name="full_name" required maxlength="100" autocomplete="name"></label>
          <label>Email<input name="email" type="email" required autocomplete="email"></label>
          <label>Phone (optional)<input name="phone" type="tel" autocomplete="tel"></label>
          <label>Password<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
          <button class="btn gold" style="width:100%">Create my account</button></form>`
        : `<form data-form="signin">
          <label>Email<input name="email" type="email" required autocomplete="username"></label>
          <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
          <button class="btn" style="width:100%">Sign in</button></form>`}
      </div></section>`;
    }
    const [loy, orders] = await Promise.all([store.myLoyalty(), store.myOrders()]);
    const tier = tierFor(loy.spend), next = TIERS[TIERS.indexOf(tier) + 1];
    const progress = Math.min(100, (loy.points % REWARD_POINTS) / REWARD_POINTS * 100);
    const member = state.pub.promos.filter(p => p.members_only);
    return `<section class="wrap tight">
      <div class="row" style="flex-wrap:wrap;margin-bottom:24px"><div><div class="eyebrow">My account</div><h2 style="margin:0">Hi, ${esc(u.full_name || u.email)}</h2></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${u.role === 'admin' ? '<a class="btn gold" href="#/admin">Open admin portal</a>' : ''}<button class="btn ghost" data-act="signOut">Sign out</button></div></div>
      <div class="split">
        <div class="stack">
          <div class="loyalty"><div class="row"><div><div class="eyebrow">${tier.name} member</div><div class="pts">${loy.points}</div><div style="opacity:.8">points available</div></div><img src="assets/img/logo.svg" alt="" width="64" height="64"></div>
            <div class="bar"><i style="width:${progress}%"></i></div>
            <small style="opacity:.8">${loy.points >= REWARD_POINTS ? `You can redeem ${Math.floor(loy.points / REWARD_POINTS)} reward${loy.points >= 2 * REWARD_POINTS ? 's' : ''} at checkout!` : `${REWARD_POINTS - loy.points} points until your next ${money(REWARD_VALUE)} reward`}${next ? ` · ${money(next.min - loy.spend)} more spend to reach ${next.name}` : ''}</small></div>
          <div class="stats"><div class="stat"><small>Visits</small><b>${loy.visits}</b></div><div class="stat"><small>Total spent</small><b>${money(loy.spend)}</b></div><div class="stat"><small>Member since</small><b style="font-size:1.2rem">${u.created_at ? fmtDate(u.created_at) : '—'}</b></div></div>
          ${member.length ? `<div class="panel"><h3>Your member offers</h3>${member.map(p => `<div class="row" style="padding:6px 0"><span><strong>${esc(p.code)}</strong> · ${p.percent}% off your order</span><button class="btn sm light" data-act="copy" data-text="${esc(p.code)}">Copy code</button></div>`).join('')}</div>` : ''}
          <div class="panel"><h3>Order history</h3>${orders.length ? `<div class="table-wrap" style="border:0"><table class="data"><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr>
            ${orders.map(o => `<tr><td><strong>${esc(o.order_number)}</strong></td><td>${fmtDate(o.created_at)}</td><td>${o.items.map(i => `${i.quantity}× ${esc(i.name)}`).join('<br>')}</td><td>${money(o.total)}</td><td>${statusBadge(o.status)}</td><td><button class="btn sm light" data-act="reorder" data-id="${esc(o.id)}">Reorder</button></td></tr>`).join('')}</table></div>`
            : '<p class="muted">No orders yet. <a href="#/menu">Start your first order</a>.</p>'}</div>
        </div>
        <div class="stack">
          <form class="panel" data-form="profile"><h3>Profile</h3>
            <label>Full name<input name="full_name" required value="${esc(u.full_name)}"></label>
            <label>Email<input value="${esc(u.email)}" readonly></label>
            <label>Phone<input name="phone" type="tel" value="${esc(u.phone || '')}"></label>
            <button class="btn">Save profile</button></form>
          <form class="panel" data-form="password"><h3>Change password</h3>
            <label>Current password<input name="current" type="password" required autocomplete="current-password"></label>
            <label>New password<input name="next" type="password" required minlength="8" autocomplete="new-password"></label>
            <button class="btn ghost">Update password</button></form>
        </div>
      </div></section>`;
  },

  async admin(sub) {
    const u = state.user;
    if (!u) { state.authTab = 'in'; toast('Please sign in with an administrator account'); location.hash = '#/account'; return ''; }
    if (u.role !== 'admin') return `<section class="wrap center"><h2>Staff only</h2><p class="lead" style="margin:0 auto 20px">Your account isn't authorized for the admin portal.</p><a class="btn" href="#/account">Back to my account</a></section>`;
    const tab = adminTabs[sub] ? sub : 'overview';
    const nav = [['overview', 'Overview'], ['orders', 'Orders'], ['products', 'Menu & Inventory'], ['content', 'Content & Media'], ['promos', 'Promotions'], ['customers', 'Customers (CRM)'], ['members', 'Members & Staff'], ['messages', 'Messages'], ['newsletter', 'Newsletter'], ['data', 'Data & Settings']];
    let body;
    try { body = await adminTabs[tab](); } catch (e) { body = `<div class="panel">Could not load: ${esc(e.message)}</div>`; }
    return `<div class="admin"><aside class="side"><div class="eyebrow">Executive portal</div>${nav.map(([k, l]) => `<a href="#/admin/${k}" class="${k === tab ? 'on' : ''}">${l}${k === 'messages' && state.unread ? `<span class="badge">${state.unread}</span>` : ''}</a>`).join('')}
      <div class="eyebrow" style="margin-top:20px">Site</div><a href="#/">View website ↗</a></aside><div class="admin-main">${body}</div></div>`;
  }
};

function visitBand(full = false) {
  const s = state.pub.settings;
  const q = encodeURIComponent(s.map_query || s.address || 'Quesnel BC');
  return `<section class="dark on-dark"><div class="wrap"><div class="two" style="align-items:stretch">
    <div><div class="eyebrow">Visit us</div><h2>${full ? 'Hours &amp; location' : 'Find your seat downtown.'}</h2><p class="muted">${esc(s.address)}</p>
      <table class="hours">${hoursRows(s).map(([d, t]) => `<tr><td>${esc(d)}</td><td>${esc(t)}</td></tr>`).join('')}</table>
      <p style="margin-top:22px"><a class="btn gold" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Get directions ↗</a></p></div>
    <iframe class="map" title="Map to Granville's Coffee" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${q}&output=embed"></iframe>
  </div></div></section>`;
}

// ---------- admin tabs ----------
function revenueChart(orders) {
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d; });
  const vals = days.map(d => orders.filter(o => o.status !== 'cancelled' && new Date(o.created_at) >= d && new Date(o.created_at) < new Date(d.getTime() + 86400000)).reduce((a, o) => a + o.total, 0));
  const max = Math.max(10, ...vals), W = 700, H = 220, bw = W / 14;
  return `<svg class="chart" viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="Revenue for the last 14 days">
    ${vals.map((v, i) => { const h = v / max * (H - 20); return `<rect x="${i * bw + 6}" y="${H - h}" width="${bw - 12}" height="${h}" rx="4" fill="${i === 13 ? '#d4ac70' : '#1b3d31'}"><title>${days[i].toDateString()}: ${money(v)}</title></rect>${v ? `<text x="${i * bw + bw / 2}" y="${H - h - 5}" text-anchor="middle">${Math.round(v)}</text>` : ''}`; }).join('')}
    ${days.map((d, i) => i % 2 ? '' : `<text x="${i * bw + bw / 2}" y="${H + 16}" text-anchor="middle">${d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</text>`).join('')}
  </svg>`;
}

const adminTabs = {
  async overview() {
    const [orders, products, members, messages] = await Promise.all([store.listOrders(), store.listProducts(), store.listMembers(), store.listMessages()]);
    const valid = orders.filter(o => o.status !== 'cancelled');
    const revenue = valid.reduce((a, o) => a + o.total, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayRev = valid.filter(o => new Date(o.created_at) >= today).reduce((a, o) => a + o.total, 0);
    const open = orders.filter(o => ['new', 'preparing', 'ready'].includes(o.status));
    const low = products.filter(p => p.active && p.stock < 10);
    const top = {}; valid.forEach(o => o.items.forEach(i => { const t = top[i.name] ||= { name: i.name, qty: 0, rev: 0 }; t.qty += i.quantity; t.rev += i.quantity * i.unit_price; }));
    state.unread = messages.filter(m => !m.read).length;
    return `<div class="eyebrow">Executive portal</div><h2>Overview</h2>
    <div class="stats k4" style="margin:20px 0"><div class="stat"><small>Total revenue</small><b>${money(revenue)}</b></div><div class="stat"><small>Today</small><b>${money(todayRev)}</b></div>
      <div class="stat"><small>Orders</small><b>${valid.length}</b></div><div class="stat"><small>Avg. order</small><b>${money(valid.length ? revenue / valid.length : 0)}</b></div>
      <div class="stat"><small>Open orders</small><b>${open.length}</b></div><div class="stat"><small>Members</small><b>${members.filter(m => m.role === 'member').length}</b></div>
      <div class="stat"><small>Low stock</small><b>${low.length}</b></div><div class="stat"><small>Unread messages</small><b>${state.unread}</b></div></div>
    <div class="panel" style="margin-bottom:20px"><div class="row"><h3 style="margin:0">Revenue · last 14 days</h3><span class="muted" style="font-size:13px">Demo orders only</span></div>${revenueChart(orders)}</div>
    <div class="split"><div class="panel"><h3>Top sellers</h3><table class="data"><tr><th>Item</th><th>Sold</th><th>Revenue</th></tr>${Object.values(top).sort((a, b) => b.rev - a.rev).slice(0, 8).map(t => `<tr><td>${esc(t.name)}</td><td>${t.qty}</td><td>${money(t.rev)}</td></tr>`).join('') || '<tr><td colspan="3">No sales yet</td></tr>'}</table></div>
      <div class="panel"><h3>Needs attention</h3>${open.length ? `<p><a href="#/admin/orders">${open.length} open order${open.length > 1 ? 's' : ''} →</a></p>` : ''}${state.unread ? `<p><a href="#/admin/messages">${state.unread} unread message${state.unread > 1 ? 's' : ''} →</a></p>` : ''}
        ${low.length ? `<p><strong>Low stock</strong></p>${low.map(p => `<div class="row" style="padding:4px 0"><span>${esc(p.name)}</span><span class="badge ${p.stock ? 'warn' : 'bad'}">${p.stock} left</span></div>`).join('')}` : '<p class="muted">Stock levels look good.</p>'}</div></div>`;
  },

  async orders() {
    const all = await store.listOrders(), f = state.orderFilter;
    const rows = all.filter(o => f === 'all' || (f === 'open' ? ['new', 'preparing', 'ready'].includes(o.status) : o.status === f));
    return `<div class="row" style="flex-wrap:wrap"><div><div class="eyebrow">Fulfilment</div><h2>Orders</h2></div><button class="btn light sm" data-act="exportOrders">Export CSV</button></div>
    <div class="chips">${['open', 'all', ...STATUSES].map(s => `<button class="chip ${s === f ? 'on' : ''}" data-act="orderFilter" data-f="${s}">${s[0].toUpperCase() + s.slice(1)} (${s === 'all' ? all.length : s === 'open' ? all.filter(o => ['new', 'preparing', 'ready'].includes(o.status)).length : all.filter(o => o.status === s).length})</button>`).join('')}</div>
    <div class="table-wrap"><table class="data"><tr><th>Order</th><th>Placed</th><th>Pickup</th><th>Items</th><th>Total</th><th>Status</th></tr>
    ${rows.map(o => `<tr><td><strong>${esc(o.order_number)}</strong></td><td>${fmtDateTime(o.created_at)}</td><td>${esc(o.pickup_name)}${o.email ? `<br><small class="muted">${esc(o.email)}</small>` : ''}${o.user_id ? ' <span class="badge">member</span>' : ''}</td>
      <td>${o.items.map(i => `${i.quantity}× ${esc(i.name)}`).join('<br>')}</td><td>${money(o.total)}${o.discount > 0 ? `<br><small class="muted">−${money(o.discount)}</small>` : ''}</td>
      <td><select data-change="orderStatus" data-id="${esc(o.id)}" aria-label="Order status">${STATUSES.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No orders in this view.</td></tr>'}</table></div>`;
  },

  async products() {
    const all = await store.listProducts();
    const cats = [...new Set(all.map(p => p.category))];
    const e = state.editing === 'new' ? { name: '', category: cats[0] || 'Coffee', price: '', stock: 0, description: '', image_url: '', art: 'latte', featured: false, active: true } : all.find(p => p.id === state.editing);
    const editor = e ? `<form class="panel editor" data-form="product" style="margin-bottom:20px"><input type="hidden" name="id" value="${esc(e.id || '')}">
      <div class="row"><h3 style="margin:0">${e.id ? 'Edit ' + esc(e.name) : 'New menu item'}</h3><button type="button" class="btn sm ghost" data-act="cancelEdit">Close</button></div><hr>
      <div class="form-grid"><label>Name<input name="name" required maxlength="80" value="${esc(e.name)}"></label>
        <label>Category<input name="category" required list="catList" value="${esc(e.category)}"><datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label>Price (CAD)<input name="price" type="number" min="0" step="0.01" required value="${e.price}"></label>
        <label>Stock<input name="stock" type="number" min="0" step="1" required value="${e.stock}"></label></div>
      <label>Description<textarea name="description" maxlength="300">${esc(e.description)}</textarea></label>
      <div class="form-grid"><div><label>Photo URL (https) or upload<input name="image_url" id="imgField" value="${esc(e.image_url)}" placeholder="https://…"></label>
        <label>Upload photo<input type="file" accept="image/*" data-change="upload" data-target="imgField" data-preview="imgPreview"></label></div>
        <div><img id="imgPreview" class="preview-img" src="${esc(safeImg(e.image_url) || artSrc(e.art))}" alt="Preview">
        <label>Fallback illustration<select name="art">${ARTS.map(a => `<option ${a === e.art ? 'selected' : ''}>${a}</option>`).join('')}</select></label></div></div>
      <label class="check"><input type="checkbox" name="featured" ${e.featured ? 'checked' : ''}>Feature on the homepage</label>
      <label class="check"><input type="checkbox" name="active" ${e.active ? 'checked' : ''}>Visible on the menu</label>
      <div class="row" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn">Save &amp; publish</button>${e.id ? `<button type="button" class="btn danger" data-act="deleteProduct" data-id="${esc(e.id)}">Delete item</button>` : ''}</div></form>` : '';
    return `<div class="row" style="flex-wrap:wrap"><div><div class="eyebrow">Catalogue</div><h2>Menu &amp; Inventory</h2></div><button class="btn gold" data-act="editProduct" data-id="new">+ Add item</button></div>
    <p class="muted">Changes publish to the website immediately.</p>${editor}
    <div class="table-wrap"><table class="data"><tr><th></th><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
    ${all.map(p => `<tr><td>${img(p, 'class="thumb"')}</td><td><strong>${esc(p.name)}</strong>${p.featured ? ' <span class="badge">featured</span>' : ''}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td>
      <td><div style="display:flex;gap:4px;align-items:center"><button class="btn icon light" data-act="stock" data-id="${esc(p.id)}" data-d="-1" aria-label="Decrease stock">−</button><strong style="min-width:34px;text-align:center">${p.stock}</strong><button class="btn icon light" data-act="stock" data-id="${esc(p.id)}" data-d="10" aria-label="Add 10 stock">+10</button></div></td>
      <td>${p.active ? (p.stock < 1 ? '<span class="badge bad">sold out</span>' : p.stock < 10 ? '<span class="badge warn">low</span>' : '<span class="badge ok">live</span>') : '<span class="badge">hidden</span>'}</td>
      <td style="white-space:nowrap"><button class="btn sm light" data-act="editProduct" data-id="${esc(p.id)}">Edit</button> <button class="btn sm ghost" data-act="toggleProduct" data-id="${esc(p.id)}">${p.active ? 'Hide' : 'Show'}</button></td></tr>`).join('')}</table></div>`;
  },

  async content() {
    const s = (await store.loadPublic()).settings;
    const f = (k, l, type = 'input', hint = '') => `<label>${l}${type === 'textarea' ? `<textarea name="${k}">${esc(s[k])}</textarea>` : `<input name="${k}" id="${k === 'hero_image' ? 'heroField' : ''}" value="${esc(s[k])}">`}${hint ? `<small class="muted" style="font-weight:400">${hint}</small>` : ''}</label>`;
    return `<div class="eyebrow">Content studio</div><h2>Content &amp; Media</h2><p class="muted">Edit the words and images visitors see. Changes publish instantly.</p>
    <form data-form="settings" class="stack">
      <div class="panel"><h3>Homepage</h3>${f('announcement', 'Announcement bar (leave empty to hide)')}${f('hero_title', 'Headline')}${f('hero_text', 'Introduction', 'textarea')}
        <div class="form-grid"><div>${f('hero_image', 'Hero image URL (https) or upload')}<label>Upload hero image<input type="file" accept="image/*" data-change="upload" data-target="heroField" data-preview="heroPreview" data-max="1800"></label></div>
        <img id="heroPreview" class="preview-img" src="${esc(safeImg(s.hero_image) || 'assets/img/hero.svg')}" alt="Hero preview"></div></div>
      <div class="panel"><h3>Our story</h3>${f('story_text', 'Short story (homepage)', 'textarea')}${f('story_long', 'Full story (Our Story page)', 'textarea')}</div>
      <div class="panel"><h3>Visit &amp; contact</h3><div class="form-grid">${f('address', 'Address')}${f('map_query', 'Map search text')}${f('phone', 'Phone (optional)')}${f('email', 'Public email (optional)')}${f('instagram', 'Instagram URL')}${f('facebook', 'Facebook URL')}</div>
        ${f('hours', 'Opening hours', 'textarea', 'One line per row, written as Day|Hours, e.g. Saturday|8:00 am – 4:00 pm')}</div>
      <button class="btn gold">Publish content</button>
    </form>`;
  },

  async promos() {
    const all = await store.listPromos();
    return `<div class="eyebrow">Marketing</div><h2>Promotions</h2>
    <div class="split"><div class="table-wrap"><table class="data"><tr><th>Code</th><th>Discount</th><th>Who</th><th>Status</th><th></th></tr>
      ${all.map(p => `<tr><td><strong>${esc(p.code)}</strong></td><td>${p.percent}%</td><td>${p.members_only ? 'Members only' : 'Everyone'}</td><td>${p.active ? '<span class="badge ok">active</span>' : '<span class="badge">paused</span>'}</td>
      <td style="white-space:nowrap"><button class="btn sm light" data-act="togglePromo" data-code="${esc(p.code)}">${p.active ? 'Pause' : 'Activate'}</button> <button class="btn sm ghost" data-act="deletePromo" data-code="${esc(p.code)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No promotions yet.</td></tr>'}</table></div>
    <form class="panel" data-form="promo"><h3>Create an offer</h3><label>Code<input name="code" required pattern="[A-Za-z0-9_\\-]{3,30}" placeholder="SPRING20"></label><label>Percent off<input name="percent" type="number" min="1" max="100" required></label>
      <label class="check"><input type="checkbox" name="members_only">Members only</label><button class="btn">Create offer</button></form></div>`;
  },

  async customers() {
    const all = (await store.listCustomers()).sort((a, b) => b.spend - a.spend);
    return `<div class="row" style="flex-wrap:wrap"><div><div class="eyebrow">CRM</div><h2>Customers</h2></div><button class="btn light sm" data-act="exportCustomers">Export CSV</button></div>
    <p class="muted">Everyone who left an email with an order. Restricted to administrators.</p>
    <div class="stats" style="margin-bottom:20px"><div class="stat"><small>Customers</small><b>${all.length}</b></div><div class="stat"><small>Lifetime spend</small><b>${money(all.reduce((a, c) => a + c.spend, 0))}</b></div><div class="stat"><small>Points outstanding</small><b>${all.reduce((a, c) => a + c.points, 0)}</b></div></div>
    <div class="table-wrap"><table class="data"><tr><th>Email</th><th>Tier</th><th>Visits</th><th>Spend</th><th>Points</th></tr>${all.map(c => `<tr><td>${esc(c.email)}</td><td>${tierFor(c.spend).name}</td><td>${c.visits}</td><td>${money(c.spend)}</td><td>${c.points}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No customers yet.</td></tr>'}</table></div>`;
  },

  async members() {
    const all = await store.listMembers();
    return `<div class="eyebrow">Accounts</div><h2>Members &amp; Staff</h2><p class="muted">Promote a trusted member to administrator, or remove admin access.</p>
    <div class="table-wrap"><table class="data"><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Role</th><th></th></tr>
    ${all.map(m => `<tr><td><strong>${esc(m.full_name)}</strong></td><td>${esc(m.email)}</td><td>${esc(m.phone || '')}</td><td>${m.created_at ? fmtDate(m.created_at) : ''}</td><td>${m.role === 'admin' ? '<span class="badge dark">admin</span>' : '<span class="badge">member</span>'}</td>
      <td>${m.id === state.user.id ? '<small class="muted">you</small>' : `<button class="btn sm light" data-act="setRole" data-id="${esc(m.id)}" data-role="${m.role === 'admin' ? 'member' : 'admin'}">${m.role === 'admin' ? 'Make member' : 'Make admin'}</button>`}</td></tr>`).join('')}</table></div>`;
  },

  async messages() {
    const all = await store.listMessages();
    state.unread = all.filter(m => !m.read).length;
    return `<div class="eyebrow">Inbox</div><h2>Messages</h2><p class="muted">Sent from the contact form on the Visit page.</p>
    ${all.map(m => `<div class="panel" style="margin-bottom:14px;${m.read ? '' : 'border-left:4px solid var(--gold)'}"><div class="row" style="flex-wrap:wrap"><div><strong>${esc(m.subject)}</strong> · ${esc(m.name)} &lt;${esc(m.email)}&gt;<br><small class="muted">${fmtDateTime(m.created_at)}</small></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><a class="btn sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + m.subject)}">Reply</a><button class="btn sm light" data-act="readMsg" data-id="${esc(m.id)}" data-read="${m.read ? '' : '1'}">Mark ${m.read ? 'unread' : 'read'}</button><button class="btn sm ghost" data-act="deleteMsg" data-id="${esc(m.id)}">Delete</button></div></div>
      <p style="margin:12px 0 0;white-space:pre-wrap">${esc(m.body)}</p></div>`).join('') || '<div class="panel empty">No messages yet.</div>'}`;
  },

  async newsletter() {
    const all = await store.listSubscribers();
    return `<div class="row" style="flex-wrap:wrap"><div><div class="eyebrow">Marketing</div><h2>Newsletter</h2></div><button class="btn light sm" data-act="exportSubs">Export CSV</button></div>
    <p class="muted">${all.length} subscriber${all.length === 1 ? '' : 's'} from the homepage sign-up form.</p>
    <div class="table-wrap"><table class="data"><tr><th>Email</th><th>Subscribed</th></tr>${all.map(s => `<tr><td>${esc(s.email)}</td><td>${fmtDate(s.created_at)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">No subscribers yet.</td></tr>'}</table></div>`;
  },

  async data() {
    const local = store.mode === 'local';
    return `<div class="eyebrow">System</div><h2>Data &amp; Settings</h2>
    <div class="panel" style="margin-bottom:20px"><h3>Database mode: ${local ? 'Browser database' : 'Shared cloud database (Supabase)'}</h3>
      <p class="muted">${local ? 'All data lives in this browser’s storage. Changes you make here are visible on this device only. To share changes with every visitor, connect a free Supabase project (see README.md: “Cloud mode”).' : 'Connected to Supabase. Changes are shared with every visitor in real time.'}</p></div>
    ${local ? `<div class="panel"><h3>Backup &amp; reset</h3><p class="muted">Download a JSON backup of everything, or restore the original demo data.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="exportAll">Download backup</button><button class="btn danger" data-act="resetDemo">Reset demo data</button></div></div>` : ''}`;
  }
};

// ---------- router ----------
let renderSeq = 0;
async function render() {
  const [, page = '', sub = ''] = location.hash.replace(/^#/, '').split('/');
  const name = pages[page] ? page : 'home';
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  $('#links').classList.remove('open');
  $('#footer').hidden = name === 'admin';
  const seq = ++renderSeq;
  let html;
  try { html = await pages[name](sub); } catch (e) { html = `<section class="wrap center"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p></section>`; }
  if (seq !== renderSeq) return;
  const keep = {}; $('[data-form=checkout]')?.querySelectorAll('input[name]').forEach(i => keep[i.name] = i.type === 'checkbox' ? i.checked : i.value);
  view.innerHTML = html;
  const cf = $('[data-form=checkout]');
  if (cf) for (const [k, v] of Object.entries(keep)) { const i = cf.elements[k]; if (i && !i.readOnly) i.type === 'checkbox' ? i.checked = v : i.value = v; }
  if (name === 'order') updateTotals();
  if (name === 'menu') filterMenu();
  document.title = { home: "Granville's Coffee | Quesnel, British Columbia", menu: "Menu | Granville's Coffee", order: "Your order | Granville's Coffee", story: "Our story | Granville's Coffee", rewards: "Rewards | Granville's Coffee", visit: "Visit | Granville's Coffee", account: "My account | Granville's Coffee", admin: "Admin | Granville's Coffee" }[name];
}
let lastPage = '';
window.addEventListener('hashchange', () => {
  const page = location.hash.split('/')[1] || '';
  if (page !== 'order') state.receipt = null;
  if (page !== lastPage) { state.editing = null; window.scrollTo(0, 0); }
  lastPage = page; render();
});

function filterMenu() {
  const q = ($('#menuSearch')?.value || '').trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('#menuGrid .card').forEach(c => {
    const ok = (state.menuCat === 'All' || c.dataset.cat === state.menuCat) && (!q || c.dataset.name.includes(q));
    c.hidden = !ok; if (ok) shown++;
  });
  const e = $('#menuEmpty'); if (e) e.hidden = !!shown;
}

function updateTotals() {
  const el = $('#totals'); if (!el) return;
  const f = $('[data-form=checkout]');
  const subtotal = cartLines().reduce((a, l) => a + l.p.price * l.q, 0);
  const code = (f.coupon.value || '').trim().toUpperCase();
  const promo = state.pub.promos.find(p => p.code === code);
  let disc = promo && (!promo.members_only || state.user) ? Math.round(Math.round(subtotal * 100) * promo.percent / 100) / 100 : 0;
  if (f.redeem?.checked) disc = Math.min(subtotal, disc + REWARD_VALUE);
  const note = code && !promo ? '<div style="color:var(--bad);font-size:14px">Code not recognised</div>' : promo?.members_only && !state.user ? '<div style="color:var(--bad);font-size:14px">Sign in to use this members-only code</div>' : '';
  el.innerHTML = `<hr><div><span>Subtotal</span><span>${money(subtotal)}</span></div>${disc ? `<div style="color:var(--ok)"><span>Discount</span><span>−${money(disc)}</span></div>` : ''}${note}<div class="grand"><span>Total</span><span>${money(subtotal - disc)}</span></div>`;
}

// ---------- events ----------
const rerenderPublic = () => { if (['', 'home', 'menu', 'order'].includes(location.hash.split('/')[1] || '')) render(); };
const actions = {
  inc: t => { const p = product(t.dataset.id); const q = state.cart[p.id] || 0; if (q >= p.stock) return toast('Sorry, not enough stock', true); if (q >= 25) return toast('Maximum 25 per item'); state.cart[p.id] = q + 1; saveCart(); rerenderPublic(); },
  dec: t => { const id = t.dataset.id; state.cart[id] = (state.cart[id] || 0) - 1; if (state.cart[id] <= 0) delete state.cart[id]; saveCart(); rerenderPublic(); },
  cat: t => { state.menuCat = t.dataset.cat; document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === t)); filterMenu(); },
  clearReceipt: () => { state.receipt = null; },
  authTab: t => { state.authTab = t.dataset.tab; render(); },
  signOut: async () => { await store.signOut(); state.authTab = 'in'; await refreshData(); toast('Signed out'); location.hash = '#/'; },
  copy: async t => { try { await navigator.clipboard.writeText(t.dataset.text); toast('Copied ' + t.dataset.text); } catch { toast(t.dataset.text); } },
  reorder: async t => {
    const o = (await store.myOrders()).find(x => x.id === t.dataset.id); let added = 0;
    o.items.forEach(i => { const p = product(i.product_id); if (p && p.stock > 0) { state.cart[p.id] = Math.min(p.stock, (state.cart[p.id] || 0) + i.quantity); added++; } });
    saveCart(); toast(added ? 'Added to your order' : 'Those items are no longer available', !added); if (added) location.hash = '#/order';
  },
  orderFilter: t => { state.orderFilter = t.dataset.f; render(); },
  exportOrders: async () => { const o = await store.listOrders(); download('granvilles-orders.csv', csv([['Order', 'Created', 'Pickup', 'Email', 'Items', 'Subtotal', 'Discount', 'Total', 'Status'], ...o.map(x => [x.order_number, x.created_at, x.pickup_name, x.email, x.items.map(i => `${i.quantity}x ${i.name}`).join('; '), x.subtotal, x.discount, x.total, x.status])])); },
  exportCustomers: async () => { const c = await store.listCustomers(); download('granvilles-customers.csv', csv([['Email', 'Visits', 'Spend', 'Points'], ...c.map(x => [x.email, x.visits, x.spend, x.points])])); },
  exportSubs: async () => { const s = await store.listSubscribers(); download('granvilles-newsletter.csv', csv([['Email', 'Subscribed'], ...s.map(x => [x.email, x.created_at])])); },
  exportAll: async () => download('granvilles-backup.json', JSON.stringify(await store.exportData(), null, 2), 'application/json'),
  resetDemo: async () => { if (!confirm('Reset all data to the original demo content? Orders, edits and new accounts in this browser will be lost.')) return; await store.resetDemo(); state.cart = {}; saveCart(); await refreshData(); toast('Demo data restored'); render(); },
  editProduct: t => { state.editing = t.dataset.id; render().then(() => window.scrollTo({ top: 0, behavior: 'smooth' })); },
  cancelEdit: () => { state.editing = null; render(); },
  deleteProduct: async t => { if (!confirm('Delete this menu item permanently? Hiding it keeps its history.')) return; await store.deleteProduct(t.dataset.id); state.editing = null; await refreshData(); toast('Item deleted'); render(); },
  toggleProduct: async t => { const p = (await store.listProducts()).find(x => x.id === t.dataset.id); await store.saveProduct({ ...p, active: !p.active }); await refreshData(); render(); },
  stock: async t => { const p = (await store.listProducts()).find(x => x.id === t.dataset.id); await store.saveProduct({ ...p, stock: Math.max(0, p.stock + Number(t.dataset.d)) }); await refreshData(); render(); },
  togglePromo: async t => { const p = (await store.listPromos()).find(x => x.code === t.dataset.code); await store.savePromo({ ...p, active: !p.active }); await refreshData(); render(); },
  deletePromo: async t => { if (!confirm('Delete offer ' + t.dataset.code + '?')) return; await store.deletePromo(t.dataset.code); await refreshData(); render(); },
  setRole: async t => { await store.setRole(t.dataset.id, t.dataset.role); toast('Role updated'); render(); },
  readMsg: async t => { await store.markMessage(t.dataset.id, !!t.dataset.read); render(); },
  deleteMsg: async t => { if (!confirm('Delete this message?')) return; await store.deleteMessage(t.dataset.id); render(); }
};

const forms = {
  async subscribe(f) { await store.subscribe(f.email.value); f.reset(); toast('Thanks for subscribing!'); },
  async checkout(f) {
    const items = cartLines().map(l => ({ product_id: l.p.id, quantity: l.q }));
    const r = await store.placeOrder({ name: f.name.value, email: f.email.value, coupon: f.coupon.value, items, redeem: !!f.redeem?.checked });
    state.receipt = { ...r, name: f.name.value.trim() }; state.cart = {}; saveCart();
    await refreshData(); render(); window.scrollTo(0, 0);
  },
  async contact(f) { await store.sendMessage(formData(f)); f.reset(); toast('Message sent. We’ll be in touch soon!'); },
  async signin(f) {
    const u = await store.signIn(f.email.value, f.password.value); await refreshData();
    toast('Welcome back, ' + (u.full_name?.split(' ')[0] || 'friend'));
    location.hash = u.role === 'admin' ? '#/admin' : '#/account'; render();
  },
  async signup(f) { await store.signUp(formData(f)); await refreshData(); toast('Welcome to Granville’s Rewards!'); location.hash = '#/account'; render(); },
  async profile(f) { await store.updateProfile(formData(f)); await refreshData(); toast('Profile saved'); render(); },
  async password(f) { await store.changePassword(f.current.value, f.next.value); f.reset(); toast('Password updated'); },
  async product(f) {
    const d = formData(f);
    const p = { name: d.name.trim(), category: d.category.trim(), price: Number(d.price), stock: Number(d.stock), description: d.description.trim(), image_url: d.image_url.trim(), art: d.art, featured: !!d.featured, active: !!d.active };
    if (p.image_url && !safeImg(p.image_url)) throw Error('Photo must be an https:// link or an uploaded image');
    if (d.id) p.id = d.id;
    await store.saveProduct(p); state.editing = null; await refreshData(); toast('Published'); render();
  },
  async settings(f) {
    const d = formData(f);
    if (d.hero_image && !safeImg(d.hero_image)) throw Error('Hero image must be an https:// link or an uploaded image');
    for (const k of ['instagram', 'facebook']) if (d[k] && !/^https:\/\//.test(d[k])) throw Error('Social links must start with https://');
    await store.saveSettings(d); await refreshData(); toast('Content published'); render();
  },
  async promo(f) { await store.savePromo({ code: f.code.value, percent: Number(f.percent.value), active: true, members_only: f.members_only.checked }); await refreshData(); toast('Offer created'); render(); }
};

view.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  try { await actions[t.dataset.act]?.(t); } catch (err) { toast(err.message, true); }
});
view.addEventListener('submit', async e => {
  const f = e.target; if (!forms[f.dataset.form]) return;
  e.preventDefault();
  const btn = f.querySelector('button:not([type=button])'); if (btn) btn.disabled = true;
  try { await forms[f.dataset.form](f); } catch (err) { toast(err.message, true); } finally { if (btn?.isConnected) btn.disabled = false; }
});
view.addEventListener('input', e => {
  const k = e.target.dataset.input;
  if (k === 'menuSearch') filterMenu();
  if (k === 'coupon') updateTotals();
});
view.addEventListener('change', async e => {
  const t = e.target, k = t.dataset.change;
  try {
    if (k === 'coupon') updateTotals();
    if (k === 'orderStatus') { await store.setOrderStatus(t.dataset.id, t.value); toast('Order marked ' + t.value); }
    if (k === 'upload' && t.files[0]) {
      const url = await compressImage(t.files[0], Number(t.dataset.max) || 1000);
      document.getElementById(t.dataset.target).value = url; document.getElementById(t.dataset.preview).src = url;
      toast('Image ready. Save to publish it.');
    }
  } catch (err) { toast(err.message, true); }
});
$('#menuToggle').addEventListener('click', () => { const l = $('#links'); l.classList.toggle('open'); $('#menuToggle').setAttribute('aria-expanded', l.classList.contains('open')); });

// ---------- boot ----------
async function boot() {
  const cloud = config.SUPABASE_URL && !/REPLACE/i.test(config.SUPABASE_URL + config.SUPABASE_ANON_KEY);
  if (cloud) {
    try { const { CloudStore } = await import('./store-cloud.js'); store = new CloudStore(config.SUPABASE_URL, config.SUPABASE_ANON_KEY); await store.init(); }
    catch (e) { console.error(e); toast('Cloud database unavailable, using browser database', true); store = null; }
  }
  if (!store) { store = new LocalStore(); await store.init(); }
  await refreshData();
  store.onChange(async () => {
    await refreshData();
    const a = document.activeElement;
    if (!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) rerenderPublic();
  });
  lastPage = location.hash.split('/')[1] || '';
  await render();
}
boot().catch(e => { view.innerHTML = `<section class="wrap center"><h2>We couldn't load the site</h2><p class="muted">${esc(e.message)}</p></section>`; });
