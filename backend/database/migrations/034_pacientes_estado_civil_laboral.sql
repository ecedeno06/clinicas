-- Estado civil y situacion laboral del paciente. tipo_trabajo/lugar_trabajo
-- solo aplican cuando estado_laboral = 'trabaja' (el backend limpia estas
-- dos columnas si el paciente deja de estar en ese estado, ver
-- pacientes.controller.js). Todas opcionales -- pacientes existentes
-- quedan en null hasta que alguien lo complete.
alter table pacientes add column if not exists estado_civil text
    check (estado_civil in ('soltero', 'casado', 'unido', 'viudo'));
alter table pacientes add column if not exists estado_laboral text
    check (estado_laboral in ('trabaja', 'jubilado', 'pensionado', 'no_aplica'));
alter table pacientes add column if not exists tipo_trabajo text
    check (tipo_trabajo in ('privada', 'gobierno', 'independiente'));
alter table pacientes add column if not exists lugar_trabajo text;
