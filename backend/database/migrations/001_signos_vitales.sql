-- =========================================================
-- Migracion: signos_vitales
-- Registra temperatura, peso, talla/IMC, presion arterial y
-- glucosa tomados al llegar el paciente a su cita (recepcion /
-- enfermeria), antes de que el doctor cree la historia clinica
-- -- por eso se ata a cita_id y no a historia_clinica_id: de lo
-- contrario no se podrian tomar los signos vitales hasta que el
-- doctor ya hubiera registrado diagnostico/tratamiento.
-- =========================================================

create table if not exists signos_vitales (
    id                      uuid primary key default gen_random_uuid(),
    empresa_id              uuid not null references empresas(id),
    cita_id                 uuid not null unique references citas(id) on delete cascade,
    paciente_id             uuid not null references pacientes(id) on delete restrict,
    temperatura             numeric(4,1),   -- °C, ej. 36.5
    peso                    numeric(5,2),   -- kg, ej. 72.30
    talla                   numeric(5,2),   -- cm, ej. 170.00
    imc                     numeric(5,2) generated always as (
                                case
                                    when peso is not null and talla is not null and talla > 0
                                        then round((peso / ((talla / 100.0) ^ 2))::numeric, 2)
                                    else null
                                end
                            ) stored,
    presion_sistolica       smallint,       -- mmHg
    presion_diastolica      smallint,       -- mmHg
    glucosa                 numeric(5,1),   -- mg/dL
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),

    constraint chk_signos_vitales_temperatura   check (temperatura is null or (temperatura between 30 and 45)),
    constraint chk_signos_vitales_peso          check (peso is null or (peso between 0 and 400)),
    constraint chk_signos_vitales_talla         check (talla is null or (talla between 0 and 250)),
    constraint chk_signos_vitales_presion_sist  check (presion_sistolica is null or (presion_sistolica between 40 and 260)),
    constraint chk_signos_vitales_presion_diast check (presion_diastolica is null or (presion_diastolica between 20 and 200)),
    constraint chk_signos_vitales_glucosa       check (glucosa is null or (glucosa between 0 and 700))
);

create index if not exists idx_signos_vitales_paciente on signos_vitales(paciente_id);
create index if not exists idx_signos_vitales_empresa on signos_vitales(empresa_id);

drop trigger if exists trg_set_updated_at on signos_vitales;
create trigger trg_set_updated_at before update on signos_vitales
    for each row execute function set_updated_at();
