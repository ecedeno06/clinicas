-- Autoria por antecedente: quien lo creo puede editarlo/eliminarlo, otros
-- usuarios no (mismo criterio ya usado en recetas.creado_por, migracion
-- 011). null = autor desconocido (filas creadas antes de este campo, via
-- el flujo anterior de reemplazar-como-conjunto) -- quedan sin
-- restriccion para no bloquear registros historicos.
alter table paciente_antecedente add column if not exists creado_por uuid references usuarios(id);
