-- Fase 1 de DISENO-ZONA-HORARIA-SUCURSALES.md: introduce el concepto de
-- sucursal (sede) dentro de una empresa. Migracion 100% aditiva y con
-- backfill automatico: crea una "Sede Principal" para cada empresa que
-- todavia no tenga ninguna sucursal, y reapunta doctor_horarios/citas
-- existentes hacia ella -- el sistema sigue funcionando exactamente igual
-- que hoy para todas las clinicas actuales (una sola sede), sin pedirle
-- nada a nadie hasta que decidan agregar una segunda sucursal.
--
-- Un doctor puede atender en mas de una sucursal (decision del usuario,
-- 2026-09-05): sucursal_id vive en doctor_horarios, no en doctores. citas
-- necesita su propio sucursal_id explicito (no se puede heredar del doctor).

-- 1. Tabla de sucursales.
create table if not exists sucursales (
    id              uuid primary key default gen_random_uuid(),
    empresa_id      uuid not null references empresas(id) on delete cascade,
    nombre          text not null,
    direccion       text,
    zona_horaria    text not null default 'America/Panama',
    -- Horario general de atencion (limite superior, distinto del horario
    -- individual de cada doctor -- ver DISENO-ZONA-HORARIA-SUCURSALES.md
    -- seccion 5). Nullable: si no se define, no agrega ninguna restriccion.
    hora_apertura   time,
    hora_cierre     time,
    activo          boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_sucursales_empresa on sucursales(empresa_id);

-- 2. sucursal_id en doctor_horarios y citas (nullable por ahora, se vuelve
--    obligatorio en el paso 5 una vez que el backfill del paso 4 termino).
alter table doctor_horarios add column if not exists sucursal_id uuid references sucursales(id) on delete cascade;
alter table citas add column if not exists sucursal_id uuid references sucursales(id);

-- 3. Una "Sede Principal" por cada empresa que todavia no tenga ninguna
--    sucursal (para poder re-correr esta migracion sin duplicar sedes).
insert into sucursales (empresa_id, nombre, direccion, zona_horaria)
select e.id, 'Sede Principal', e.direccion, 'America/Panama'
from empresas e
where not exists (select 1 from sucursales s where s.empresa_id = e.id);

-- 4. Backfill: doctor_horarios/citas sin sucursal_id todavia apuntan a la
--    (unica, en este punto) sucursal de su empresa.
update doctor_horarios dh
set sucursal_id = (
    select s.id from sucursales s
    join doctores d on d.empresa_id = s.empresa_id
    where d.id = dh.doctor_id
    order by s.created_at asc
    limit 1
)
where dh.sucursal_id is null;

update citas c
set sucursal_id = (
    select s.id from sucursales s
    where s.empresa_id = c.empresa_id
    order by s.created_at asc
    limit 1
)
where c.sucursal_id is null;

-- 5. Ya con todo respaldado, se vuelve obligatorio.
alter table doctor_horarios alter column sucursal_id set not null;
alter table citas alter column sucursal_id set not null;

-- 6. Trigger de updated_at, mismo patron que el resto de las tablas.
drop trigger if exists trg_set_updated_at on sucursales;
create trigger trg_set_updated_at before update on sucursales for each row execute function set_updated_at();
