-- =========================================================
-- Esquema de base de datos - Gestion de Clinica Medica
-- Motor: PostgreSQL
-- Multitenant: cada clinica (tabla "empresas") comparte el
-- mismo esquema, filtrado por empresa_id (row-level multi-tenancy).
-- Basado en el mismo patron usado en el proyecto "Servicio-Horas".
-- =========================================================

create extension if not exists "pgcrypto"; -- para gen_random_uuid()

-- ---------------------------------------------------------
-- Tabla: empresas (clinicas, tenants del sistema)
-- ---------------------------------------------------------
create table if not exists empresas (
    id              uuid primary key default gen_random_uuid(),
    nombre          text not null,
    identificacion  text unique,          -- RUC / NIT / Cedula juridica de la clinica
    email           text,
    telefono        text,
    direccion       text,
    -- Logo en base64 (data URI), ej: "data:image/png;base64,..."
    logo            text,
    activo          boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Tabla: usuarios (personas con acceso al sistema: admin,
-- doctores, recepcionistas). Es GLOBAL: un mismo usuario puede
-- pertenecer a varias clinicas (ver usuarios_empresas_rol).
-- ---------------------------------------------------------
create table if not exists usuarios (
    id              uuid primary key default gen_random_uuid(),
    nombre          text not null,
    email           text not null unique,
    password_hash   text not null,
    activo          boolean not null default true,
    -- Acceso global de super-administracion (gestiona todas las clinicas),
    -- independiente del rol que tenga en usuarios_empresas_rol.
    es_super_admin  boolean not null default false,
    -- Foto de perfil en base64 (data URI)
    avatar          text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Tabla: usuarios_empresas_rol (relacion N:M usuario <-> clinica,
-- el rol es un atributo de esta relacion, no del usuario)
-- ---------------------------------------------------------
create table if not exists usuarios_empresas_rol (
    id              uuid primary key default gen_random_uuid(),
    usuario_id      uuid not null references usuarios(id) on delete cascade,
    empresa_id      uuid not null references empresas(id) on delete cascade,
    rol             text not null check (rol in ('admin', 'doctor', 'recepcionista')) default 'recepcionista',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (usuario_id, empresa_id)
);

-- ---------------------------------------------------------
-- Tabla: especialidades (catalogo de especialidades medicas
-- que ofrece cada clinica: Pediatria, Cardiologia, etc.)
-- ---------------------------------------------------------
create table if not exists especialidades (
    id              uuid primary key default gen_random_uuid(),
    empresa_id      uuid not null references empresas(id),
    nombre          text not null,
    descripcion     text,
    activo          boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Tabla: pacientes
-- ---------------------------------------------------------
create table if not exists pacientes (
    id                  uuid primary key default gen_random_uuid(),
    empresa_id          uuid not null references empresas(id),
    nombre              text not null,
    identificacion      text,                 -- cedula / pasaporte
    fecha_nacimiento    date,
    sexo                text check (sexo in ('M', 'F', 'Otro')),
    telefono            text,
    email               text,
    direccion           text,
    -- Contacto de emergencia: { nombre, telefono, parentesco }
    contacto_emergencia jsonb,
    alergias            text,
    activo              boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Tabla: doctores (catalogo de doctores/especialistas de la
-- clinica). usuario_id es opcional: se puede crear el doctor
-- antes de darle acceso al sistema, o nunca dárselo si solo se
-- usa para agendar sus citas.
-- ---------------------------------------------------------
create table if not exists doctores (
    id                  uuid primary key default gen_random_uuid(),
    empresa_id          uuid not null references empresas(id),
    usuario_id          uuid references usuarios(id) on delete set null,
    especialidad_id     uuid not null references especialidades(id) on delete restrict,
    nombre              text not null,
    numero_colegiado    text,                 -- numero de colegiatura/licencia medica
    telefono            text,
    email               text,
    activo              boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Tabla: citas (agenda de citas paciente <-> doctor)
-- ---------------------------------------------------------
create table if not exists citas (
    id              uuid primary key default gen_random_uuid(),
    empresa_id      uuid not null references empresas(id),
    paciente_id     uuid not null references pacientes(id) on delete restrict,
    doctor_id       uuid not null references doctores(id) on delete restrict,
    fecha           date not null,
    hora_inicio     time not null,
    hora_fin        time not null,
    estado          text not null check (estado in ('pendiente', 'confirmada', 'atendida', 'cancelada', 'no_asistio')) default 'pendiente',
    motivo          text,
    observaciones   text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint chk_horario_cita check (hora_fin > hora_inicio)
);

-- ---------------------------------------------------------
-- Tabla: signos_vitales (temperatura, peso, talla/IMC, presion
-- arterial y glucosa tomados al llegar el paciente a su cita
-- (recepcion / enfermeria), antes de que el doctor cree la
-- historia clinica -- por eso se ata a cita_id y no a
-- historia_clinica_id: de lo contrario no se podrian tomar los
-- signos vitales hasta que el doctor ya hubiera registrado
-- diagnostico/tratamiento.
-- ---------------------------------------------------------
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
    glucosa                 numeric(5,1),   -- mg/dL (glucosa capilar/venosa puntual)
    glucosa_glicosilada     numeric(4,1),   -- % (HbA1c, promedio de los ultimos ~3 meses)
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),

    constraint chk_signos_vitales_temperatura   check (temperatura is null or (temperatura between 30 and 45)),
    constraint chk_signos_vitales_peso          check (peso is null or (peso between 0 and 400)),
    constraint chk_signos_vitales_talla         check (talla is null or (talla between 0 and 250)),
    constraint chk_signos_vitales_presion_sist  check (presion_sistolica is null or (presion_sistolica between 40 and 260)),
    constraint chk_signos_vitales_presion_diast check (presion_diastolica is null or (presion_diastolica between 20 and 200)),
    constraint chk_signos_vitales_glucosa       check (glucosa is null or (glucosa between 0 and 700)),
    constraint chk_signos_vitales_glucosa_glicosilada check (glucosa_glicosilada is null or (glucosa_glicosilada between 3 and 20))
);

-- ---------------------------------------------------------
-- Tabla: historias_clinicas (registro de lo atendido en una
-- cita). Una cita atendida tiene, a lo sumo, una historia clinica.
-- ---------------------------------------------------------
create table if not exists historias_clinicas (
    id                  uuid primary key default gen_random_uuid(),
    empresa_id          uuid not null references empresas(id),
    cita_id             uuid not null unique references citas(id) on delete cascade,
    paciente_id         uuid not null references pacientes(id) on delete restrict,
    doctor_id           uuid not null references doctores(id) on delete restrict,
    motivo_consulta     text,
    diagnostico         text,
    tratamiento         text,
    notas               text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Tabla: recetas (cabecera, N por cita -- un doctor puede emitir
-- mas de una receta en la misma consulta) y receta_medicamentos
-- (lineas, N por receta). Se ata a cita_id, no a
-- historia_clinica_id: el doctor puede emitir una receta (ej.
-- una renovacion) sin necesitar haber completado la historia
-- clinica de esa cita.
-- ---------------------------------------------------------
create table if not exists recetas (
    id                      uuid primary key default gen_random_uuid(),
    empresa_id              uuid not null references empresas(id),
    cita_id                 uuid not null references citas(id) on delete cascade,
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

-- ---------------------------------------------------------
-- Indices
-- ---------------------------------------------------------
create index if not exists idx_usuarios_empresas_rol_usuario on usuarios_empresas_rol(usuario_id);
create index if not exists idx_usuarios_empresas_rol_empresa on usuarios_empresas_rol(empresa_id);
create index if not exists idx_pacientes_empresa on pacientes(empresa_id);
create index if not exists idx_doctores_empresa on doctores(empresa_id);
create index if not exists idx_citas_empresa on citas(empresa_id);
create index if not exists idx_citas_doctor_fecha on citas(doctor_id, fecha);
create index if not exists idx_citas_paciente on citas(paciente_id);
create index if not exists idx_historias_clinicas_paciente on historias_clinicas(paciente_id);
create index if not exists idx_signos_vitales_paciente on signos_vitales(paciente_id);
create index if not exists idx_signos_vitales_empresa on signos_vitales(empresa_id);
create index if not exists idx_recetas_paciente on recetas(paciente_id);
create index if not exists idx_recetas_empresa on recetas(empresa_id);
create index if not exists idx_recetas_cita on recetas(cita_id);
create index if not exists idx_receta_medicamentos_receta on receta_medicamentos(receta_id);

-- ---------------------------------------------------------
-- Restricciones unicas por clinica
-- ---------------------------------------------------------
alter table especialidades add constraint uq_especialidades_empresa_nombre unique (empresa_id, nombre);
alter table pacientes       add constraint uq_pacientes_empresa_identificacion unique (empresa_id, identificacion);

-- ---------------------------------------------------------
-- Trigger generico para actualizar updated_at
-- ---------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

do $$
declare
    t text;
begin
    foreach t in array array['empresas','usuarios','usuarios_empresas_rol','especialidades','pacientes','doctores','citas','historias_clinicas','signos_vitales','recetas']
    loop
        execute format('drop trigger if exists trg_set_updated_at on %I', t);
        execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at()', t);
    end loop;
end;
$$;

-- ---------------------------------------------------------
-- Usuario super-admin inicial (ajustar el hash de password
-- antes de correr esto -- ver database/README o generarlo con
-- bcrypt: node -e "console.log(require('bcryptjs').hashSync('TU_PASSWORD', 10))")
-- ---------------------------------------------------------
-- insert into usuarios (nombre, email, password_hash, es_super_admin)
-- values ('Super Admin', 'admin@clinica.com', '<hash-bcrypt-aqui>', true);
