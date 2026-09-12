-- Permite que cada clinica agregue sus propias categorias y examenes de
-- laboratorio (ademas del catalogo global existente): empresa_id nulo
-- sigue siendo el catalogo global (solo administrable por super admin);
-- empresa_id no nulo identifica la clinica que lo creo, y solo esa
-- clinica (o un super admin) puede editarlo/eliminarlo.
alter table categorias_examenes_laboratorio add column if not exists empresa_id uuid references empresas(id);
alter table examenes_laboratorio_catalogo add column if not exists empresa_id uuid references empresas(id);

-- El "unique(nombre)"/"unique(categoria_id, nombre)" original impedia que
-- dos clinicas distintas usaran el mismo nombre (o que una clinica
-- reusara un nombre ya usado globalmente en otra categoria). Se
-- reemplaza por indices unicos parciales, con el mismo criterio que la
-- version nueva de schema.sql.
alter table categorias_examenes_laboratorio drop constraint if exists categorias_examenes_laboratorio_nombre_key;
create unique index if not exists uq_categorias_examenes_lab_global_nombre on categorias_examenes_laboratorio (nombre) where empresa_id is null;
create unique index if not exists uq_categorias_examenes_lab_empresa_nombre on categorias_examenes_laboratorio (empresa_id, nombre) where empresa_id is not null;
create index if not exists idx_categorias_examenes_lab_empresa on categorias_examenes_laboratorio(empresa_id);

alter table examenes_laboratorio_catalogo drop constraint if exists examenes_laboratorio_catalogo_categoria_id_nombre_key;
create unique index if not exists uq_examenes_laboratorio_catalogo_global on examenes_laboratorio_catalogo (categoria_id, nombre) where empresa_id is null;
create unique index if not exists uq_examenes_laboratorio_catalogo_empresa on examenes_laboratorio_catalogo (categoria_id, empresa_id, nombre) where empresa_id is not null;
create index if not exists idx_examenes_laboratorio_catalogo_empresa on examenes_laboratorio_catalogo(empresa_id);
