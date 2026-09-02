-- =========================================================
-- Migracion: paciente como entidad global (multi-clinica)
-- Mismo patron ya usado para usuarios: identidad global +
-- tabla de enlace N:M con cada clinica. Permite que un mismo
-- paciente (misma persona, misma cedula) sea atendido en varias
-- clinicas de la red sin duplicar su registro, y que a futuro
-- pueda ver su historial agregado desde un portal propio.
--
-- IMPORTANTE: los datos clinicos (citas, historias_clinicas,
-- signos_vitales, recetas) NO cambian de estructura -- ya tienen
-- su propio empresa_id, que sigue siendo el limite de
-- aislamiento entre clinicas para el personal. Solo cambia que
-- "pacientes" deja de pertenecer a una sola clinica.
-- =========================================================

-- 1. Tabla de enlace paciente <-> clinica (paralela a usuarios_empresas_rol)
create table if not exists pacientes_empresas (
    id           uuid primary key default gen_random_uuid(),
    paciente_id  uuid not null references pacientes(id) on delete cascade,
    empresa_id   uuid not null references empresas(id) on delete cascade,
    activo       boolean not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (paciente_id, empresa_id)
);
create index if not exists idx_pacientes_empresas_paciente on pacientes_empresas(paciente_id);
create index if not exists idx_pacientes_empresas_empresa on pacientes_empresas(empresa_id);

drop trigger if exists trg_set_updated_at on pacientes_empresas;
create trigger trg_set_updated_at before update on pacientes_empresas
    for each row execute function set_updated_at();

-- 2. Migrar cada paciente existente a su vinculo con su clinica actual
insert into pacientes_empresas (paciente_id, empresa_id, activo, created_at)
select id, empresa_id, activo, created_at from pacientes
on conflict (paciente_id, empresa_id) do nothing;

-- 3. Deduplicacion defensiva por identificacion. Hoy (2026-09-02) no hay
--    ningun caso real en .19 ni en Neon, pero este bloque protege contra
--    el caso futuro (dos clinicas que ya habian registrado la misma
--    persona por separado antes de este cambio) sin necesitar
--    intervencion manual.
do $$
declare
    dup record;
    survivor uuid;
begin
    for dup in
        select identificacion, array_agg(id order by created_at asc) as ids
        from pacientes
        where identificacion is not null and identificacion <> ''
        group by identificacion
        having count(*) > 1
    loop
        survivor := dup.ids[1];

        update citas set paciente_id = survivor where paciente_id = any(dup.ids[2:]);
        update historias_clinicas set paciente_id = survivor where paciente_id = any(dup.ids[2:]);
        update signos_vitales set paciente_id = survivor where paciente_id = any(dup.ids[2:]);
        update recetas set paciente_id = survivor where paciente_id = any(dup.ids[2:]);

        insert into pacientes_empresas (paciente_id, empresa_id, activo)
        select survivor, empresa_id, activo from pacientes_empresas where paciente_id = any(dup.ids[2:])
        on conflict (paciente_id, empresa_id) do nothing;

        delete from pacientes_empresas where paciente_id = any(dup.ids[2:]);
        delete from pacientes where id = any(dup.ids[2:]);

        raise notice 'Fusionados % pacientes duplicados con identificacion % en %', array_length(dup.ids, 1), dup.identificacion, survivor;
    end loop;
end $$;

-- 4. pacientes pasa a ser global: quita empresa_id (y su indice/FK, que se
--    eliminan automaticamente junto con la columna) y activo (ahora vive
--    en pacientes_empresas, porque un paciente puede estar activo en una
--    clinica e inactivo en otra).
alter table pacientes drop column if exists empresa_id;
alter table pacientes drop column if exists activo;

-- 5. identificacion y email pasan a ser unicos globalmente (Postgres
--    permite multiples NULL en una columna unique, asi que los pacientes
--    sin cedula o sin correo registrado no se ven afectados).
alter table pacientes drop constraint if exists uq_pacientes_empresa_identificacion;
alter table pacientes add constraint uq_pacientes_identificacion unique (identificacion);
alter table pacientes add constraint uq_pacientes_email unique (email);
