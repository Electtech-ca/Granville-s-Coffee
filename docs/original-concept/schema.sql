
-- Run in a NEW Supabase project SQL editor. Demo data only.
create extension if not exists pgcrypto;
create table public.admin_users(user_id uuid primary key references auth.users(id) on delete cascade);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.admin_users where user_id=(select auth.uid()))$$;
create table public.site_settings(key text primary key,value text not null default '');
create table public.products(id uuid primary key default gen_random_uuid(),name text not null,description text not null default '',category text not null default 'Coffee',price numeric(10,2) not null check(price>=0),stock integer not null default 0 check(stock>=0),image_url text not null default '',active boolean not null default true,sort_order integer not null default 0);
create table public.promotions(code text primary key,percent integer not null check(percent between 1 and 100),active boolean not null default true);
create table public.customers(email text primary key,visits integer not null default 0,spend numeric(12,2) not null default 0,points integer not null default 0);
create table public.orders(id uuid primary key default gen_random_uuid(),order_number text not null unique default ('GV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),pickup_name text not null,email text,subtotal numeric(12,2) not null,discount numeric(12,2) not null,total numeric(12,2) not null,created_at timestamptz not null default now());
create table public.order_items(id bigint generated always as identity primary key,order_id uuid not null references public.orders(id),product_id uuid not null references public.products(id),quantity integer not null,unit_price numeric(10,2) not null);
alter table public.admin_users enable row level security;
alter table public.site_settings enable row level security;
alter table public.products enable row level security;
alter table public.promotions enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy admin_self on public.admin_users for select to authenticated using(user_id=(select auth.uid()));
create policy public_settings_read on public.site_settings for select to anon,authenticated using(true);
create policy admin_settings_write on public.site_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_products_read on public.products for select to anon,authenticated using(active or public.is_admin());
create policy admin_products_write on public.products for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_promos_read on public.promotions for select to anon,authenticated using(active or public.is_admin());
create policy admin_promos_write on public.promotions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_customers on public.customers for select to authenticated using(public.is_admin());
create policy admin_orders on public.orders for select to authenticated using(public.is_admin());
create policy admin_order_items on public.order_items for select to authenticated using(public.is_admin());
-- Order RPC is the only public write path. No direct INSERT policies on order/CRM tables.
create or replace function public.place_demo_order(p_name text,p_email text,p_coupon text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_product public.products%rowtype; v_qty integer; v_subtotal numeric(12,2):=0;v_discount numeric(12,2):=0;v_percent integer:=0;v_order public.orders%rowtype;v_count integer:=0;v_email text;
begin
 if length(trim(coalesce(p_name,''))) not between 1 and 100 then raise exception 'Pickup name required (max 100 chars)';end if;
 v_email:=nullif(lower(trim(coalesce(p_email,''))),'');
 if v_email is not null and (length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email';end if;
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 20 then raise exception 'Invalid cart';end if;
 -- Lock products in stable UUID order to prevent overselling and reduce deadlocks.
 for v_item in select value from jsonb_array_elements(p_items) order by (value->>'product_id') loop
  v_qty:=(v_item->>'quantity')::integer;
  if v_qty not between 1 and 25 then raise exception 'Invalid quantity';end if;
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active for update;
  if not found then raise exception 'Product unavailable';end if;
  if v_product.stock < v_qty then raise exception 'Insufficient stock for %',v_product.name;end if;
  v_subtotal:=v_subtotal+v_product.price*v_qty;
  v_count:=v_count+v_qty;
 end loop;
 if p_coupon is not null and trim(p_coupon)<>'' then
  select percent into v_percent from public.promotions where code=upper(trim(p_coupon)) and active;
  if not found then raise exception 'Invalid discount code';end if;
 end if;
 v_discount:=round(v_subtotal*coalesce(v_percent,0)/100,2);
 insert into public.orders(pickup_name,email,subtotal,discount,total)
 values(trim(p_name),v_email,v_subtotal,v_discount,v_subtotal-v_discount) returning * into v_order;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::integer;
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid;
  update public.products set stock=stock-v_qty where id=v_product.id;
  insert into public.order_items(order_id,product_id,quantity,unit_price) values(v_order.id,v_product.id,v_qty,v_product.price);
 end loop;
 if v_email is not null then
  insert into public.customers(email,visits,spend,points) values(v_email,1,v_order.total,floor(v_order.total)::integer)
  on conflict(email) do update set visits=public.customers.visits+1,spend=public.customers.spend+excluded.spend,points=public.customers.points+excluded.points;
 end if;
 return jsonb_build_object('order_number',v_order.order_number,'total',v_order.total,'discount',v_discount,'items',v_count);
end $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.place_demo_order(text,text,text,jsonb) from public;
grant execute on function public.place_demo_order(text,text,text,jsonb) to anon,authenticated;
insert into public.site_settings(key,value) values
('hero_title','Good coffee. Great stories. Every day.'),
('hero_text','A Quesnel gathering place, thoughtfully reimagined for the next chapter.'),
('story_text','Granville''s Coffee is a beloved downtown Quesnel gathering place. This digital concept celebrates community and craft.'),
('hero_image','https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=1800&q=85');
insert into public.products(name,description,category,price,stock,image_url,sort_order) values
('Velvet Latte','Rich espresso with silky steamed milk.','Coffee',5.75,120,'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=700',1),
('Cappuccino','Balanced espresso, steamed milk and foam.','Coffee',5.25,100,'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=700',2),
('Butter Croissant','Golden, flaky and baked fresh.','Bakery',4.50,60,'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=700',3),
('Breakfast Sandwich','A hearty morning favourite.','Kitchen',9.50,35,'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=700',4);
insert into public.promotions(code,percent,active) values('WELCOME10',10,true);
-- Enable Supabase Realtime publication for public CMS tables (run once):
alter publication supabase_realtime add table public.products, public.site_settings, public.promotions;
-- After creating an Auth user in Supabase Dashboard, authorize it with:
-- insert into public.admin_users(user_id) values ('PASTE-AUTH-USER-UUID-HERE');
