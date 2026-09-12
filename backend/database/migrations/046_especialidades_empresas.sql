-- Tabla puente (mismo patron que doctores_empresas): representa que
-- especialidades GLOBALES tiene "activadas" cada clinica para su propio
-- uso en Citas/Campanas -- de ahora en adelante, agregar una
-- especialidad a una clinica significa activar una del catalogo global,
-- no crear un nombre nuevo privado (las privadas ya existentes no se
-- tocan, siguen viviendo directo en especialidades.empresa_id).
create table if not exists especialidades_empresas (
    id              uuid primary key default gen_random_uuid(),
    especialidad_id uuid not null references especialidades(id) on delete cascade,
    empresa_id      uuid not null references empresas(id) on delete cascade,
    activo          boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (especialidad_id, empresa_id)
);
create index if not exists idx_especialidades_empresas_empresa on especialidades_empresas(empresa_id);
create index if not exists idx_especialidades_empresas_especialidad on especialidades_empresas(especialidad_id);
