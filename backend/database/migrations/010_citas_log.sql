-- Bitacora de auditoria de la cita: un objeto {fecha, usuario, nota} por
-- cada interaccion (crear, editar, reagendar, cancelar, etc.), en el
-- orden en que ocurrieron. Se agrega solo, nunca se edita ni se borra.
alter table citas add column if not exists log jsonb not null default '[]'::jsonb;
