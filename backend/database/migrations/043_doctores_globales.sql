-- Convierte "doctores" en entidad GLOBAL (mismo patron que
-- pacientes/pacientes_empresas): un doctor existe una sola vez en toda
-- la red y cada clinica se vincula a el via doctores_empresas. Se
-- agrega "identificacion" (cedula) como llave de busqueda de red, ya
-- que hoy no existe ningun identificador unico real (email es opcional
-- y no es unico).
alter table doctores add column if not exists identificacion text;
create unique index if not exists uq_doctores_identificacion on doctores (identificacion) where identificacion is not null;

create table if not exists doctores_empresas (
    id         uuid primary key default gen_random_uuid(),
    doctor_id  uuid not null references doctores(id) on delete cascade,
    empresa_id uuid not null references empresas(id) on delete cascade,
    activo     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (doctor_id, empresa_id)
);
create index if not exists idx_doctores_empresas_empresa on doctores_empresas(empresa_id);
create index if not exists idx_doctores_empresas_doctor on doctores_empresas(doctor_id);

-- Backfill: cada doctor existente ya tenia una sola empresa_id -- se
-- convierte en su primer (y por ahora unico) vinculo, preservando su
-- estado activo/inactivo actual. Envuelto en un chequeo de existencia
-- de columna para que sea idempotente: en una segunda corrida
-- doctores.empresa_id/activo ya no existen (se borran mas abajo).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'doctores' and column_name = 'empresa_id'
  ) then
    insert into doctores_empresas (doctor_id, empresa_id, activo)
    select id, empresa_id, activo from doctores
    on conflict (doctor_id, empresa_id) do nothing;
  end if;
end $$;

alter table doctores drop column if exists empresa_id;
alter table doctores drop column if exists activo;
