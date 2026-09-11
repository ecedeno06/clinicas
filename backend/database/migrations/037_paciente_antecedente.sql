-- Antecedentes patologicos que presenta un paciente (puede tener varios),
-- tomados del catalogo global (antecedentes_patologicos, migracion 036).
-- La categoria se obtiene por join a traves de antecedente_id -- no se
-- duplica aqui, para no quedar desactualizada si el antecedente cambia de
-- categoria en el catalogo.
--
-- Mismo patron que familiares_paciente (migracion 035): el frontend
-- maneja la lista en memoria y la manda completa en el mismo payload de
-- crear/actualizar paciente -- se reemplaza como conjunto en cada
-- guardado (ver reemplazarPacienteAntecedentes en pacientes.controller.js),
-- asi que nunca puede quedar huerfano de un paciente que aun no existe.
create table if not exists paciente_antecedente (
    id            uuid primary key default gen_random_uuid(),
    paciente_id   uuid not null references pacientes(id) on delete cascade,
    antecedente_id uuid not null references antecedentes_patologicos(id),
    fecha_inicio  date,
    tratamiento   text,
    observacion   text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique(paciente_id, antecedente_id)
);
create index if not exists idx_paciente_antecedente_paciente on paciente_antecedente(paciente_id);
create index if not exists idx_paciente_antecedente_antecedente on paciente_antecedente(antecedente_id);
