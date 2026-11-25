-- Category editing and up to three product photos. Safe to run repeatedly.
begin;

create table if not exists public.catalog_categories (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '',
  image text not null,
  target text not null default 'catalog' check (target in ('catalog', 'flowers', 'delivery')),
  theme text not null default 'cream' check (theme in ('cream', 'blush')),
  visible boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.catalog_categories enable row level security;
revoke all on table public.catalog_categories from anon, authenticated;
grant all on table public.catalog_categories to service_role;

insert into public.catalog_categories (id, name, image, target, theme, sort_order) values
  ('bouquet', 'Букеты', '/images/bouquet-3.webp', 'catalog', 'cream', 10),
  ('flowers', 'Цветы', '/images/bouquet-6.webp', 'flowers', 'blush', 20),
  ('delivery', E'Доставка\nпо городу', '/images/bouquet-4.webp', 'delivery', 'cream', 30),
  ('composition', E'Цветочные\nкомпозиции', '/images/composition-roses.webp', 'catalog', 'blush', 40),
  ('balloons', E'Воздушные\nшары', '/images/balloons.svg', 'catalog', 'cream', 50)
on conflict (id) do nothing;

alter table public.products
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists category_id text references public.catalog_categories(id);

-- Give legacy products a stable category so later category deletion is protected
-- by the foreign key, including products beyond the API's default row limit.
update public.products set category_id = case
  when kind = 'flower' then 'flowers'
  when lower(name || ' ' || subtitle) ~ '(^|[^а-яё])шар(ы|ов|а|ами)?($|[^а-яё])' then 'balloons'
  when catalog_category = 'composition' or lower(name || ' ' || subtitle) ~ 'композиц|корзин|ящик' then 'composition'
  else 'bouquet'
end where category_id is null and kind <> 'builder';

alter table public.products drop constraint if exists products_images_check;
alter table public.products add constraint products_images_check check (
  jsonb_typeof(images) = 'array'
  and jsonb_array_length(images) <= 3
  and not jsonb_path_exists(images, '$[*] ? (@.type() != "string")')
);

comment on column public.products.images is 'Gallery photos including the cover, at most three. Empty arrays use the existing image.';
comment on column public.products.category_id is 'Optional managed category. NULL preserves the legacy catalog classification.';
create table if not exists public.site_content (
  id text primary key,
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
revoke all on table public.site_content from anon, authenticated;
grant all on table public.site_content to service_role;

notify pgrst, 'reload schema';
commit;
