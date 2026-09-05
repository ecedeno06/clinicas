-- Agrega el estado 'reagendar' a citas: se usa cuando se elimina el bloque
-- de horario de un doctor y quedan citas activas (pendiente/confirmada,
-- no vencidas) sin disponibilidad -- ver doctorHorarios.controller.js#eliminar.
alter table citas drop constraint if exists citas_estado_check;
alter table citas add constraint citas_estado_check
  check (estado in ('pendiente', 'confirmada', 'atendida', 'cancelada', 'no_asistio', 'reagendar'));
