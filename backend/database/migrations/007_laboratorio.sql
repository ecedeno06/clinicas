-- =========================================================
-- Migracion: modulo de laboratorio (ordenes + examenes)
-- Mismo patron que recetas: cabecera N por cita (un doctor puede
-- pedir mas de una orden en la misma consulta) + lineas de examenes
-- que se reemplazan como conjunto en cada actualizacion.
--
-- Alcance de esta version (MVP, sin archivos adjuntos): resultado y
-- valor de referencia son texto libre (soportan tanto valores
-- numericos como cualitativos, ej. "Positivo"/"Negativo"). Adjuntar
-- archivos de resultados (PDF, imagenes) queda para una fase futura
-- que requiere definir almacenamiento de archivos (ver
-- MEJORAS-PROPUESTAS.md seccion 6, nota sobre storage).
-- =========================================================

create table if not exists ordenes_laboratorio (
    id              uuid primary key default gen_random_uuid(),
    empresa_id      uuid not null references empresas(id),
    cita_id         uuid not null references citas(id) on delete cascade,
    paciente_id     uuid not null references pacientes(id) on delete restrict,
    doctor_id       uuid not null references doctores(id) on delete restrict,
    estado          text not null check (estado in ('pendiente', 'completada', 'cancelada')) default 'pendiente',
    observaciones   text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Lineas de examenes solicitados. Se reemplazan como conjunto en cada
-- actualizacion (borrar + reinsertar), igual que receta_medicamentos,
-- por lo que no necesitan su propio updated_at.
create table if not exists orden_laboratorio_examenes (
    id                  uuid primary key default gen_random_uuid(),
    orden_id            uuid not null references ordenes_laboratorio(id) on delete cascade,
    nombre_examen       text not null,
    valor_referencia    text,
    resultado           text,
    unidad              text,
    orden               integer not null default 0,
    created_at          timestamptz not null default now()
);

create index if not exists idx_ordenes_laboratorio_paciente on ordenes_laboratorio(paciente_id);
create index if not exists idx_ordenes_laboratorio_empresa on ordenes_laboratorio(empresa_id);
create index if not exists idx_ordenes_laboratorio_cita on ordenes_laboratorio(cita_id);
create index if not exists idx_orden_laboratorio_examenes_orden on orden_laboratorio_examenes(orden_id);

drop trigger if exists trg_set_updated_at on ordenes_laboratorio;
create trigger trg_set_updated_at before update on ordenes_laboratorio
    for each row execute function set_updated_at();
