-- Tabla sesiones: registro de sesiones de usuario en base de datos, para
-- poder auditar quien esta/estuvo conectado, desde que clinica/sucursal y
-- por cuanto tiempo. Fase 1 (solo la tabla): el login/logout/middleware de
-- autenticacion actual (JWT firmado, sin consulta a BD) no cambia todavia
-- -- esta tabla no se llena ni se valida hasta que se implemente esa fase
-- por separado.
--
-- Adaptado del patron encontrado en el proyecto "agro 1.1" (tabla
-- "sesiones" con token/expira_en/activo/razon_salida/duracion_segundos),
-- ajustado a las convenciones de este proyecto: ids uuid, created_at/
-- updated_at con trigger, y datos propios del modelo multi-clinica
-- (empresa_id/empresa_nombre, sucursal_id/sucursal_nombre) en vez del
-- rol_codigo/id_capitulo de aquel proyecto.
create table if not exists sesiones (
    id                uuid primary key default gen_random_uuid(),
    usuario_id        uuid not null references usuarios(id) on delete cascade,
    -- Clinica y sucursal activas al momento de crear la sesion. Se guarda
    -- tambien el nombre (ademas del id) para poder mostrar un listado de
    -- sesiones sin necesidad de join y que el dato quede fijo aunque la
    -- clinica/sucursal cambie de nombre despues.
    empresa_id        uuid references empresas(id) on delete cascade,
    empresa_nombre    text,
    sucursal_id       uuid references sucursales(id) on delete set null,
    sucursal_nombre   text,
    rol               text check (rol is null or rol in ('admin', 'doctor', 'recepcionista')),
    token             text not null unique,
    activo            boolean not null default true,
    razon_salida      text,
    duracion_segundos integer,
    expira_en         timestamptz not null,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index if not exists idx_sesiones_usuario on sesiones(usuario_id);
create index if not exists idx_sesiones_empresa on sesiones(empresa_id);
create index if not exists idx_sesiones_token_activo on sesiones(token) where activo = true;

drop trigger if exists trg_set_updated_at on sesiones;
create trigger trg_set_updated_at before update on sesiones for each row execute function set_updated_at();
