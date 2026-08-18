-- Радуйка: безопасная настройка вариантов цветов.
-- Ничего не удаляет. Старые дубли лилий/гипсофилы только скрываются с витрины.
-- Повторный запуск безопасен.

begin;

alter table public.products
  add column if not exists variants jsonb not null default '[]'::jsonb;

-- ЛИЛИЯ: одна карточка + варианты Белая / Розовая.
do $$
declare
  keeper_id bigint;
  base_price integer;
  base_old integer;
  current_variants jsonb;
begin
  select id, price, old_price, coalesce(variants, '[]'::jsonb)
    into keeper_id, base_price, base_old, current_variants
  from public.products
  where kind = 'flower' and lower(name) like '%лили%'
  order by visible desc, sort_order, id
  limit 1;

  if keeper_id is not null then
    if jsonb_array_length(current_variants) < 2 then
      current_variants := jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'id', 'white',
          'label', 'Белая',
          'image', '/images/lily-white.png',
          'price', greatest(coalesce(base_price, 1), 1),
          'oldPrice', base_old
        )),
        jsonb_strip_nulls(jsonb_build_object(
          'id', 'pink',
          'label', 'Розовая',
          'image', '/images/lily-pink.png',
          'price', greatest(coalesce(base_price, 1), 1),
          'oldPrice', base_old
        ))
      );
    end if;

    update public.products
    set name = 'Лилия',
        image = coalesce(current_variants->0->>'image', '/images/lily-white.png'),
        variants = current_variants,
        updated_at = now()
    where id = keeper_id;

    update public.products
    set visible = false,
        featured = false,
        updated_at = now()
    where kind = 'flower'
      and id <> keeper_id
      and lower(name) like '%лили%';
  end if;
end $$;

-- ГИПСОФИЛА: одна карточка + варианты Радужная / Белая.
do $$
declare
  keeper_id bigint;
  base_price integer;
  base_old integer;
  current_variants jsonb;
begin
  select id, price, old_price, coalesce(variants, '[]'::jsonb)
    into keeper_id, base_price, base_old, current_variants
  from public.products
  where kind = 'flower' and lower(name) like '%гипсофил%'
  order by visible desc, sort_order, id
  limit 1;

  if keeper_id is not null then
    if jsonb_array_length(current_variants) < 2 then
      current_variants := jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'id', 'rainbow',
          'label', 'Радужная',
          'image', '/images/gypsophila-rainbow.png',
          'price', greatest(coalesce(base_price, 1), 1),
          'oldPrice', base_old
        )),
        jsonb_strip_nulls(jsonb_build_object(
          'id', 'white',
          'label', 'Белая',
          'image', '/images/gypsophila-white.png',
          'price', greatest(coalesce(base_price, 1), 1),
          'oldPrice', base_old
        ))
      );
    end if;

    update public.products
    set name = 'Гипсофила',
        image = coalesce(current_variants->0->>'image', '/images/gypsophila-rainbow.png'),
        variants = current_variants,
        updated_at = now()
    where id = keeper_id;

    update public.products
    set visible = false,
        featured = false,
        updated_at = now()
    where kind = 'flower'
      and id <> keeper_id
      and lower(name) like '%гипсофил%';
  end if;
end $$;

commit;

-- Проверка результата. Должно быть по одной видимой карточке Лилии и Гипсофилы.
select id, name, visible, price, image, variants
from public.products
where kind = 'flower'
  and (lower(name) like '%лили%' or lower(name) like '%гипсофил%')
order by name, visible desc, id;
