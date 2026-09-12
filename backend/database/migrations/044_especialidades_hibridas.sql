-- Convierte "especialidades" en catalogo hibrido (global + por-clinica),
-- mismo patron que categorias_examenes_laboratorio/examenes_laboratorio_catalogo:
-- empresa_id nulo = global (solo super admin lo administra); empresa_id
-- no nulo = propio de esa clinica. Necesario para que la especialidad
-- que ejerce un doctor (hecho de la persona, no de una clinica puntual)
-- se pueda asignar desde un catalogo compartido por toda la red.
alter table especialidades alter column empresa_id drop not null;
create index if not exists idx_especialidades_empresa on especialidades(empresa_id);

-- El unique(empresa_id, nombre) existente (uq_especialidades_empresa_nombre)
-- no evita nombres globales repetidos: en una unique constraint, dos
-- filas con empresa_id null nunca chocan entre si (NULL <> NULL). Se
-- agrega un indice unico parcial solo para el caso global.
create unique index if not exists uq_especialidades_global_nombre on especialidades (nombre) where empresa_id is null;
