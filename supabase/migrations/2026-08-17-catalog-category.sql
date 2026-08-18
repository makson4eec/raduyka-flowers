-- Separate ready-made bouquets from compositions in the admin catalog.
-- Existing products remain available and are treated as bouquets until edited.

alter table public.products
  add column if not exists catalog_category text not null default 'bouquet';

alter table public.products
  drop constraint if exists products_catalog_category_check;

alter table public.products
  add constraint products_catalog_category_check
  check (catalog_category in ('bouquet', 'composition'));

comment on column public.products.catalog_category is
  'Admin category for ready-made products: bouquet or composition.';
