-- doctor_id es distinto de creado_por: creado_por es quien registro el
-- dato en el sistema (puede ser un doctor, una recepcionista, o a futuro
-- el propio paciente); doctor_id es el doctor que realmente diagnostico
-- el antecedente -- mismo criterio que recetas.doctor_id vs
-- recetas.creado_por (migraciones 003/011).
alter table paciente_antecedente add column if not exists doctor_id uuid references doctores(id);
