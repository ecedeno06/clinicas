-- Quien creo la receta (usuario logueado, no el doctor al que se atribuye
-- medicamente): permite restringir editar/eliminar solo a su autor.
-- Nullable: las recetas ya existentes no tienen autor conocido, se tratan
-- como "sin restriccion" (ver recetas.controller.js).
alter table recetas add column if not exists creado_por uuid references usuarios(id);
