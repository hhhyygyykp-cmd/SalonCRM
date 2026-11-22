-- Unused packages can be deleted by staff. Used packages cannot.

drop policy if exists customer_memberships_delete on public.customer_memberships;
create policy customer_memberships_delete on public.customer_memberships for delete to authenticated
  using (public.is_staff_user());

drop policy if exists membership_cycles_delete on public.membership_cycles;
create policy membership_cycles_delete on public.membership_cycles for delete to authenticated
  using (public.is_staff_user());

drop policy if exists membership_usages_delete on public.membership_usages;
create policy membership_usages_delete on public.membership_usages for delete to authenticated
  using (public.is_staff_user());

create or replace function public.prevent_used_membership_delete()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.used_sessions, 0) > 0 then
    raise exception 'Cannot delete a package after a session has already been used';
  end if;
  if exists (select 1 from public.membership_usages where membership_id = old.id) then
    raise exception 'Cannot delete a package after a session has already been used';
  end if;
  if exists (select 1 from public.membership_cycles where membership_id = old.id and status = 'Used') then
    raise exception 'Cannot delete a package after a session has already been used';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_used_membership_delete on public.customer_memberships;
create trigger prevent_used_membership_delete
before delete on public.customer_memberships
for each row execute function public.prevent_used_membership_delete();
