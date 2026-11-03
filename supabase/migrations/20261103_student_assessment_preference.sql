alter table public.student_profiles
  add column if not exists assessment_preference text not null default 'planned'
    check (assessment_preference in ('planned','declined','not_applicable')),
  add column if not exists assessment_preference_note text not null default '',
  add column if not exists assessment_preference_updated_at timestamptz,
  add column if not exists assessment_preference_updated_by uuid references public.profiles(id);

create or replace function public.set_student_assessment_preference(
  p_student_id uuid, p_preference text, p_note text default ''
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (
    public.is_admin() or (
      exists (select 1 from public.profiles p where p.id=auth.uid()
        and p.is_active and p.deleted_at is null and p.role='trainer')
      and public.trainer_has_student(p_student_id)
    )
  ) then raise exception 'Sem permissão para alterar este aluno.' using errcode='42501'; end if;
  if p_preference is null or p_preference not in ('planned','declined','not_applicable') then
    raise exception 'Opção de avaliação inválida.' using errcode='22023';
  end if;
  if char_length(coalesce(p_note,''))>1000 then
    raise exception 'A observação deve ter no máximo 1000 caracteres.' using errcode='22023';
  end if;
  update public.student_profiles set
    assessment_preference=p_preference, assessment_preference_note=btrim(coalesce(p_note,'')),
    assessment_preference_updated_at=now(), assessment_preference_updated_by=auth.uid()
  where id=p_student_id and deleted_at is null;
  if not found then raise exception 'Aluno indisponível.'; end if;
end;
$$;
revoke all on function public.set_student_assessment_preference(uuid,text,text) from public,anon;
grant execute on function public.set_student_assessment_preference(uuid,text,text) to authenticated;
