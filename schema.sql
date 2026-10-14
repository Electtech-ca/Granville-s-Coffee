-- Granville's Coffee: Supabase schema (cloud mode). Run once in a NEW Supabase project's SQL editor.
-- Extends the original concept schema (docs/original-concept/schema.sql) with members, order status,
-- contact messages, newsletter sign-ups and a loyalty reward. Demo data only.
create extension if not exists pgcrypto;

create table public.admin_users(user_id uuid primary key references auth.users(id) on delete cascade);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as
$$select exists(select 1 from public.admin_users where user_id=(select auth.uid()))$$;

create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,email text not null,full_name text not null default '',phone text not null default '',created_at timestamptz not null default now());
create table public.site_settings(key text primary key,value text not null default '');
create table public.products(id uuid primary key default gen_random_uuid(),name text not null,description text not null default '',category text not null default 'Coffee',price numeric(10,2) not null check(price>=0),stock integer not null default 0 check(stock>=0),image_url text not null default '',art text not null default 'latte',featured boolean not null default false,active boolean not null default true,sort_order integer not null default 0);
create table public.promotions(code text primary key,percent integer not null check(percent between 1 and 100),active boolean not null default true,members_only boolean not null default false);
create table public.customers(email text primary key,visits integer not null default 0,spend numeric(12,2) not null default 0,points integer not null default 0);
create table public.orders(id uuid primary key default gen_random_uuid(),order_number text not null unique default ('GV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),pickup_name text not null,email text,user_id uuid references auth.users(id) on delete set null,subtotal numeric(12,2) not null,discount numeric(12,2) not null,total numeric(12,2) not null,status text not null default 'new' check(status in ('new','preparing','ready','completed','cancelled')),created_at timestamptz not null default now());
create table public.order_items(id bigint generated always as identity primary key,order_id uuid not null references public.orders(id) on delete cascade,product_id uuid references public.products(id) on delete set null,name text not null,quantity integer not null,unit_price numeric(10,2) not null);
create table public.messages(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),email text not null check(length(email)<=254),subject text not null default 'General' check(length(subject)<=120),body text not null check(length(body) between 1 and 4000),read boolean not null default false,created_at timestamptz not null default now());
create table public.subscribers(email text primary key check(length(email)<=254),created_at timestamptz not null default now());

alter table public.admin_users enable row level security;
alter table public.profiles enable row level security;
alter table public.site_settings enable row level security;
alter table public.products enable row level security;
alter table public.promotions enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.messages enable row level security;
alter table public.subscribers enable row level security;

create policy admin_self on public.admin_users for select to authenticated using(user_id=(select auth.uid()) or public.is_admin());
create policy admin_manage on public.admin_users for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy profile_own on public.profiles for select to authenticated using(id=(select auth.uid()) or public.is_admin());
create policy profile_update_own on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy public_settings_read on public.site_settings for select to anon,authenticated using(true);
create policy admin_settings_write on public.site_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_products_read on public.products for select to anon,authenticated using(active or public.is_admin());
create policy admin_products_write on public.products for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_promos_read on public.promotions for select to anon,authenticated using(active or public.is_admin());
create policy admin_promos_write on public.promotions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy customers_read on public.customers for select to authenticated using(public.is_admin() or email=lower((select auth.jwt())->>'email'));
create policy orders_read on public.orders for select to authenticated using(public.is_admin() or user_id=(select auth.uid()));
create policy orders_admin_update on public.orders for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy order_items_read on public.order_items for select to authenticated using(public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid())));
create policy messages_insert on public.messages for insert to anon,authenticated with check(read=false);
create policy messages_admin on public.messages for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy subscribers_insert on public.subscribers for insert to anon,authenticated with check(true);
create policy subscribers_admin on public.subscribers for select to authenticated using(public.is_admin());

