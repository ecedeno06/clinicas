-- =========================================================
-- Migracion: recetas y receta_medicamentos
-- Una receta (cabecera) por cita, con 0..N medicamentos. Se ata
-- a cita_id (no a historia_clinica_id) por la misma razon que
-- signos_vitales: el doctor puede emitir una receta (ej. una
-- renovacion) sin necesitar haber completado la historia clinica
-- de esa cita.
-- =========================================================

create table if not exists recetas (
    id                      uuid primary key default gen_random_uuid(),
    empresa_id              uuid not null references empresas(id),
    cita_id                 uuid not null unique references citas(id) on delete cascade,
    paciente_id             uuid not null references pacientes(id) on delete restrict,
    doctor_id               uuid not null references doctores(id) on delete restrict,
    indicaciones_generales  text,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

-- Lineas de la receta. Se reemplazan como conjunto en cada
-- actualizacion (borrar + reinsertar), no se editan una a una,
-- por lo que no necesitan su propio updated_at.
create table if not exists receta_medicamentos (
    id              uuid primary key default gen_random_uuid(),
    receta_id       uuid not null references recetas(id) on delete cascade,
    medicamento     text not null,
    dosis           text,
    frecuencia      text,
    duracion        text,
    indicaciones    text,
    orden           integer not null default 0,
    created_at      timestamptz not null default now()
);

create index if not exists idx_recetas_paciente on recetas(paciente_id);
create index if not exists idx_recetas_empresa on recetas(empresa_id);
create index if not exists idx_receta_medicamentos_receta on receta_medicamentos(receta_id);

drop trigger if exists trg_set_updated_at on recetas;
create trigger trg_set_updated_at before update on recetas
    for each row execute function set_updated_at();
