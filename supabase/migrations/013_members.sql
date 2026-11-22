create table if not exists public.members (
  id text primary key,
  full_name text not null,
  phone text not null unique,
  whatsapp_phone text not null,
  email text,
  birthday date,
  location text,
  notes text,
  plan text not null default 'Monthly',
  start_date date not null default current_date,
  end_date date,
  status text not null default 'Active' check (status in ('Active', 'Paused', 'Expired')),
  fee numeric(12,2),
  payment_method text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists members_name_idx on public.members (full_name);
create index if not exists members_status_idx on public.members (status);

alter table public.members enable row level security;

drop policy if exists members_select on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;

create policy members_select on public.members for select to authenticated
  using (public.is_staff_user());
create policy members_insert on public.members for insert to authenticated
  with check (public.is_staff_user());
create policy members_update on public.members for update to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy members_delete on public.members for delete to authenticated
  using (public.is_owner());
