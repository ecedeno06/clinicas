-- Enlaza cada fila de una orden de laboratorio al catalogo global
-- (migracion 040) cuando el examen se marco del checklist. Nullable:
-- filas historicas y "otro examen" escrito a mano siguen sin catalogo.
alter table orden_laboratorio_examenes add column if not exists examen_id uuid references examenes_laboratorio_catalogo(id);
