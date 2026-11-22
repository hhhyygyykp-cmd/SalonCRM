-- Belle subscription packages (programmer guide)

create table if not exists public.customer_memberships (
  id text primary key,
  customer_id text not null references public.customers (id) on delete cascade,
  product_id text not null,
  product_name text not null,
  service_name text not null,
  model text not null check (model in ('monthly_cycle', 'session_balance')),
  price numeric(12,2) not null,
  purchase_date date not null,
  activation_date date,
  expiry_date date,
  total_sessions int not null,
  used_sessions int not null default 0,
  status text not null default 'Pending' check (status in ('Pending', 'Active', 'Frozen', 'Expired', 'Completed')),
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_memberships_customer_idx on public.customer_memberships (customer_id);
create index if not exists customer_memberships_status_idx on public.customer_memberships (status);

create table if not exists public.membership_cycles (
  id text primary key,
  membership_id text not null references public.customer_memberships (id) on delete cascade,
  cycle_index int not null,
  start_date date not null,
  end_date date not null,
  status text not null check (status in ('Upcoming', 'Available', 'Used', 'Expired')),
  used_at timestamptz,
  used_by uuid references public.profiles (id)
);

create index if not exists membership_cycles_membership_idx on public.membership_cycles (membership_id);

create table if not exists public.membership_usages (
  id text primary key,
  membership_id text not null references public.customer_memberships (id) on delete cascade,
  cycle_id text references public.membership_cycles (id) on delete set null,
  used_at timestamptz not null default now(),
  staff_id uuid references public.profiles (id),
  notes text
);

create index if not exists membership_usages_membership_idx on public.membership_usages (membership_id);

alter table public.customer_memberships enable row level security;
alter table public.membership_cycles enable row level security;
alter table public.membership_usages enable row level security;

drop policy if exists customer_memberships_select on public.customer_memberships;
drop policy if exists customer_memberships_insert on public.customer_memberships;
drop policy if exists customer_memberships_update on public.customer_memberships;
drop policy if exists customer_memberships_delete on public.customer_memberships;
create policy customer_memberships_select on public.customer_memberships for select to authenticated
  using (public.is_staff_user());
create policy customer_memberships_insert on public.customer_memberships for insert to authenticated
  with check (public.is_staff_user());
create policy customer_memberships_update on public.customer_memberships for update to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy customer_memberships_delete on public.customer_memberships for delete to authenticated
  using (public.is_owner());

drop policy if exists membership_cycles_select on public.membership_cycles;
drop policy if exists membership_cycles_insert on public.membership_cycles;
drop policy if exists membership_cycles_update on public.membership_cycles;
drop policy if exists membership_cycles_delete on public.membership_cycles;
create policy membership_cycles_select on public.membership_cycles for select to authenticated
  using (public.is_staff_user());
create policy membership_cycles_insert on public.membership_cycles for insert to authenticated
  with check (public.is_staff_user());
create policy membership_cycles_update on public.membership_cycles for update to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy membership_cycles_delete on public.membership_cycles for delete to authenticated
  using (public.is_owner());

drop policy if exists membership_usages_select on public.membership_usages;
drop policy if exists membership_usages_insert on public.membership_usages;
drop policy if exists membership_usages_update on public.membership_usages;
drop policy if exists membership_usages_delete on public.membership_usages;
create policy membership_usages_select on public.membership_usages for select to authenticated
  using (public.is_staff_user());
create policy membership_usages_insert on public.membership_usages for insert to authenticated
  with check (public.is_staff_user());
create policy membership_usages_update on public.membership_usages for update to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy membership_usages_delete on public.membership_usages for delete to authenticated
  using (public.is_owner());
