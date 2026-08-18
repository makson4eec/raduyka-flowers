-- Consolidated migration for the 17.08.2026 legal/readiness update.
-- Safe to run more than once. Run in the Supabase SQL Editor before deploying the updated app.

alter table public.orders
  add column if not exists privacy_notice_version text,
  add column if not exists offer_version text,
  add column if not exists legal_accepted_at timestamptz;

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

comment on column public.orders.privacy_notice_version is
  'Version of the privacy notice displayed during checkout; not a consent record.';
comment on column public.orders.offer_version is
  'Version of the public offer accepted during checkout.';
comment on column public.orders.legal_accepted_at is
  'Server timestamp of checkout offer acceptance.';
comment on column public.products.species_info is
  'Species name / actual species composition for plants and bouquets.';
comment on column public.products.manufacturing_place is
  'Factual place of manufacture disclosed to the consumer before contract.';

comment on column public.products.conformity_url is
  'URL of the certificate/declaration registry record when mandatory conformity confirmation applies.';
