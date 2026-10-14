// Supabase-backed store (cloud mode). Same interface as LocalStore; used when config.js has real keys.
// Requires schema.sql to have been run in the Supabase project.
export const REWARD_POINTS = 100, REWARD_VALUE = 5;

export class CloudStore {
  mode = 'cloud';
  #db; #listeners = new Set(); #user = null;
  constructor(url, key) { this.url = url; this.key = key; }

  async init() {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    this.#db = createClient(this.url, this.key);
    await this.#loadUser();
    this.#db.auth.onAuthStateChange(async () => { await this.#loadUser(); this.#emit(); });
    const ch = this.#db.channel('granvilles-live');
    for (const table of ['products', 'site_settings', 'promotions']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => this.#emit());
    ch.subscribe();
  }
  onChange(cb) { this.#listeners.add(cb); }
  #emit() { this.#listeners.forEach(cb => cb()); }
  #ok({ data, error }) { if (error) throw Error(error.message); return data; }

  async #loadUser() {
    const { data: { session } } = await this.#db.auth.getSession();
    if (!session) { this.#user = null; return; }
    const id = session.user.id;
    const [p, a] = await Promise.all([
      this.#db.from('profiles').select('*').eq('id', id).maybeSingle(),
      this.#db.from('admin_users').select('user_id').eq('user_id', id).maybeSingle()
    ]);
    const prof = p.data || { email: session.user.email, full_name: '', phone: '', created_at: session.user.created_at };
    this.#user = { id, email: prof.email, full_name: prof.full_name, phone: prof.phone, created_at: prof.created_at, role: a.data ? 'admin' : 'member' };
  }

  async loadPublic() {
    const [p, s, o] = await Promise.all([
      this.#db.from('products').select('*').eq('active', true).order('sort_order'),
      this.#db.from('site_settings').select('*'),
      this.#db.from('promotions').select('code,percent,members_only').eq('active', true)
    ]);
    return {
      products: this.#ok(p).map(x => ({ ...x, price: Number(x.price) })),
      settings: Object.fromEntries(this.#ok(s).map(x => [x.key, x.value])),
      promos: this.#ok(o)
    };
  }
  async placeOrder({ name, email, coupon, items, redeem }) {
    const r = this.#ok(await this.#db.rpc('place_order', { p_name: name, p_email: email || null, p_coupon: coupon || null, p_items: items, p_redeem: !!redeem }));
    this.#emit();
    return r;
  }
  async sendMessage({ name, email, subject, body }) {
    this.#ok(await this.#db.from('messages').insert({ name: (name || '').trim(), email: (email || '').trim().toLowerCase(), subject: subject || 'General', body: (body || '').trim() }));
  }
  async subscribe(email) {
    this.#ok(await this.#db.from('subscribers').upsert({ email: (email || '').trim().toLowerCase() }, { onConflict: 'email', ignoreDuplicates: true }));
  }

  async currentUser() { return this.#user; }
  async signIn(email, password) {
    this.#ok(await this.#db.auth.signInWithPassword({ email: (email || '').trim(), password }));
    await this.#loadUser(); this.#emit(); return this.#user;
  }
  async signUp({ full_name, email, phone, password }) {
    if ((password || '').length < 8) throw Error('Password must be at least 8 characters');
    const d = this.#ok(await this.#db.auth.signUp({ email: (email || '').trim(), password, options: { data: { full_name, phone } } }));
    if (!d.session) throw Error('Check your email to confirm your account, then sign in.');
    await this.#loadUser(); this.#emit(); return this.#user;
  }
  async signOut() { await this.#db.auth.signOut(); this.#user = null; this.#emit(); }

  async updateProfile({ full_name, phone }) {
    this.#ok(await this.#db.from('profiles').update({ full_name, phone }).eq('id', this.#user.id));
    await this.#loadUser(); this.#emit();
  }
  async changePassword(current, next) {
    if ((next || '').length < 8) throw Error('New password must be at least 8 characters');
    this.#ok(await this.#db.auth.signInWithPassword({ email: this.#user.email, password: current }));
    this.#ok(await this.#db.auth.updateUser({ password: next }));
  }
  async myLoyalty() {
    const c = this.#ok(await this.#db.from('customers').select('*').eq('email', this.#user.email).maybeSingle());
    return c ? { ...c, spend: Number(c.spend) } : { email: this.#user.email, visits: 0, spend: 0, points: 0 };
  }
  async myOrders() {
    return this.#normOrders(this.#ok(await this.#db.from('orders').select('*, items:order_items(*)').eq('user_id', this.#user.id).order('created_at', { ascending: false })));
  }
  #normOrders(rows) { return rows.map(o => ({ ...o, subtotal: Number(o.subtotal), discount: Number(o.discount), total: Number(o.total), items: (o.items || []).map(i => ({ ...i, unit_price: Number(i.unit_price) })) })); }

  async listOrders() { return this.#normOrders(this.#ok(await this.#db.from('orders').select('*, items:order_items(*)').order('created_at', { ascending: false }))); }
  async setOrderStatus(id, status) { this.#ok(await this.#db.from('orders').update({ status }).eq('id', id)); }
  async listProducts() { return this.#ok(await this.#db.from('products').select('*').order('sort_order')).map(x => ({ ...x, price: Number(x.price) })); }
  async saveProduct(p) {
    if (!p.name?.trim()) throw Error('Name is required');
    if (!(p.price >= 0) || !Number.isInteger(p.stock) || p.stock < 0) throw Error('Invalid price or stock');
    if (p.id) this.#ok(await this.#db.from('products').update(p).eq('id', p.id));
    else {
      const max = (await this.listProducts()).reduce((m, x) => Math.max(m, x.sort_order), 0);
      this.#ok(await this.#db.from('products').insert({ ...p, sort_order: max + 1 }));
    }
    this.#emit();
  }
  async deleteProduct(id) { this.#ok(await this.#db.from('products').delete().eq('id', id)); this.#emit(); }
  async saveSettings(values) { this.#ok(await this.#db.from('site_settings').upsert(Object.entries(values).map(([key, value]) => ({ key, value })))); this.#emit(); }
  async listPromos() { return this.#ok(await this.#db.from('promotions').select('*')); }
  async savePromo({ code, percent, active = true, members_only = false }) {
    code = (code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw Error('Code must be 3–30 letters or numbers');
    this.#ok(await this.#db.from('promotions').upsert({ code, percent, active, members_only })); this.#emit();
  }
  async deletePromo(code) { this.#ok(await this.#db.from('promotions').delete().eq('code', code)); this.#emit(); }
  async listCustomers() { return this.#ok(await this.#db.from('customers').select('*')).map(c => ({ ...c, spend: Number(c.spend) })); }
  async listMembers() {
    const [p, a] = await Promise.all([this.#db.from('profiles').select('*'), this.#db.from('admin_users').select('user_id')]);
    const admins = new Set(this.#ok(a).map(x => x.user_id));
    return this.#ok(p).map(u => ({ ...u, role: admins.has(u.id) ? 'admin' : 'member' }));
  }
  async setRole(id, role) {
    if (id === this.#user.id) throw Error('You cannot change your own role');
    if (role === 'admin') this.#ok(await this.#db.from('admin_users').upsert({ user_id: id }));
    else this.#ok(await this.#db.from('admin_users').delete().eq('user_id', id));
  }
  async listMessages() { return this.#ok(await this.#db.from('messages').select('*').order('created_at', { ascending: false })); }
  async markMessage(id, read) { this.#ok(await this.#db.from('messages').update({ read }).eq('id', id)); }
  async deleteMessage(id) { this.#ok(await this.#db.from('messages').delete().eq('id', id)); }
  async listSubscribers() { return this.#ok(await this.#db.from('subscribers').select('*')); }
}
