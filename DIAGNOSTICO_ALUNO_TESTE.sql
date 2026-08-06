-- ULTIMATE FIT APP — diagnóstico do aluno de teste
-- Apenas consulta; não altera dados.

select
  u.id as auth_user_id,
  u.email as auth_email,
  u.email_confirmed_at,
  u.last_sign_in_at,
  p.id as profile_id,
  p.role,
  p.is_active,
  p.deleted_at,
  sp.id as student_id,
  sp.student_number,
  sp.status as student_status,
  si.status as invitation_status,
  si.invited_at
from auth.users u
left join public.profiles p on p.id = u.id
left join public.student_profiles sp on sp.profile_id = u.id
left join public.student_invitations si on si.auth_user_id = u.id
where lower(u.email) = lower('ruifolgozo@gmail.com')
order by si.invited_at desc nulls last;
