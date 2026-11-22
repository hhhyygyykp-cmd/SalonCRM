-- Track Gold/Premium inactivity so we can warn, lapse the displayed tier, and restore on the next visit.
-- Lifetime spend is never reduced.

alter table public.customers
  add column if not exists loyalty_lapsed_from text
  check (loyalty_lapsed_from is null or loyalty_lapsed_from in ('Gold', 'Premium'));
