# Supabase — ULTIMATE FIT APP

## Migrações

Executar por ordem e apenas uma vez:

1. `20260727_001_ultimatefit_foundation.sql`
2. `20260727_002_bootstrap_first_admin.sql`
3. `20260805_003_team_access_and_invites.sql`

A migração 003 substitui integralmente o rascunho anterior `20260804_003_trainer_permissions.sql`, que não deve ser executado.

## Edge Function

Função: `manage-team-member`

Código: `functions/manage-team-member/index.ts`

A função executa operações administrativas seguras: convite, permissões, desativação, reativação e remoção de acesso. A Secret Key é usada exclusivamente no servidor.

Definir:

```text
APP_URL=https://ultimatefit-app.vercel.app
```

Ao usar as novas Publishable/Secret Keys, desativar a verificação JWT antiga da gateway. A função valida o JWT do utilizador no próprio código.
