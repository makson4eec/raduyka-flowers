-- Объединяет белую и розовую лилии в одну карточку "Лилия".
-- Безопасно запускать повторно.

begin;

alter table public.products
  add column if not exists variants jsonb not null default '[]'::jsonb;

-- Если раньше были отдельные карточки, оставляем одну и превращаем её в общую.
with lily_rows as (
  select id, name, price, old_price, image, sort_order, subtitle, care, stock, palette, visible, featured
  from public.products
  where kind = 'flower'
    and lower(name) like '%лили%'
), keeper as (
  select id
  from lily_rows
  order by sort_order, id
  limit 1
)
update public.products p
set
  name = 'Лилия',
  subtitle = 'Крупный выразительный цветок с длинными бутонами и эффектным раскрытием. Подходит для высоких букетов и торжественных композиций.',
  care = 'Поставьте лилии в высокую чистую вазу и удалите листья ниже уровня воды. Меняйте воду и обновляйте срез каждые 1–2 дня. После раскрытия можно аккуратно удалить пыльники.',
  image = '/images/lily-white.png',
  variants = jsonb_build_array(
    jsonb_build_object(
      'id', 'white',
      'label', 'Белая',
      'image', '/images/lily-white.png',
      'price', coalesce((select price from lily_rows where lower(name) like '%бел%' order by id limit 1), p.price),
      'oldPrice', (select old_price from lily_rows where lower(name) like '%бел%' order by id limit 1)
    ),
    jsonb_build_object(
      'id', 'pink',
      'label', 'Розовая',
      'image', '/images/lily-pink.png',
      'price', coalesce((select price from lily_rows where lower(name) like '%роз%' order by id limit 1), p.price),
      'oldPrice', (select old_price from lily_rows where lower(name) like '%роз%' order by id limit 1)
    )
  ),
  palette = 'white',
  updated_at = now()
where p.id = (select id from keeper);

-- Удаляем остальные старые карточки лилий, чтобы на витрине осталась одна.
delete from public.products
where kind = 'flower'
  and lower(name) like '%лили%'
  and id <> (
    select id
    from public.products
    where kind = 'flower' and name = 'Лилия'
    order by sort_order, id
    limit 1
  );

commit;

-- Объединяем белую и радужную гипсофилу в одну карточку "Гипсофила".
begin;

with gip_rows as (
  select id, name, price, old_price, image, sort_order
  from public.products
  where kind = 'flower'
    and lower(name) like 'гипсофила%'
), keeper as (
  select id from gip_rows order by sort_order, id limit 1
)
update public.products p
set
  name = 'Гипсофила',
  image = coalesce((select image from gip_rows where lower(name) like '%бел%' order by id limit 1), p.image),
  variants = jsonb_build_array(
    jsonb_build_object(
      'id', 'white',
      'label', 'Белая',
      'image', coalesce((select image from gip_rows where lower(name) like '%бел%' order by id limit 1), p.image),
      'price', coalesce((select price from gip_rows where lower(name) like '%бел%' order by id limit 1), p.price),
      'oldPrice', (select old_price from gip_rows where lower(name) like '%бел%' order by id limit 1)
    ),
    jsonb_build_object(
      'id', 'rainbow',
      'label', 'Радужная',
      'image', coalesce((select image from gip_rows where lower(name) like '%радуж%' order by id limit 1), p.image),
      'price', coalesce((select price from gip_rows where lower(name) like '%радуж%' order by id limit 1), p.price),
      'oldPrice', (select old_price from gip_rows where lower(name) like '%радуж%' order by id limit 1)
    )
  ),
  updated_at = now()
where p.id = (select id from keeper)
  and (select count(*) from gip_rows) > 0;

delete from public.products
where kind = 'flower'
  and lower(name) like 'гипсофила%'
  and id <> (
    select id
    from public.products
    where kind = 'flower' and name = 'Гипсофила'
    order by sort_order, id
    limit 1
  );

commit;
