-- Recuperar contrasena por correo (self-service): POST /auth/forgot-password
-- genera un token de un solo uso y lo envia por correo; POST /auth/reset-password
-- lo valida aqui y actualiza la contrasena. No tiene relacion con "sesiones"
-- (eso es login) ni con "pista" (eso solo muestra una ayuda, no restablece nada).
create table if not exists password_reset_tokens (
    id          uuid primary key default gen_random_uuid(),
    usuario_id  uuid not null references usuarios(id) on delete cascade,
    token       text not null unique,
    expira_en   timestamptz not null,
    usado       boolean not null default false,
    created_at  timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_usuario on password_reset_tokens(usuario_id);
create index if not exists idx_password_reset_tokens_token_activo on password_reset_tokens(token) where usado = false;
