-- Add color variants for products (mainly single flowers).
-- Safe to run more than once.

alter table public.products
  add column if not exists variants jsonb not null default '[]'::jsonb;

comment on column public.products.variants is
  'JSON array of color variants: [{"id":"white","label":"Белая","image":"/uploads/...","price":150,"oldPrice":190}]';

-- Example: convert a product like "Лилия белая / розовая" into one card.
-- update public.products
-- set name = 'Лилия',
--     variants = '[
--       {"id":"white","label":"Белая","image":"/uploads/lily-white.png","price":150},
--       {"id":"pink","label":"Розовая","image":"/uploads/lily-pink.png","price":150}
--     ]'::jsonb
-- where id = 123;
