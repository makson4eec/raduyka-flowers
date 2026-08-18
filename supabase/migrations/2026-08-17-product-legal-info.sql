-- Factual product information needed for distance selling and, for plants, species/care information.
-- The columns are empty by design: fill them with the real facts for each product before public launch.

alter table public.products
  add column if not exists species_info text not null default '',
  add column if not exists manufacturer text not null default '',
  add column if not exists manufacturer_address text not null default '',
  add column if not exists manufacturing_place text not null default '',
  add column if not exists importer_info text not null default '',
  add column if not exists shelf_life text not null default '',
  add column if not exists warranty_info text not null default '',
  add column if not exists safe_use text not null default '',
  add column if not exists conformity_info text not null default '',
  add column if not exists conformity_url text not null default '';

comment on column public.products.species_info is
  'Species name / actual species composition for plants and bouquets.';
comment on column public.products.manufacturing_place is
  'Factual place of manufacture disclosed to the consumer before contract.';

comment on column public.products.conformity_url is
  'URL of the certificate/declaration registry record when mandatory conformity confirmation applies.';
