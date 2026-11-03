-- Granville's Coffee: core schema (content, CRM, ERP, analytics, performance).

create extension if not exists pgcrypto;

-- ---------- People & access ----------
create table users (
  id serial primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'staff' check (role in ('owner','manager','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table sessions (
  token_hash text primary key,
  user_id int not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions(user_id);

create table audit_log (
  id bigserial primary key,
  user_id int references users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on audit_log(created_at desc);

-- ---------- Website content ----------
create table site_text (
  key text primary key,
  label text,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- JSON settings: settings, hours, lists, stories, characters, quest, fitness, tedPhoto
create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table menu_categories (
  id serial primary key,
  slug text not null unique,
  label text not null,
  title text not null default '',
  emoji text not null default '☕',
  sort int not null default 0,
  visible boolean not null default true
);

create table menu_items (
  id serial primary key,
  category_id int not null references menu_categories(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(10,2),
  cost numeric(10,2),
  emoji text,
  sort int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
create index menu_items_cat_idx on menu_items(category_id);

create table uploads (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  mime text not null,
  size int not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

create table gallery (
  id serial primary key,
  src text not null,
  title text not null default '',
  caption text not null default '',
  alt text not null default '',
  sort int not null default 0,
  visible boolean not null default true
);

-- ---------- CRM ----------
create table customers (
  id serial primary key,
  name text not null,
  email text,
  phone text,
  birthday date,
  tags text[] not null default '{}',
  notes text not null default '',
  source text not null default 'walk-in',
  marketing_consent boolean not null default false,
  loyalty_points int not null default 0,
  created_at timestamptz not null default now()
);
create unique index customers_email_uq on customers(lower(email)) where email is not null and email <> '';

create table interactions (
  id serial primary key,
  customer_id int not null references customers(id) on delete cascade,
  kind text not null default 'note',
  summary text not null,
  created_by int references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table messages (
  id serial primary key,
  name text not null,
  email text not null,
  message text not null,
  status text not null default 'new' check (status in ('new','read','replied','archived')),
  customer_id int references customers(id) on delete set null,
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create table newsletter (
  email text primary key,
  name text,
  created_at timestamptz not null default now(),
  unsubscribed boolean not null default false
);

-- ---------- ERP: sales, inventory, purchasing, staff, expenses ----------
create table employees (
  id serial primary key,
  name text not null,
  role text not null default 'Barista',
  email text,
  phone text,
  hourly_rate numeric(10,2) not null default 17.85,
  active boolean not null default true,
  hired_on date,
  user_id int references users(id) on delete set null
);

create table sales (
  id serial primary key,
  sold_at timestamptz not null default now(),
  customer_id int references customers(id) on delete set null,
  employee_id int references employees(id) on delete set null,
  payment_method text not null default 'card',
  subtotal numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  cost numeric(10,2) not null default 0,
  notes text not null default ''
);
create index sales_sold_at_idx on sales(sold_at);

create table sale_items (
  id serial primary key,
  sale_id int not null references sales(id) on delete cascade,
  menu_item_id int references menu_items(id) on delete set null,
  name text not null,
  category text,
  qty int not null check (qty > 0),
  unit_price numeric(10,2) not null,
  unit_cost numeric(10,2) not null default 0
);
create index sale_items_sale_idx on sale_items(sale_id);

create table suppliers (
  id serial primary key,
  name text not null,
  contact text,
  email text,
  phone text,
  notes text not null default '',
  lead_days int not null default 3
);

create table inventory_items (
  id serial primary key,
  name text not null,
  category text not null default 'Ingredients',
  unit text not null default 'each',
  on_hand numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  reorder_qty numeric(12,2) not null default 0,
  unit_cost numeric(10,2) not null default 0,
  supplier_id int references suppliers(id) on delete set null
);

create table stock_movements (
  id bigserial primary key,
  item_id int not null references inventory_items(id) on delete cascade,
  change numeric(12,2) not null,
  reason text not null default 'adjustment',
  ref text,
  created_by int references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table purchase_orders (
  id serial primary key,
  supplier_id int references suppliers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','ordered','received','cancelled')),
  created_at timestamptz not null default now(),
  ordered_at timestamptz,
  received_at timestamptz,
  notes text not null default ''
);

create table po_lines (
  id serial primary key,
  po_id int not null references purchase_orders(id) on delete cascade,
  item_id int not null references inventory_items(id) on delete restrict,
  qty numeric(12,2) not null check (qty > 0),
  unit_cost numeric(10,2) not null default 0
);

create table shifts (
  id serial primary key,
  employee_id int not null references employees(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  notes text not null default ''
);
create index shifts_starts_idx on shifts(starts_at);

create table expenses (
  id serial primary key,
  spent_on date not null default current_date,
  category text not null default 'Supplies',
  vendor text not null default '',
  amount numeric(10,2) not null check (amount >= 0),
  notes text not null default ''
);

-- ---------- Performance management ----------
create table kpi_targets (
  metric text primary key,
  label text not null,
  target numeric(12,2) not null,
  direction text not null default 'up' check (direction in ('up','down')),
  unit text not null default '$'
);

create table reviews (
  id serial primary key,
  employee_id int not null references employees(id) on delete cascade,
  reviewed_on date not null default current_date,
  rating int not null check (rating between 1 and 5),
  strengths text not null default '',
  improvements text not null default '',
  goals text not null default '',
  reviewer_id int references users(id) on delete set null
);

-- ---------- Analytics ----------
create table page_views (
  id bigserial primary key,
  path text not null,
  referrer text,
  created_at timestamptz not null default now()
);
create index page_views_created_idx on page_views(created_at);
