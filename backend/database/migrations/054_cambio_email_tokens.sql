-- =========================================================
-- Migracion 054: cambio_email_tokens
-- =========================================================

-- Autoservicio de cambio de correo de acceso (usuarios.email): el usuario
-- pide el cambio confirmando su contrasena actual, y el cambio solo se
-- aplica cuando confirma el enlace que le llega al correo NUEVO -- asi
-- nunca queda una cuenta con un correo al que nadie tiene acceso, ni se
-- puede reclamar el correo de otra persona sin comprobar que uno mismo
-- puede recibir algo ahi. Mismo patron que password_reset_tokens, con el
-- correo nuevo guardado en el token (no en la cuenta) hasta confirmarse.
create table if not exists cambio_email_tokens (
    id          uuid primary key default gen_random_uuid(),
    usuario_id  uuid not null references usuarios(id) on delete cascade,
    nuevo_email text not null,
    token       text not null unique,
    expira_en   timestamptz not null,
    usado       boolean not null default false,
    created_at  timestamptz not null default now()
);
create index if not exists idx_cambio_email_tokens_usuario on cambio_email_tokens(usuario_id);
