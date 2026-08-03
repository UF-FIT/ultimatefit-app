-- ULTIMATE FIT APP
-- Migration 002 (corrected): bootstrap first administrator
-- Safe to run after the failed previous attempt because that transaction was rolled back.

begin;

do $$
declare
  v_user_count integer;
  v_user_id uuid;
begin
  select count(*)
    into v_user_count
  from auth.users
  where lower(email) = lower('geral@ultimatefit.pt');

  if v_user_count = 0 then
    raise exception 'No auth user was found for geral@ultimatefit.pt';
  end if;

  if v_user_count > 1 then
    raise exception 'More than one auth user was found for geral@ultimatefit.pt';
  end if;

  select id
    into v_user_id
  from auth.users
  where lower(email) = lower('geral@ultimatefit.pt')
  limit 1;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
  ) then
    raise exception 'The public profile for geral@ultimatefit.pt was not created';
  end if;

  update public.profiles
  set
    role = 'admin'::public.app_role,
    full_name = case
      when nullif(btrim(full_name), '') is null
        or lower(btrim(full_name)) = 'geral'
      then 'Rui Marques'
      else full_name
    end,
    is_active = true
  where id = v_user_id;

  delete from public.student_profiles
  where profile_id = v_user_id;
end
$$;

commit;
