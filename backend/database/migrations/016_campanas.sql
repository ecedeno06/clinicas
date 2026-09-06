-- Fase 1 de DISENO-CAMPANAS-MEDICAS.md: campanas de visitas medicas
-- (oficinas, eventos) fuera de las sucursales de la clinica. Migracion
-- 100% aditiva: nadie tiene campanas hoy, no hay backfill que hacer.
--
-- Una campana NO es un tipo de sucursal (es puntual, en un lugar de un
-- tercero) pero indica que sucursal la organiza administrativamente
-- (campanas.sucursal_id). Las citas que resulten de ella son citas
-- normales, solo marcadas con campana_id -- todo el flujo clinico
-- (historias_clinicas, signos_vitales, recetas, laboratorio) sigue
-- colgando de cita_id sin ningun cambio.

create table if not exists campanas (
    id                  uuid primary key default gen_random_uuid(),
    empresa_id          uuid not null references empresas(id) on delete cascade,
    sucursal_id         uuid references sucursales(id),   -- sucursal organizadora, no el lugar fisico
    nombre              text not null,
    lugar               text not null,                    -- direccion del lugar externo (texto libre)
    contacto_lugar      text,
    fecha_inicio        date not null,
    fecha_fin           date not null,
    hora_inicio         time,
    hora_fin            time,
    descripcion         text,
    estado              text not null default 'borrador'
                        check (estado in (
                          'borrador', 'pendiente_aprobacion', 'aprobada',
                          'rechazada', 'en_curso', 'finalizada', 'cancelada'
                        )),
    aprobado_por        uuid references usuarios(id),
    fecha_aprobacion    timestamptz,
    motivo_rechazo      text,
    creado_por          uuid references usuarios(id),
    log                 jsonb not null default '[]'::jsonb,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint chk_fechas_campana check (fecha_fin >= fecha_inicio)
);

create index if not exists idx_campanas_empresa on campanas(empresa_id);

-- Reclutamiento: que doctores estan invitados/confirmados para la campana.
create table if not exists campana_doctores (
    id            uuid primary key default gen_random_uuid(),
    campana_id    uuid not null references campanas(id) on delete cascade,
    doctor_id     uuid not null references doctores(id) on delete cascade,
    estado        text not null default 'invitado'
                  check (estado in ('invitado', 'confirmado', 'rechazado')),
    notas         text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (campana_id, doctor_id)
);

create index if not exists idx_campana_doctores_campana on campana_doctores(campana_id);
create index if not exists idx_campana_doctores_doctor on campana_doctores(doctor_id);

-- citas: referencia opcional a la campana que la origino (una cita de
-- campana sigue necesitando paciente_id/doctor_id/fecha/hora igual que
-- cualquier otra -- campana_id solo marca de donde vino).
alter table citas add column if not exists campana_id uuid references campanas(id);

drop trigger if exists trg_set_updated_at on campanas;
create trigger trg_set_updated_at before update on campanas for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at on campana_doctores;
create trigger trg_set_updated_at before update on campana_doctores for each row execute function set_updated_at();
