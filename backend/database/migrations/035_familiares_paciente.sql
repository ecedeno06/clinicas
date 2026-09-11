-- Lista de familiares del paciente (reemplaza el campo unico
-- "contacto de emergencia"). Igual patron que direcciones_paciente: el
-- frontend maneja la lista en memoria y la manda completa en el mismo
-- payload de crear/actualizar paciente, asi que se reemplaza como
-- conjunto en cada guardado (ver reemplazarFamiliares en
-- pacientes.controller.js) -- nunca hay una llamada al backend para
-- guardar un familiar por separado, asi que no puede quedar huerfano
-- de un paciente que aun no existe.
create table if not exists familiares_paciente (
    id          uuid primary key default gen_random_uuid(),
    paciente_id uuid not null references pacientes(id) on delete cascade,
    nombre      text not null,
    telefono    text,
    parentesco  text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists idx_familiares_paciente_paciente on familiares_paciente(paciente_id);

-- Backfill: el contacto de emergencia existente pasa a ser el primer
-- familiar. Protegido con chequeo de columna (mismo patron que las
-- migraciones 019/025) para poder re-correrse sin error una vez ya
-- aplicada.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'pacientes' and column_name = 'contacto_emergencia') then
    insert into familiares_paciente (paciente_id, nombre, telefono, parentesco)
    select id, coalesce(nullif(contacto_emergencia->>'nombre', ''), 'Contacto de emergencia'),
           nullif(contacto_emergencia->>'telefono', ''), nullif(contacto_emergencia->>'parentesco', '')
    from pacientes
    where contacto_emergencia is not null
      and (nullif(contacto_emergencia->>'nombre','') is not null or nullif(contacto_emergencia->>'telefono','') is not null);

    alter table pacientes drop column contacto_emergencia;
  end if;
end $$;
