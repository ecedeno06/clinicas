-- Consentimiento del paciente para compartir su historial clinico (citas,
-- historias clinicas, signos vitales, recetas, laboratorio) entre las
-- clinicas del ecosistema a las que ya esta vinculado (ver
-- pacientes_empresas). Es POR CLINICA: cada clinica libera (o no) sus
-- propios datos, la aprobacion queda en la relacion paciente-clinica, no
-- en el paciente global. Antecedentes patologicos NO se tocan: ya se
-- comparten sin este consentimiento (paciente_antecedente no tiene
-- empresa_id), decision explicita al disenar esto.

alter table pacientes_empresas add column if not exists comparte_historial_clinico boolean not null default false;

create table if not exists consentimiento_datos_tokens (
    id            uuid primary key default gen_random_uuid(),
    paciente_id   uuid not null references pacientes(id) on delete cascade,
    empresa_id    uuid not null references empresas(id) on delete cascade,
    token         text not null unique,
    otp           text not null,
    respuesta     text not null default 'pendiente' check (respuesta in ('pendiente', 'aceptado', 'rechazado')),
    expira_en     timestamptz not null,
    respondido_en timestamptz,
    created_at    timestamptz not null default now()
);

create index if not exists idx_consentimiento_datos_tokens_paciente on consentimiento_datos_tokens(paciente_id);
