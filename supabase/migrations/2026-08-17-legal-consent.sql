-- Evidence of the legal information shown/accepted during checkout.
-- Run this once in Supabase SQL Editor before deploying the updated checkout.

alter table public.orders
  add column if not exists privacy_notice_version text,
  add column if not exists offer_version text,
  add column if not exists legal_accepted_at timestamptz;

comment on column public.orders.privacy_notice_version is
  'Version of the privacy notice displayed during checkout; this is not recorded as consent.';
comment on column public.orders.offer_version is
  'Version of the public offer accepted during checkout.';
comment on column public.orders.legal_accepted_at is
  'Server timestamp of checkout offer acceptance.';