-- New sign-ups get a profile row automatically.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,email,full_name,phone) values(new.id,lower(new.email),coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.raw_user_meta_data->>'phone',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Order RPC is the only public write path for orders and CRM. Reward: 100 points = $5 off (members only).
create or replace function public.place_order(p_name text,p_email text,p_coupon text,p_items jsonb,p_redeem boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_product public.products%rowtype; v_qty integer; v_subtotal numeric(12,2):=0;v_discount numeric(12,2):=0;v_percent integer:=0;v_members_only boolean;v_order public.orders%rowtype;v_count integer:=0;v_email text;v_uid uuid:=auth.uid();v_points integer;
begin
 if length(trim(coalesce(p_name,''))) not between 1 and 100 then raise exception 'Pickup name required (max 100 chars)';end if;
 v_email:=nullif(lower(trim(coalesce(p_email,''))),'');
 if v_email is null and v_uid is not null then select email into v_email from public.profiles where id=v_uid;end if;
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
  select percent,members_only into v_percent,v_members_only from public.promotions where code=upper(trim(p_coupon)) and active;
  if not found then raise exception 'Invalid discount code';end if;
  if v_members_only and v_uid is null then raise exception 'Sign in as a member to use this code';end if;
 end if;
 v_discount:=round(v_subtotal*coalesce(v_percent,0)/100,2);
 if p_redeem then
  if v_uid is null then raise exception 'Sign in to redeem points';end if;
  select email into v_email from public.profiles where id=v_uid;
  select points into v_points from public.customers where email=v_email for update;
  if coalesce(v_points,0)<100 then raise exception 'You need 100 points to redeem a reward';end if;
  v_discount:=least(v_subtotal,v_discount+5);
 end if;
 insert into public.orders(pickup_name,email,user_id,subtotal,discount,total)
 values(trim(p_name),v_email,v_uid,v_subtotal,v_discount,v_subtotal-v_discount) returning * into v_order;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::integer;
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid;
  update public.products set stock=stock-v_qty where id=v_product.id;
  insert into public.order_items(order_id,product_id,name,quantity,unit_price) values(v_order.id,v_product.id,v_product.name,v_qty,v_product.price);
 end loop;
 if v_email is not null then
  insert into public.customers(email,visits,spend,points) values(v_email,1,v_order.total,floor(v_order.total)::integer)
  on conflict(email) do update set visits=public.customers.visits+1,spend=public.customers.spend+excluded.spend,points=public.customers.points+excluded.points;
  if p_redeem then update public.customers set points=points-100 where email=v_email;end if;
 end if;
 return jsonb_build_object('order_number',v_order.order_number,'total',v_order.total,'discount',v_discount,'items',v_count,'points',case when v_email is null then 0 else floor(v_order.total)::integer end);
end $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon,authenticated;
revoke all on function public.place_order(text,text,text,jsonb,boolean) from public;
grant execute on function public.place_order(text,text,text,jsonb,boolean) to anon,authenticated;

insert into public.site_settings(key,value) values
('hero_title','Good coffee. Great stories. Every day.'),
('hero_text','A Quesnel gathering place, thoughtfully reimagined for the next chapter.'),
('hero_image','https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=1800&q=85'),
('story_text','Granville''s Coffee is a beloved downtown Quesnel gathering place. This digital concept celebrates community and craft.'),
('story_long','Every cup starts with people: the regulars who know each other by name, the students cramming before exams, the families stopping in after the farmers market. We pick our beans with care, bake every morning, and keep the door open for whoever needs a warm seat and a good conversation.'),
('announcement','New: order ahead for pickup and earn loyalty points on every visit.'),
('address','Downtown Quesnel, British Columbia'),('phone',''),('email',''),
('hours',E'Monday – Friday|7:00 am – 5:00 pm\nSaturday|8:00 am – 4:00 pm\nSunday|9:00 am – 3:00 pm'),
('map_query','Granville''s Coffee Quesnel BC'),('instagram',''),('facebook','');
insert into public.products(name,description,category,price,stock,image_url,art,featured,sort_order) values
('Velvet Latte','Rich espresso with silky steamed milk.','Coffee',5.75,120,'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=700','latte',true,1),
('Cappuccino','Balanced espresso, steamed milk and foam.','Coffee',5.25,100,'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=700','latte',true,2),
('Drip Coffee','Our house blend, brewed fresh all day. Free refills in-house.','Coffee',3.25,200,'','latte',false,3),
('Americano','Double espresso lengthened with hot water.','Coffee',4.25,150,'','latte',false,4),
('Flat White','Ristretto shots with velvety micro-foam.','Coffee',5.50,90,'','latte',false,5),
('Mocha','Espresso, dark chocolate and steamed milk.','Coffee',6.25,80,'','latte',true,6),
('Cold Brew','Steeped 18 hours for a smooth, low-acid sip.','Cold Drinks',5.25,60,'','iced',true,7),
('Iced Caramel Latte','Espresso, milk and house caramel over ice.','Cold Drinks',6.25,70,'','iced',false,8),
('London Fog','Earl Grey, vanilla and steamed milk.','Tea',5.50,80,'','tea',true,9),
('Chai Latte','Warming spiced chai with steamed milk.','Tea',5.75,80,'','tea',false,10),
('Butter Croissant','Golden, flaky and baked fresh.','Bakery',4.50,60,'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=700','croissant',true,11),
('Blueberry Muffin','Bursting with berries and a crumble top.','Bakery',3.95,48,'','muffin',false,12),
('Cinnamon Bun','Soft, gooey and glazed every morning.','Bakery',4.75,36,'','croissant',false,13),
('Nanaimo Bar','The BC classic: chocolate, custard and coconut crumb.','Bakery',4.25,40,'','bar',true,14),
('Breakfast Sandwich','A hearty morning favourite.','Kitchen',9.50,35,'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=700','sandwich',true,15),
('Avocado Toast','Smashed avocado, chili flakes and lemon on sourdough.','Kitchen',10.50,25,'','toast',false,16),
('Turkey Club Panini','Roast turkey, bacon, cheddar and greens, pressed hot.','Kitchen',12.50,25,'','sandwich',false,17),
('Soup of the Day','Made from scratch in small batches. Ask what is simmering.','Kitchen',7.95,30,'','soup',false,18);
insert into public.promotions(code,percent,active,members_only) values('WELCOME10',10,true,false),('MEMBER15',15,true,true);

-- Live updates for every visitor when the menu, content or offers change.
alter publication supabase_realtime add table public.products, public.site_settings, public.promotions;

-- After creating your administrator in Authentication → Users, authorize it with:
-- insert into public.admin_users(user_id) values ('PASTE-AUTH-USER-UUID-HERE');
