-- Retire only reported/prescribed effort in workout snapshots and summary RPE.
-- Keep the nullable workout_items.rpe column for compatibility with save_workout_plan.
begin;

lock table public.workout_runs in share row exclusive mode;

create temporary table rpe_cleanup_before on commit drop as
select id, to_jsonb(wr) - 'state' - 'summary' - 'updated_at' as other_fields,
       state - 'activities' as other_state,
       summary - 'averageRpe' as expected_summary,
       (select coalesce(jsonb_agg(a.value - 'rpe' - 'prescribedRpe' order by a.ordinality), '[]'::jsonb)
        from jsonb_array_elements(wr.state->'activities') with ordinality a) as expected_activities
from public.workout_runs wr;

create or replace function public.strip_retired_workout_effort()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(new.state->'activities') = 'array' then
    new.state := jsonb_set(new.state, '{activities}', (
      select coalesce(jsonb_agg(
        case when jsonb_typeof(a.value) = 'object' then a.value - 'rpe' - 'prescribedRpe' else a.value end
        order by a.ordinality), '[]'::jsonb)
      from jsonb_array_elements(new.state->'activities') with ordinality a
    ), false);
  end if;
  if jsonb_typeof(new.summary) = 'object' then
    new.summary := new.summary - 'averageRpe';
  end if;
  return new;
end;
$$;
revoke all on function public.strip_retired_workout_effort() from public, anon, authenticated;

create trigger workout_runs_strip_retired_effort
before insert or update of state, summary on public.workout_runs
for each row execute function public.strip_retired_workout_effort();

-- Trigger also strips fields from older clients without changing completion RPCs.
update public.workout_runs wr set state = wr.state, summary = wr.summary
where wr.summary ? 'averageRpe'
   or exists (select 1 from jsonb_array_elements(wr.state->'activities') a
              where a ? 'rpe' or a ? 'prescribedRpe');

do $$
begin
  if exists (
    select 1 from rpe_cleanup_before b full join public.workout_runs wr on wr.id=b.id
    where b.id is null or wr.id is null
      or b.other_fields is distinct from (to_jsonb(wr) - 'state' - 'summary' - 'updated_at')
      or b.other_state is distinct from (wr.state - 'activities')
      or b.expected_summary is distinct from wr.summary
      or b.expected_activities is distinct from coalesce(wr.state->'activities','[]'::jsonb)
  ) then raise exception 'RPE cleanup changed unrelated workout data'; end if;
end;
$$;
commit;
