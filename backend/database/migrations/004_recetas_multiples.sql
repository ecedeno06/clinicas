-- =========================================================
-- Migracion: permitir multiples recetas por cita
-- El doctor puede emitir mas de una receta en la misma cita (ej.
-- una para un tratamiento y otra por separado mas tarde en la
-- misma consulta). Se quita el "unique" sobre cita_id que solo
-- permitia una receta por cita, y se agrega un indice normal en
-- su lugar (el unique traia su propio indice implicito).
-- =========================================================

alter table recetas drop constraint if exists recetas_cita_id_key;

create index if not exists idx_recetas_cita on recetas(cita_id);
