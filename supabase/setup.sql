create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  name text not null,
  price integer not null check (price > 0),
  category text not null,
  description text not null,
  colors text[] not null default '{}',
  art text not null default 'stand',
  color text not null default '#258fff',
  image_url text,
  facebook text,
  instagram text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.products (id, name, price, category, description, colors, art, color)
values
  ('p-vase', 'Ripple Vase', 890, 'Home', 'A sculptural little home for your favorite stems.', array['Arctic white', 'Ocean blue', 'Terracotta'], 'vase', '#2498ff'),
  ('p-lamp', 'Orbit Desk Light', 1490, 'Desk', 'A soft, modern glow for late-night ideas.', array['Midnight', 'Cloud white', 'Sunset'], 'lamp', '#ff7918'),
  ('p-planter', 'Little Leaf Planter', 650, 'Home', 'A cheerful new home for a tiny desk plant.', array['Sage', 'Bone', 'Coral'], 'planter', '#55d3a0'),
  ('p-gear', 'Motion Fidget', 390, 'Accessories', 'Pocket-sized gears made to keep curious hands moving.', array['Electric blue', 'Graphite', 'Orange'], 'gear', '#ffc14f'),
  ('p-stand', 'Fold Phone Stand', 450, 'Desk', 'A neat, angle-ready place for your everyday screen.', array['Space blue', 'Black', 'White'], 'stand', '#48bfff'),
  ('p-figure', 'Mini Maker Figure', 550, 'Collectibles', 'A friendly little desk companion, printed layer by layer.', array['Orange', 'Blue', 'Surprise me'], 'figure', '#c68aff')
on conflict (id) do nothing;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  customer text not null,
  phone text not null,
  address text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total integer not null check (total > 0),
  status text not null default 'Payment pending',
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id text primary key,
  value text not null default ''
);

insert into public.site_settings (id, value)
values ('payment_qr', '')
on conflict (id) do nothing;

grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.orders to authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "Anyone can view products" on public.products;
create policy "Anyone can view products"
  on public.products for select
  to anon, authenticated
  using (true);

drop policy if exists "AGAM admin can manage products" on public.products;
create policy "AGAM admin can manage products"
  on public.products for all
  to authenticated
  using (lower((select auth.jwt() ->> 'email')) = 'akileshan2023@gmail.com')
  with check (lower((select auth.jwt() ->> 'email')) = 'akileshan2023@gmail.com');

drop policy if exists "Customers and AGAM admin can view permitted orders" on public.orders;
create policy "Customers and AGAM admin can view permitted orders"
  on public.orders for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or lower((select auth.jwt() ->> 'email')) = 'akileshan2023@gmail.com'
  );

drop policy if exists "Anyone can view public site settings" on public.site_settings;
create policy "Anyone can view public site settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "AGAM admin can manage site settings" on public.site_settings;
create policy "AGAM admin can manage site settings"
  on public.site_settings for all
  to authenticated
  using (lower((select auth.jwt() ->> 'email')) = 'akileshan2023@gmail.com')
  with check (lower((select auth.jwt() ->> 'email')) = 'akileshan2023@gmail.com');

create or replace function public.place_order(
  p_customer text,
  p_phone text,
  p_address text,
  p_items jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_color text;
  v_items jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_order public.orders;
begin
  if v_user_id is null then
    raise exception 'Sign in before placing an order.';
  end if;
  if nullif(trim(p_customer), '') is null
    or nullif(trim(p_phone), '') is null
    or nullif(trim(p_address), '') is null then
    raise exception 'Name, phone number, and delivery address are required.';
  end if;
  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 30 then
    raise exception 'The order must contain between 1 and 30 items.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if (v_item ->> 'quantity') !~ '^[0-9]{1,2}$' then
      raise exception 'Invalid product quantity.';
    end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Product quantities must be between 1 and 99.';
    end if;

    select * into v_product
    from public.products
    where id = v_item ->> 'id';
    if not found then
      raise exception 'A product in your cart is no longer available.';
    end if;

    v_color := v_item ->> 'color';
    if not coalesce(v_color = any(v_product.colors), false) then
      raise exception 'A selected product finish is no longer available.';
    end if;

    if v_total::bigint + v_product.price::bigint * v_quantity > 2147483647 then
      raise exception 'The order total is too large.';
    end if;
    v_total := v_total + v_product.price * v_quantity;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'color', v_color,
      'quantity', v_quantity,
      'unitPrice', v_product.price
    ));
  end loop;

  insert into public.orders (user_id, email, customer, phone, address, items, total)
  values (
    v_user_id,
    coalesce(auth.jwt() ->> 'email', ''),
    trim(p_customer),
    trim(p_phone),
    trim(p_address),
    v_items,
    v_total
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.place_order(text, text, text, jsonb) from public, anon;
grant execute on function public.place_order(text, text, text, jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('payment-qr', 'payment-qr', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view AGAM images" on storage.objects;
create policy "Anyone can view AGAM images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('product-images', 'payment-qr'));

drop policy if exists "AGAM admin can upload images" on storage.objects;
create policy "AGAM admin can upload images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('product-images', 'payment-qr')
    and lower((select auth.jwt() ->> 'email')) = 'akileshan2023@gmail.com'
  );

drop policy if exists "AGAM admin can update images" on storage.objects;
create policy "AGAM admin can update images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('product-images', 'payment-qr')
    and lower((select auth.jwt() ->> 'email')) = 'akileshan2023@gmail.com'
  )
  with check (
    bucket_id in ('product-images', 'payment-qr')
    and lower((select auth.jwt() ->> 'email')) = 'akileshan2023@gmail.com'
  );

drop policy if exists "AGAM admin can delete images" on storage.objects;
create policy "AGAM admin can delete images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('product-images', 'payment-qr')
    and lower((select auth.jwt() ->> 'email')) = 'akileshan2023@gmail.com'
  );
