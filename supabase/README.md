# Supabase — ULTIMATE FIT APP

## Migrações

Executar por ordem e apenas uma vez:

1. `20260727_001_ultimatefit_foundation.sql`
2. `20260727_002_bootstrap_first_admin.sql`
3. `20260805_003_team_access_and_invites.sql`
4. `20260806_004_students_and_private_avatars.sql`

Depois da Migração 004, executar o respetivo ficheiro `verify`.

## Edge Functions

### `manage-team-member`

Gestão da equipa, convites, permissões e WhatsApp profissional obrigatório.

### `manage-student`

Criação e convite de alunos, atualização do perfil, atribuição de professores, fotografia, reenvio de acesso, desativação, reativação, arquivo e remoção segura.

Ambas validam internamente a sessão e a hierarquia. O segredo já configurado deve permanecer:

```text
APP_URL=https://ultimatefit-app.vercel.app
```

Nunca colocar a Secret Key no frontend, GitHub ou Vercel.
