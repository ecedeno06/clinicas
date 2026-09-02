-- =========================================================
-- Migracion: horarios semanales de doctores (tablero de turnos)
-- Permite que cada doctor tenga un patron recurrente de dias/horas
-- en que atiende, para poder calcular disponibilidad al agendar una
-- cita (en vez de campos de fecha/hora completamente libres).
--
-- No cambia la tabla citas: la disponibilidad se calcula en tiempo
-- de consulta combinando doctor_horarios (patron semanal) con las
-- citas ya agendadas ese dia. No es una restriccion dura: un doctor
-- sin horarios configurados sigue pudiendo recibir citas sin cambios
-- (retrocompatible con los doctores existentes).
-- =========================================================

create table if not exists doctor_horarios (
    id           uuid primary key default gen_random_uuid(),
    doctor_id    uuid not null references doctores(id) on delete cascade,
    dia_semana   smallint not null check (dia_semana between 0 and 6), -- 0=domingo … 6=sabado (igual que extract(dow ...) de Postgres)
    hora_inicio  time not null,
    hora_fin     time not null,
    activo       boolean not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint chk_horario_doctor check (hora_fin > hora_inicio)
);

create index if not exists idx_doctor_horarios_doctor on doctor_horarios(doctor_id);

drop trigger if exists trg_set_updated_at on doctor_horarios;
create trigger trg_set_updated_at before update on doctor_horarios
    for each row execute function set_updated_at();
