-- Un doctor puede tener varias especialidades (ej. cardiologia y
-- pediatria): pasa de 1:N (doctores.especialidad_id, unica y obligatoria)
-- a N:M via esta tabla puente, mismo patron de campana_doctores. La junta
-- medica certifica por especialidad, asi que cada fila lleva su propio
-- numero de colegiado -- por eso doctores.numero_colegiado tambien se
-- elimina (deja de tener sentido como campo general del doctor).
--
-- citas.especialidad_id es nuevo pero NO es una relacion protegida (sin
-- "references especialidades"): es solo el filtro que uso el usuario al
-- agendar (para acotar el selector de doctor), guardado como dato
-- informativo para consultas/reportes futuros, no como llave -- una
-- especialidad puede cambiar o desaparecer despues sin afectar citas ya
-- creadas.

create table if not exists doctor_especialidades (
    id                uuid primary key default gen_random_uuid(),
    doctor_id         uuid not null references doctores(id) on delete cascade,
    especialidad_id   uuid not null references especialidades(id) on delete cascade,
    numero_colegiado  text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (doctor_id, especialidad_id)
);

create index if not exists idx_doctor_especialidades_doctor on doctor_especialidades(doctor_id);
create index if not exists idx_doctor_especialidades_especialidad on doctor_especialidades(especialidad_id);

drop trigger if exists trg_set_updated_at on doctor_especialidades;
create trigger trg_set_updated_at before update on doctor_especialidades for each row execute function set_updated_at();

-- Backfill (cada doctor existente pasa a una fila con su especialidad y
-- numero de colegiado actuales) + limpieza de las columnas viejas.
-- Protegido con el chequeo de columna para poder re-correr esta migracion
-- sin error una vez ya aplicada (las columnas de origen ya no existirian).
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'doctores' and column_name = 'especialidad_id'
    ) then
        insert into doctor_especialidades (doctor_id, especialidad_id, numero_colegiado)
        select id, especialidad_id, numero_colegiado
        from doctores
        where especialidad_id is not null
        on conflict (doctor_id, especialidad_id) do nothing;

        alter table doctores drop column especialidad_id;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_name = 'doctores' and column_name = 'numero_colegiado'
    ) then
        alter table doctores drop column numero_colegiado;
    end if;
end $$;

alter table citas add column if not exists especialidad_id uuid;
