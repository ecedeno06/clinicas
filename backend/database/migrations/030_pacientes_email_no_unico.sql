-- Permite que varios pacientes compartan el mismo email: es comun que
-- alguien sin correo propio (un nino, un adulto mayor, etc.) use el de un
-- familiar o cuidador para las comunicaciones de la clinica. La
-- identificacion SI debe seguir siendo unica (es un documento legal); el
-- email de un paciente es solo un dato de contacto, no una credencial de
-- acceso como usuarios.email.
--
-- Se prueban los dos nombres posibles de la restriccion: "pacientes_email_key"
-- (el que genera una instalacion nueva desde schema.sql) y "uq_pacientes_email"
-- (el que ya tenian .17 y Neon de antes).
alter table pacientes drop constraint if exists pacientes_email_key;
alter table pacientes drop constraint if exists uq_pacientes_email;
