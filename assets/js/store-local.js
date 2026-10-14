// Browser database: one JSON document in localStorage, mirroring schema.sql.
// Every visitor's browser keeps its own copy, so changes are not shared between devices.
import { DEFAULT_SETTINGS, DEFAULT_PRODUCTS, DEFAULT_PROMOS, TEST_ACCOUNTS, demoOrders, round } from './seed.js';

const KEY = 'gv_db_v1', SESSION = 'gv_session_v1';
export const REWARD_POINTS = 100, REWARD_VALUE = 5;

const uid = p => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = x => JSON.parse(JSON.stringify(x));
const emailOk = e => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function hash(password, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + password));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function write(db) { localStorage.setItem(KEY, JSON.stringify(db)); }

async function seed() {
  const products = clone(DEFAULT_PRODUCTS);
  const orders = demoOrders(products);
  const customers = {};
  for (const o of orders) {
    if (!o.email) continue;
    const c = customers[o.email] ||= { email: o.email, visits: 0, spend: 0, points: 0 };
    c.visits++; c.spend = round(c.spend + o.total); c.points += Math.floor(o.total);
  }
  // Demo member starts with a bonus so the reward redemption can be tried straight away.
  if (customers['member@granvilles.test']) customers['member@granvilles.test'].points += 80;
  const users = [];
  for (const a of TEST_ACCOUNTS) {
    const salt = uid('s');
    users.push({ id: a.id, email: a.email, full_name: a.full_name, phone: a.phone, role: a.role, salt, hash: await hash(a.password, salt), created_at: new Date(Date.now() - 30 * 86400000).toISOString() });
  }
  return {
    version: 1, settings: clone(DEFAULT_SETTINGS), products, promotions: clone(DEFAULT_PROMOS),
    customers: Object.values(customers), orders, users,
    messages: [{ id: 'm1', name: 'Casey', email: 'casey@example.com', subject: 'Catering question', body: 'Do you cater small office meetings of about 15 people?', created_at: new Date(Date.now() - 2 * 86400000).toISOString(), read: false }],
    subscribers: []
  };
}

export class LocalStore {
  mode = 'local';
  #db; #listeners = new Set();

