-- Un paciente puede tener varias direcciones (casa, trabajo, etc.), una
-- marcada como principal -- esa es la que usan Google Maps/Waze/WhatsApp
-- al doctor en las comunicaciones ya existentes (Citas, historial
-- clinico). Reemplaza las columnas pacientes.direccion/google_maps_url/
-- comparte_ubicacion (migraciones 020 y 023), que se eliminan tras el
-- backfill -- mismo criterio ya aplicado en la migracion 019
-- (doctor_especialidades).

create table if not exists direcciones_paciente (
    id                 uuid primary key default gen_random_uuid(),
    paciente_id        uuid not null references pacientes(id) on delete cascade,
    direccion          text,
    google_maps_url    text,
    pais               text,
    provincia          text,
    distrito           text,
    -- Nivel mas fino de la division politica de Panama -- Google no lo
    -- provee via geocodificacion inversa (verificado empiricamente), asi
    -- que en la practica se escribe a mano casi siempre.
    corregimiento      text,
    -- Consentimiento explicito para compartir ESTA direccion con el
    -- personal/doctor -- por direccion, no por paciente (una puede
    -- compartirse y otra no).
    comparte_ubicacion boolean not null default false,
    es_principal       boolean not null default false,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create index if not exists idx_direcciones_paciente_paciente on direcciones_paciente(paciente_id);

-- Como maximo una direccion principal por paciente.
create unique index if not exists uq_direcciones_paciente_principal
  on direcciones_paciente(paciente_id) where es_principal;

drop trigger if exists trg_set_updated_at on direcciones_paciente;
create trigger trg_set_updated_at before update on direcciones_paciente for each row execute function set_updated_at();

-- Backfill (cada paciente con direccion/google_maps_url actuales pasa a
-- una fila marcada como principal) + limpieza de las columnas viejas.
-- Protegido con el chequeo de columna para poder re-correr esta
-- migracion sin error una vez ya aplicada (mismo patron que 019).
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'pacientes' and column_name = 'google_maps_url'
    ) then
        insert into direcciones_paciente (paciente_id, direccion, google_maps_url, comparte_ubicacion, es_principal)
        select id, direccion, google_maps_url, coalesce(comparte_ubicacion, false), true
        from pacientes p
        where (direccion is not null or google_maps_url is not null)
          and not exists (select 1 from direcciones_paciente dp where dp.paciente_id = p.id);

        alter table pacientes drop column direccion;
        alter table pacientes drop column google_maps_url;
        alter table pacientes drop column comparte_ubicacion;
    end if;
end $$;
