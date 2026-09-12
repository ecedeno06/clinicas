-- Catalogo global de examenes de laboratorio (categorias + detalle),
-- compartido por todas las clinicas -- mismo patron exacto que
-- categorias_antecedentes/antecedentes_patologicos (migracion 036).
-- Solo lectura para cualquier usuario autenticado; crear/editar/eliminar
-- requiere ser super administrador. Alimenta el checklist de "Nueva
-- orden de laboratorio" (Citas), calcado del formulario real de APLAFA.
create table if not exists categorias_examenes_laboratorio (
    id         uuid primary key default gen_random_uuid(),
    nombre     text not null unique,
    orden      integer not null default 0,
    activo     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists examenes_laboratorio_catalogo (
    id               uuid primary key default gen_random_uuid(),
    categoria_id     uuid not null references categorias_examenes_laboratorio(id),
    nombre           text not null,
    -- Valores por defecto opcionales que precargan la fila al marcar la
    -- casilla en la orden (el doctor los puede editar igual que hoy).
    valor_referencia text,
    unidad           text,
    orden            integer not null default 0,
    activo           boolean not null default true,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique(categoria_id, nombre)
);
create index if not exists idx_examenes_laboratorio_catalogo_categoria on examenes_laboratorio_catalogo(categoria_id);

-- Seed: 14 categorias, ~100 examenes, mismo orden que el formulario
-- original de APLAFA. Idempotente via "on conflict do nothing".
insert into categorias_examenes_laboratorio (nombre, orden) values
  ('Hematologia', 1),
  ('Coagulacion', 2),
  ('Bacteriologia', 3),
  ('Quimica General', 4),
  ('Perfil Hepatico', 5),
  ('Perfil Cardiaco', 6),
  ('Quimica Especial', 7),
  ('Marcadores Tumorales', 8),
  ('Perfil Reproductivo', 9),
  ('Perfil Tiroideo', 10),
  ('Urinalisis y Parasitologia', 11),
  ('Serologia / Inmunologia', 12),
  ('Droga Terapeutica y de Abuso', 13),
  ('Otros', 14)
on conflict (nombre) do nothing;

insert into examenes_laboratorio_catalogo (categoria_id, nombre, orden)
select c.id, v.nombre, v.orden from (values
  ('Hematologia', 'Hemograma Completo/Plaquetas', 1),
  ('Hematologia', 'Hemograma / Hematocrito', 2),
  ('Hematologia', 'VES (Westergreen/Wintrobe)', 3),
  ('Hematologia', 'Placa por Malaria', 4),
  ('Hematologia', 'Tipaje RH', 5),
  ('Hematologia', 'Electroforesis de A2 y Fetal', 6),
  ('Hematologia', 'Solubilidad de Hb', 7),
  ('Hematologia', 'Celulas LE', 8),
  ('Hematologia', 'Eosinofilos en Moco Nasal', 9),

  ('Coagulacion', 'TP', 1),
  ('Coagulacion', 'TPT', 2),
  ('Coagulacion', 'Fibrinogeno', 3),
  ('Coagulacion', 'INR', 4),

  ('Bacteriologia', 'Frotis por GRAM', 1),
  ('Bacteriologia', 'Frotis por G.C.', 2),
  ('Bacteriologia', 'Cultivo de Secrecion General', 3),
  ('Bacteriologia', 'Urocultivo', 4),
  ('Bacteriologia', 'Coprocultivo', 5),

  ('Quimica General', 'Glucosa', 1),
  ('Quimica General', 'Tolerancia a la Glucosa', 2),
  ('Quimica General', 'Glucosa Post Prandial', 3),
  ('Quimica General', 'Test de Sullivan', 4),
  ('Quimica General', 'Creatinina', 5),
  ('Quimica General', 'Nitrogeno de Urea', 6),
  ('Quimica General', 'Acido Urico', 7),
  ('Quimica General', 'Colesterol', 8),
  ('Quimica General', 'Trigliceridos', 9),
  ('Quimica General', 'HDL / LDL', 10),
  ('Quimica General', 'Calcio', 11),
  ('Quimica General', 'Fosforo', 12),
  ('Quimica General', 'Magnesio', 13),
  ('Quimica General', 'Litio', 14),
  ('Quimica General', 'Electrolitos (Na, K, Cl, CO2)', 15),
  ('Quimica General', 'Proteinas Totales y Albumina', 16),
  ('Quimica General', 'Acido Folico', 17),
  ('Quimica General', 'Vitamina B12', 18),

  ('Perfil Hepatico', 'Bilirrubina Total y Fraccionada', 1),
  ('Perfil Hepatico', 'Fosfatasa Alcalina', 2),
  ('Perfil Hepatico', 'GGT', 3),
  ('Perfil Hepatico', 'AST', 4),
  ('Perfil Hepatico', 'ALT', 5),

  ('Perfil Cardiaco', 'CPK', 1),
  ('Perfil Cardiaco', 'CPK-MB', 2),
  ('Perfil Cardiaco', 'DHL', 3),

  ('Quimica Especial', 'PKU Serico', 1),
  ('Quimica Especial', 'Paratohormona', 2),
  ('Quimica Especial', 'Testosterona Total', 3),
  ('Quimica Especial', 'Testosterona Libre', 4),
  ('Quimica Especial', 'Hemoglobina Glicosilada', 5),

  ('Marcadores Tumorales', 'PSA Total y Libre', 1),
  ('Marcadores Tumorales', 'Alfa FP', 2),
  ('Marcadores Tumorales', 'CEA', 3),

  ('Perfil Reproductivo', 'BHCG Cualitativa', 1),
  ('Perfil Reproductivo', 'BHCG Cuantitativa', 2),
  ('Perfil Reproductivo', 'FSH', 3),
  ('Perfil Reproductivo', 'LH', 4),
  ('Perfil Reproductivo', 'Estradiol', 5),
  ('Perfil Reproductivo', 'Estriol', 6),
  ('Perfil Reproductivo', 'Prolactina', 7),
  ('Perfil Reproductivo', 'Progesterona', 8),

  ('Perfil Tiroideo', 'T3', 1),
  ('Perfil Tiroideo', 'T3L', 2),
  ('Perfil Tiroideo', 'T4', 3),
  ('Perfil Tiroideo', 'T4L', 4),
  ('Perfil Tiroideo', 'TSH', 5),

  ('Urinalisis y Parasitologia', 'Urinalisis General', 1),
  ('Urinalisis y Parasitologia', 'Suspension Vaginal por Tricomonas y Monilias', 2),
  ('Urinalisis y Parasitologia', 'Heces Generales', 3),
  ('Urinalisis y Parasitologia', 'Heces por Amebas', 4),
  ('Urinalisis y Parasitologia', 'Heces por Sangre Oculta', 5),
  ('Urinalisis y Parasitologia', 'Heces por Leucocitos y Azul de Metileno', 6),
  ('Urinalisis y Parasitologia', 'Heces por PH', 7),
  ('Urinalisis y Parasitologia', 'Heces por Grasas o Sudan III', 8),
  ('Urinalisis y Parasitologia', 'Heces por Azucares Reductores', 9),
  ('Urinalisis y Parasitologia', 'Rotavirus', 10),

  ('Serologia / Inmunologia', 'VDRL', 1),
  ('Serologia / Inmunologia', 'MHATP', 2),
  ('Serologia / Inmunologia', 'FTA-ABS', 3),
  ('Serologia / Inmunologia', 'HIV', 4),
  ('Serologia / Inmunologia', 'Toxoplasma IgG', 5),
  ('Serologia / Inmunologia', 'Toxoplasma IgM', 6),
  ('Serologia / Inmunologia', 'Rubeola IgG', 7),
  ('Serologia / Inmunologia', 'Rubeola IgM', 8),
  ('Serologia / Inmunologia', 'CMV IgG', 9),
  ('Serologia / Inmunologia', 'CMV IgM', 10),
  ('Serologia / Inmunologia', 'Herpes Tipo I IgG', 11),
  ('Serologia / Inmunologia', 'Herpes Tipo I IgM', 12),
  ('Serologia / Inmunologia', 'Herpes Tipo II IgG', 13),
  ('Serologia / Inmunologia', 'Herpes Tipo II IgM', 14),
  ('Serologia / Inmunologia', 'Mono Test', 15),
  ('Serologia / Inmunologia', 'H. Pylori en Heces', 16),
  ('Serologia / Inmunologia', 'PCR', 17),
  ('Serologia / Inmunologia', 'ASTO', 18),
  ('Serologia / Inmunologia', 'FR', 19),
  ('Serologia / Inmunologia', 'Aglutinaciones Febriles', 20),
  ('Serologia / Inmunologia', 'Anticuerpos de Hepatitis B', 21),
  ('Serologia / Inmunologia', 'Hepatitis C', 22),
  ('Serologia / Inmunologia', 'Hepatitis A', 23),
  ('Serologia / Inmunologia', 'C3/C4', 24),
  ('Serologia / Inmunologia', 'ANA', 25),
  ('Serologia / Inmunologia', 'Anti-DNA', 26),
  ('Serologia / Inmunologia', 'CH50', 27),
  ('Serologia / Inmunologia', 'IgG/IgA/IgM', 28),
  ('Serologia / Inmunologia', 'IgE', 29),

  ('Droga Terapeutica y de Abuso', 'Digoxina', 1),
  ('Droga Terapeutica y de Abuso', 'Tegretol o Carbamazepina', 2),
  ('Droga Terapeutica y de Abuso', 'Epamin o Fenitoina', 3),
  ('Droga Terapeutica y de Abuso', 'Teofilina', 4),
  ('Droga Terapeutica y de Abuso', 'Fenobarbital', 5),
  ('Droga Terapeutica y de Abuso', 'Acido Valproico o Depakene', 6),
  ('Droga Terapeutica y de Abuso', 'Acetaminofen', 7),
  ('Droga Terapeutica y de Abuso', 'Metabolito de Cocaina', 8),
  ('Droga Terapeutica y de Abuso', 'Metabolito de Marihuana', 9),
  ('Droga Terapeutica y de Abuso', 'Alcoholemia', 10),

  ('Otros', 'CA 125', 1),
  ('Otros', 'Alfa Feto Proteina', 2),
  ('Otros', 'CA 19-9', 3),
  ('Otros', 'CA 15-3', 4)
) as v(categoria_nombre, nombre, orden)
join categorias_examenes_laboratorio c on c.nombre = v.categoria_nombre
on conflict (categoria_id, nombre) do nothing;
