-- Columna aditiva: marca una cita como urgencia -- permite asignar
-- cualquier doctor sin que el horario configurado (doctor_horarios) lo
-- bloquee. No afecta los choques reales (otra cita del mismo doctor/
-- paciente a la misma hora): eso sigue validado igual, una urgencia no
-- puede duplicar al doctor en dos lugares a la vez. Se fija solo al crear
-- la cita, editable mientras sigue pendiente (mismo criterio que
-- es_domicilio).
alter table citas add column if not exists es_urgencia boolean not null default false;
