# Modelos de email

No Supabase, abrir **Authentication → Emails → Templates**.

- Em **Invite user**, usar o conteúdo de `invite.html`.
- Em **Reset password**, usar o conteúdo de `recovery.html`.

Os modelos mantêm `{{ .ConfirmationURL }}`, que é o link seguro gerado pelo Supabase.
