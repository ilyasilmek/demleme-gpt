-- DEMLEME / Supabase SQL Editor / Run once on a fresh project.
-- Authentication > Providers: Enable Email + Anonymous sign-ins.
-- The anon/public key is safe in the browser; never publish a service_role key.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'staff')),
  station_id uuid references public.stations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 70),
  icon text not null default 'mug',
  category text not null default 'Diğer',
  is_available boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id),
  station_id uuid not null references public.stations(id),
  status text not null default 'new' check (status in ('new', 'preparing', 'on_the_way', 'delivered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity int not null check (quantity between 1 and 20)
);

create index if not exists orders_station_idx on public.orders(station_id, created_at desc);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists orders_customer_idx on public.orders(customer_id);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- This helper is SECURITY DEFINER to avoid recursive profiles RLS checks.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.profiles where id = (select auth.uid()) and role = 'staff'
); $$;

alter table public.stations enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "staff_or_own_station" on public.stations for select to authenticated
  using (public.is_staff() or id = (select station_id from public.profiles where id = (select auth.uid())));
create policy "read_own_profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());
create policy "read_menu" on public.products for select to authenticated using (true);
create policy "staff_manage_products" on public.products for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "read_orders" on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_staff());
create policy "read_order_items" on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o where o.id = order_id
      and (o.customer_id = (select auth.uid()) or public.is_staff())
  ));

-- QR secrets are only stored as SHA-256 hashes. Customer never reads token_hash.
create or replace function public.claim_station(p_token text)
returns void language plpgsql security definer set search_path = pg_catalog, public, extensions
as $$
declare v_station_id uuid;
begin
  if auth.uid() is null then raise exception 'Oturum açılamadı.'; end if;
  if p_token is null or length(p_token) > 200 then raise exception 'QR kodu geçersiz.'; end if;
  select s.id into v_station_id from public.stations s
   where s.token_hash = encode(digest(p_token, 'sha256'), 'hex') and s.active = true;
  if v_station_id is null then raise exception 'QR kodu geçersiz veya kullanım dışı.'; end if;
  insert into public.profiles(id, role, station_id)
  values (auth.uid(), 'customer', v_station_id)
  on conflict (id) do update set station_id = excluded.station_id
    where public.profiles.role = 'customer';
  if not found then raise exception 'Bu hesap personel hesabıdır. Çıkış yapıp QR kodunu tekrar okutun.'; end if;
end; $$;

create or replace function public.create_station(p_name text)
returns table(station_id uuid, token text) language plpgsql security definer set search_path = pg_catalog, public, extensions
as $$
declare v_token text; v_id uuid;
begin
  if not public.is_staff() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  if p_name is null or length(trim(p_name)) < 1 or length(trim(p_name)) > 60 then
    raise exception 'Bölüm adı 1-60 karakter olmalıdır.';
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.stations(name, token_hash)
  values (trim(p_name), encode(digest(v_token, 'sha256'), 'hex')) returning id into v_id;
  return query select v_id, v_token;
end; $$;

create or replace function public.rotate_station_token(p_station_id uuid)
returns table(station_id uuid, token text) language plpgsql security definer set search_path = pg_catalog, public, extensions
as $$
declare v_token text;
begin
  if not public.is_staff() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  update public.stations set token_hash = encode(digest(v_token, 'sha256'), 'hex')
  where id = p_station_id and active = true;
  if not found then raise exception 'Bölüm bulunamadı.'; end if;
  return query select p_station_id, v_token;
end; $$;

-- Orders + items created together in a transaction. Inputs validated on server.
create or replace function public.place_order(p_items jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, extensions
as $$
declare
  v_station uuid;
  v_order uuid;
  v_item jsonb;
  v_product uuid;
  v_quantity int;
  v_total int := 0;
begin
  select p.station_id into v_station from public.profiles p
   join public.stations s on s.id = p.station_id and s.active = true
   where p.id = auth.uid() and p.role = 'customer';
  if v_station is null then raise exception 'Sipariş vermek için QR kodunuzu okutun.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Sipariş en az 1, en fazla 20 farklı ürün içermelidir.';
  end if;
  -- Validate ALL items before creating the order.
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Geçersiz ürün.'; end if;
    v_product := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::int;
    if v_product is null or v_quantity is null or v_quantity not between 1 and 20 or
       not exists(select 1 from public.products where id = v_product and is_available) then
      raise exception 'Ürün veya adet geçersiz.';
    end if;
    v_total := v_total + v_quantity;
  end loop;
  if v_total > 60 then raise exception 'Tek siparişte en fazla 60 içecek olabilir.'; end if;
  insert into public.orders(customer_id, station_id) values (auth.uid(), v_station) returning id into v_order;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items(order_id, product_id, quantity)
    values (v_order, (v_item->>'product_id')::uuid, (v_item->>'quantity')::int);
  end loop;
  return v_order;
end; $$;

create or replace function public.advance_order(p_order_id uuid, p_new_status text)
returns void language plpgsql security definer set search_path = pg_catalog, public, extensions
as $$
begin
  if not public.is_staff() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  update public.orders set status = p_new_status, updated_at = now()
  where id = p_order_id and (
    (status = 'new' and p_new_status = 'preparing') or
    (status = 'preparing' and p_new_status = 'on_the_way') or
    (status = 'on_the_way' and p_new_status = 'delivered')
  );
  if not found then raise exception 'Sipariş durumu değiştirilemedi. Sayfayı yenileyin.'; end if;
end; $$;

-- RPC methods are only available to an authenticated user (including anonymous-auth users).
revoke all on function public.is_staff() from public, anon;
revoke all on function public.claim_station(text) from public, anon;
revoke all on function public.create_station(text) from public, anon;
revoke all on function public.rotate_station_token(uuid) from public, anon;
revoke all on function public.place_order(jsonb) from public, anon;
revoke all on function public.advance_order(uuid, text) from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.claim_station(text) to authenticated;
grant execute on function public.create_station(text) to authenticated;
grant execute on function public.rotate_station_token(uuid) to authenticated;
grant execute on function public.place_order(jsonb) to authenticated;
grant execute on function public.advance_order(uuid, text) to authenticated;

insert into public.products(name, icon, category, sort_order) values
 ('İnce belli çay', 'tea', 'Çay', 1),
 ('Açık çay', 'tea-light', 'Çay', 2),
 ('Türk kahvesi', 'coffee', 'Kahve', 3),
 ('Nescafe', 'mug', 'Kahve', 4),
 ('Ihlamur', 'herbal', 'Diğer', 5),
 ('Su', 'water', 'Diğer', 6);

-- Dashboard > Database > Publications: enable realtime on orders (also done below).
alter publication supabase_realtime add table public.orders;

-- MANUAL FIRST STAFF SETUP:
-- 1. Supabase > Authentication > Users > Add user (email/password).
-- 2. Replace the email below with that staff user's address; execute in SQL Editor:
-- insert into public.profiles(id, role)
-- select id, 'staff' from auth.users where email = 'YOUR_STAFF_EMAIL'
-- on conflict (id) do update set role='staff', station_id=null;
