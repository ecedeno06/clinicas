-- Recuperar acceso cuando se perdio el dispositivo con la app autenticadora
-- (2FA): POST /auth/2fa/recovery genera un token de un solo uso y lo envia
-- por correo; POST /auth/2fa/recovery/confirm lo valida aqui y DESACTIVA
-- el 2FA de la cuenta (two_factor_enabled = false, two_factor_secret =
-- null), para que el usuario pueda volver a iniciar sesion con su
-- contrasena de siempre y, si quiere, enrolar el 2FA de nuevo en otro
-- equipo. No toca la contrasena -- es un problema distinto al de
-- password_reset_tokens (migracion 029).
create table if not exists dos_factor_recovery_tokens (
    id          uuid primary key default gen_random_uuid(),
    usuario_id  uuid not null references usuarios(id) on delete cascade,
    token       text not null unique,
    expira_en   timestamptz not null,
    usado       boolean not null default false,
    created_at  timestamptz not null default now()
);

create index if not exists idx_dos_factor_recovery_tokens_usuario on dos_factor_recovery_tokens(usuario_id);
create index if not exists idx_dos_factor_recovery_tokens_token_activo on dos_factor_recovery_tokens(token) where usado = false;
