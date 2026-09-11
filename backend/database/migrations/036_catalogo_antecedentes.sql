-- Catalogo global de antecedentes patologicos (categorias + detalle),
-- compartido por todas las clinicas -- no lleva empresa_id. Solo lectura
-- para cualquier usuario autenticado; crear/editar/eliminar requiere
-- ser super administrador (ver requireSuperAdmin en
-- backend/src/middleware/auth.js, mismo criterio que empresas.routes.js).
-- Pensado para alimentar en el futuro el formulario de antecedentes del
-- paciente (esa pantalla de consumo no forma parte de esta migracion).
create table if not exists categorias_antecedentes (
    id         uuid primary key default gen_random_uuid(),
    nombre     text not null unique,
    orden      integer not null default 0,
    activo     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists antecedentes_patologicos (
    id           uuid primary key default gen_random_uuid(),
    categoria_id uuid not null references categorias_antecedentes(id),
    nombre       text not null,
    orden        integer not null default 0,
    activo       boolean not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique(categoria_id, nombre)
);
create index if not exists idx_antecedentes_patologicos_categoria on antecedentes_patologicos(categoria_id);

-- Seed: 14 categorias y 76 condiciones, tal cual
-- catalogo_antecedentes_patologicos.xlsx (hoja "Antecedentes
-- Patologicos"). Idempotente via "on conflict do nothing".
insert into categorias_antecedentes (nombre, orden) values
  ('Cardiovascular', 1),
  ('Endocrino / Metabólico', 2),
  ('Respiratorio', 3),
  ('Renal / Urinario', 4),
  ('Digestivo', 5),
  ('Neurológico', 6),
  ('Musculoesquelético', 7),
  ('Hematológico / Oncológico', 8),
  ('Infeccioso', 9),
  ('Psiquiátrico / Mental', 10),
  ('Dermatológico', 11),
  ('Oftalmológico / ORL', 12),
  ('Alergias', 13),
  ('Quirúrgico', 14)
on conflict (nombre) do nothing;

insert into antecedentes_patologicos (categoria_id, nombre, orden)
select c.id, v.nombre, v.orden from (values
  ('Cardiovascular', 'Hipertensión arterial', 1),
  ('Cardiovascular', 'Infarto agudo de miocardio', 2),
  ('Cardiovascular', 'Insuficiencia cardíaca', 3),
  ('Cardiovascular', 'Arritmias (fibrilación auricular, etc.)', 4),
  ('Cardiovascular', 'Enfermedad valvular', 5),
  ('Cardiovascular', 'Enfermedad arterial periférica', 6),
  ('Cardiovascular', 'Trombosis venosa profunda / embolia pulmonar', 7),
  ('Cardiovascular', 'Dislipidemia (colesterol/triglicéridos altos)', 8),

  ('Endocrino / Metabólico', 'Diabetes mellitus tipo 1', 1),
  ('Endocrino / Metabólico', 'Diabetes mellitus tipo 2', 2),
  ('Endocrino / Metabólico', 'Diabetes gestacional', 3),
  ('Endocrino / Metabólico', 'Hipotiroidismo', 4),
  ('Endocrino / Metabólico', 'Hipertiroidismo', 5),
  ('Endocrino / Metabólico', 'Obesidad', 6),
  ('Endocrino / Metabólico', 'Síndrome metabólico', 7),
  ('Endocrino / Metabólico', 'Enfermedad de Cushing', 8),
  ('Endocrino / Metabólico', 'Enfermedad de Addison', 9),

  ('Respiratorio', 'Asma', 1),
  ('Respiratorio', 'EPOC (enfermedad pulmonar obstructiva crónica)', 2),
  ('Respiratorio', 'Tuberculosis', 3),
  ('Respiratorio', 'Neumonía a repetición', 4),
  ('Respiratorio', 'Apnea del sueño', 5),
  ('Respiratorio', 'Bronquitis crónica', 6),

  ('Renal / Urinario', 'Insuficiencia renal aguda', 1),
  ('Renal / Urinario', 'Insuficiencia renal crónica', 2),
  ('Renal / Urinario', 'Infecciones urinarias recurrentes', 3),
  ('Renal / Urinario', 'Cálculos renales', 4),
  ('Renal / Urinario', 'Hiperplasia prostática', 5),
  ('Renal / Urinario', 'Prostatitis', 6),

  ('Digestivo', 'Gastritis', 1),
  ('Digestivo', 'Úlcera péptica', 2),
  ('Digestivo', 'Enfermedad por reflujo (ERGE)', 3),
  ('Digestivo', 'Hepatitis A', 4),
  ('Digestivo', 'Hepatitis B', 5),
  ('Digestivo', 'Hepatitis C', 6),
  ('Digestivo', 'Cirrosis hepática', 7),
  ('Digestivo', 'Colitis / Enfermedad inflamatoria intestinal', 8),
  ('Digestivo', 'Cálculos biliares', 9),
  ('Digestivo', 'Pancreatitis', 10),

  ('Neurológico', 'Epilepsia / Convulsiones', 1),
  ('Neurológico', 'Migraña', 2),
  ('Neurológico', 'Accidente cerebrovascular (ACV/derrame)', 3),
  ('Neurológico', 'Enfermedad de Parkinson', 4),
  ('Neurológico', 'Neuropatías', 5),

  ('Musculoesquelético', 'Artritis reumatoide', 1),
  ('Musculoesquelético', 'Osteoartritis', 2),
  ('Musculoesquelético', 'Osteoporosis', 3),
  ('Musculoesquelético', 'Lupus', 4),
  ('Musculoesquelético', 'Gota', 5),
  ('Musculoesquelético', 'Fracturas previas', 6),

  ('Hematológico / Oncológico', 'Anemia', 1),
  ('Hematológico / Oncológico', 'Cáncer (especificar tipo)', 2),
  ('Hematológico / Oncológico', 'Trastornos de coagulación', 3),
  ('Hematológico / Oncológico', 'Leucemia', 4),
  ('Hematológico / Oncológico', 'Linfoma', 5),

  ('Infeccioso', 'VIH/SIDA', 1),
  ('Infeccioso', 'COVID-19 (y secuelas)', 2),
  ('Infeccioso', 'Enfermedades de transmisión sexual', 3),

  ('Psiquiátrico / Mental', 'Depresión', 1),
  ('Psiquiátrico / Mental', 'Ansiedad', 2),
  ('Psiquiátrico / Mental', 'Trastorno bipolar', 3),
  ('Psiquiátrico / Mental', 'Esquizofrenia', 4),
  ('Psiquiátrico / Mental', 'Trastornos alimentarios', 5),

  ('Dermatológico', 'Psoriasis', 1),
  ('Dermatológico', 'Dermatitis atópica', 2),
  ('Dermatológico', 'Vitíligo', 3),

  ('Oftalmológico / ORL', 'Glaucoma', 1),
  ('Oftalmológico / ORL', 'Cataratas', 2),
  ('Oftalmológico / ORL', 'Pérdida auditiva', 3),

  ('Alergias', 'Alergia a medicamentos', 1),
  ('Alergias', 'Alergia a alimentos', 2),
  ('Alergias', 'Alergia ambiental (polen, ácaros, etc.)', 3),

  ('Quirúrgico', 'Apendicectomía', 1),
  ('Quirúrgico', 'Colecistectomía', 2),
  ('Quirúrgico', 'Cesáreas', 3),
  ('Quirúrgico', 'Otra cirugía', 4)
) as v(categoria_nombre, nombre, orden)
join categorias_antecedentes c on c.nombre = v.categoria_nombre
on conflict (categoria_id, nombre) do nothing;
