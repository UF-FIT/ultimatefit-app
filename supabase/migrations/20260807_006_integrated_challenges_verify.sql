-- Verify Migration 006
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('challenges','challenge_participants','challenge_records')
order by table_name;

select tablename, policyname, cmd
from pg_policies
where schemaname='public'
  and tablename in ('challenges','challenge_participants','challenge_records')
order by tablename, policyname;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in ('can_manage_challenges_global','can_manage_challenge_student','challenge_leaderboard','validate_challenge_record_date')
order by routine_name;

select feature_key, is_enabled, allowed_roles
from public.feature_flags
where feature_key='challenges';
