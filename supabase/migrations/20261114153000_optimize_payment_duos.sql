create index if not exists payment_duos_member_a_idx on public.payment_duos(member_a_id);
create index if not exists payment_duos_member_b_idx on public.payment_duos(member_b_id);

alter policy payment_duos_manager_read on public.payment_duos
 using(owner_id=(select auth.uid()) and (select public.payment_can_manage()));

alter policy payment_duo_settlements_manager_read on public.payment_duo_settlements
 using(owner_id=(select auth.uid()) and (select public.payment_can_manage()));