  async init() {
    this.#db = read();
    if (!this.#db || this.#db.version !== 1) { this.#db = await seed(); write(this.#db); }
    window.addEventListener('storage', e => { if (e.key === KEY) { this.#db = read() || this.#db; this.#emit(); } });
  }
  onChange(cb) { this.#listeners.add(cb); }
  #emit() { this.#listeners.forEach(cb => cb()); }
  #save() { write(this.#db); } // other tabs hear about it through the storage event
  #me() { const id = localStorage.getItem(SESSION); return this.#db.users.find(u => u.id === id) || null; }
  #requireAdmin() { if (this.#me()?.role !== 'admin') throw Error('Administrator access required'); }
  #requireUser() { const u = this.#me(); if (!u) throw Error('Please sign in'); return u; }

  // Public
  async loadPublic() {
    const d = this.#db;
    return {
      settings: clone(d.settings),
      products: clone(d.products.filter(p => p.active).sort((a, b) => a.sort_order - b.sort_order)),
      promos: d.promotions.filter(p => p.active).map(({ code, percent, members_only }) => ({ code, percent, members_only }))
    };
  }

  // Same rules as place_order() in schema.sql: validate, price on the "server", update stock + CRM together.
  async placeOrder({ name, email, coupon, items, redeem }) {
    const d = clone(this.#db), me = this.#me();
    name = (name || '').trim();
    if (name.length < 1 || name.length > 100) throw Error('Pickup name required (max 100 chars)');
    email = (email || '').trim().toLowerCase() || (me ? me.email : null);
    if (email && !emailOk(email)) throw Error('Invalid email');
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw Error('Invalid cart');
    let subtotal = 0, count = 0; const lines = [];
    for (const it of items) {
      const q = Number(it.quantity);
      if (!Number.isInteger(q) || q < 1 || q > 25) throw Error('Invalid quantity');
      const p = d.products.find(x => x.id === it.product_id && x.active);
      if (!p) throw Error('Product unavailable');
      if (p.stock < q) throw Error('Insufficient stock for ' + p.name);
      subtotal += p.price * q; count += q;
      lines.push({ p, q });
    }
    subtotal = round(subtotal);
    let percent = 0;
    if (coupon && coupon.trim()) {
      const promo = d.promotions.find(x => x.code === coupon.trim().toUpperCase() && x.active);
      if (!promo) throw Error('Invalid discount code');
      if (promo.members_only && !me) throw Error('Sign in as a member to use this code');
      percent = promo.percent;
    }
    let discount = Math.round(Math.round(subtotal * 100) * percent / 100) / 100;
    let cust = email ? d.customers.find(c => c.email === email) : null;
    if (redeem) {
      if (!me) throw Error('Sign in to redeem points');
      cust = d.customers.find(c => c.email === me.email);
      if (!cust || cust.points < REWARD_POINTS) throw Error(`You need ${REWARD_POINTS} points to redeem a reward`);
      discount = round(Math.min(subtotal, discount + REWARD_VALUE));
    }
    const total = round(subtotal - discount);
    const order = {
      id: uid('o'), order_number: 'GV-' + Math.random().toString(36).slice(2, 12).toUpperCase(),
      pickup_name: name, email, user_id: me?.id || null, subtotal, discount, total, status: 'new',
      created_at: new Date().toISOString(),
      items: lines.map(({ p, q }) => ({ product_id: p.id, name: p.name, quantity: q, unit_price: p.price }))
    };
    lines.forEach(({ p, q }) => { p.stock -= q; });
    d.orders.push(order);
    if (email) {
      if (!cust) { cust = { email, visits: 0, spend: 0, points: 0 }; d.customers.push(cust); }
      cust.visits++; cust.spend = round(cust.spend + total); cust.points += Math.floor(total);
      if (redeem) cust.points -= REWARD_POINTS;
    }
    this.#db = d; this.#save();
    return { order_number: order.order_number, total, discount, items: count, points: email ? Math.floor(total) : 0 };
  }

  async sendMessage({ name, email, subject, body }) {
    name = (name || '').trim(); email = (email || '').trim().toLowerCase(); body = (body || '').trim();
    if (!name || name.length > 100) throw Error('Please enter your name');
    if (!emailOk(email)) throw Error('Please enter a valid email');
    if (!body || body.length > 4000) throw Error('Please enter a message (max 4000 characters)');
    this.#db.messages.push({ id: uid('m'), name, email, subject: (subject || 'General').slice(0, 120), body, created_at: new Date().toISOString(), read: false });
    this.#save();
  }

  async subscribe(email) {
    email = (email || '').trim().toLowerCase();
    if (!emailOk(email)) throw Error('Please enter a valid email');
    if (!this.#db.subscribers.some(s => s.email === email)) { this.#db.subscribers.push({ email, created_at: new Date().toISOString() }); this.#save(); }
  }

  // Auth
  async currentUser() { const u = this.#me(); return u && { id: u.id, email: u.email, full_name: u.full_name, phone: u.phone, role: u.role, created_at: u.created_at }; }
  async signIn(email, password) {
    const u = this.#db.users.find(x => x.email === (email || '').trim().toLowerCase());
    if (!u || u.hash !== await hash(password || '', u.salt)) throw Error('Invalid email or password');
    localStorage.setItem(SESSION, u.id);
    return this.currentUser();
  }
  async signUp({ full_name, email, phone, password }) {
    email = (email || '').trim().toLowerCase(); full_name = (full_name || '').trim();
    if (!full_name) throw Error('Please enter your name');
    if (!emailOk(email)) throw Error('Please enter a valid email');
    if ((password || '').length < 8) throw Error('Password must be at least 8 characters');
    if (this.#db.users.some(u => u.email === email)) throw Error('An account with this email already exists');
    const salt = uid('s');
    const u = { id: uid('u'), email, full_name, phone: (phone || '').trim(), role: 'member', salt, hash: await hash(password, salt), created_at: new Date().toISOString() };
    this.#db.users.push(u); localStorage.setItem(SESSION, u.id); this.#save();
    return this.currentUser();
  }
  async signOut() { localStorage.removeItem(SESSION); }

  // Member
  async updateProfile({ full_name, phone }) {
    const u = this.#requireUser();
    if (!(full_name || '').trim()) throw Error('Name cannot be empty');
    u.full_name = full_name.trim().slice(0, 100); u.phone = (phone || '').trim().slice(0, 30); this.#save();
  }
  async changePassword(current, next) {
    const u = this.#requireUser();
    if (u.hash !== await hash(current || '', u.salt)) throw Error('Current password is incorrect');
    if ((next || '').length < 8) throw Error('New password must be at least 8 characters');
    u.salt = uid('s'); u.hash = await hash(next, u.salt); this.#save();
  }
  async myLoyalty() {
    const u = this.#requireUser();
    return clone(this.#db.customers.find(c => c.email === u.email) || { email: u.email, visits: 0, spend: 0, points: 0 });
  }
  async myOrders() {
    const u = this.#requireUser();
    return clone(this.#db.orders.filter(o => o.user_id === u.id || o.email === u.email).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  // Admin
  async listOrders() { this.#requireAdmin(); return clone(this.#db.orders).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async setOrderStatus(id, status) { this.#requireAdmin(); const o = this.#db.orders.find(x => x.id === id); if (o) { o.status = status; this.#save(); } }
  async listProducts() { this.#requireAdmin(); return clone(this.#db.products).sort((a, b) => a.sort_order - b.sort_order); }
  async saveProduct(p) {
    this.#requireAdmin();
    if (!p.name?.trim()) throw Error('Name is required');
    if (!(p.price >= 0) || !Number.isInteger(p.stock) || p.stock < 0) throw Error('Invalid price or stock');
    const list = this.#db.products;
    if (p.id) Object.assign(list.find(x => x.id === p.id), p);
    else list.push({ art: 'latte', image_url: '', description: '', featured: false, active: true, stock: 0, ...p, id: uid('p'), sort_order: Math.max(0, ...list.map(x => x.sort_order)) + 1 });
    this.#save();
  }
  async deleteProduct(id) { this.#requireAdmin(); this.#db.products = this.#db.products.filter(p => p.id !== id); this.#save(); }
  async saveSettings(values) { this.#requireAdmin(); Object.assign(this.#db.settings, values); this.#save(); }
  async listPromos() { this.#requireAdmin(); return clone(this.#db.promotions); }
  async savePromo({ code, percent, active = true, members_only = false }) {
    this.#requireAdmin();
    code = (code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw Error('Code must be 3–30 letters or numbers');
    if (!(percent >= 1 && percent <= 100)) throw Error('Percent must be between 1 and 100');
    const ex = this.#db.promotions.find(p => p.code === code);
    if (ex) Object.assign(ex, { percent, active, members_only }); else this.#db.promotions.push({ code, percent, active, members_only });
    this.#save();
  }
  async deletePromo(code) { this.#requireAdmin(); this.#db.promotions = this.#db.promotions.filter(p => p.code !== code); this.#save(); }
  async listCustomers() { this.#requireAdmin(); return clone(this.#db.customers); }
  async listMembers() { this.#requireAdmin(); return this.#db.users.map(({ salt, hash, ...u }) => clone(u)); }
  async setRole(id, role) {
    this.#requireAdmin();
    if (id === this.#me().id) throw Error('You cannot change your own role');
    const u = this.#db.users.find(x => x.id === id); if (u) { u.role = role; this.#save(); }
  }
  async listMessages() { this.#requireAdmin(); return clone(this.#db.messages).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async markMessage(id, read) { this.#requireAdmin(); const m = this.#db.messages.find(x => x.id === id); if (m) { m.read = read; this.#save(); } }
  async deleteMessage(id) { this.#requireAdmin(); this.#db.messages = this.#db.messages.filter(m => m.id !== id); this.#save(); }
  async listSubscribers() { this.#requireAdmin(); return clone(this.#db.subscribers); }

  // Local-only data tools
  async exportData() { this.#requireAdmin(); const { users, ...rest } = this.#db; return { ...clone(rest), users: users.map(({ salt, hash, ...u }) => u) }; }
  async resetDemo() { this.#requireAdmin(); const keep = localStorage.getItem(SESSION); this.#db = await seed(); write(this.#db); if (keep) localStorage.setItem(SESSION, keep); }
}
