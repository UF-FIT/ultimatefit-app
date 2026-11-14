create index if not exists payment_duos_member_a_idx on public.payment_duos(member_a_id);
create index if not exists payment_duos_member_b_idx on public.payment_duos(member_b_id);

drop policy if exists payment_duos_manager_read on public.payment_duos;
create policy payment_duos_manager_read on public.payment_duos for select to authenticated
 using(owner_id=(select auth.uid()) and (select public.payment_can_manage()));

drop policy if exists payment_duo_settlements_manager_read on public.payment_duo_settlements;
create policy payment_duo_settlements_manager_read on public.payment_duo_settlements for select to authenticated
 using(owner_id=(select auth.uid()) and (select public.payment_can_manage()));