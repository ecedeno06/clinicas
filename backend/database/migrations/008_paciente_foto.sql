-- =========================================================
-- Migracion: foto del paciente
-- Columna nueva en pacientes, base64 (data URI), mismo patron ya usado
-- en usuarios.avatar y empresas.logo. Es global (el paciente es una
-- entidad global), asi que la foto es la misma vista desde cualquier
-- clinica de la red.
-- =========================================================

alter table pacientes add column if not exists foto text;
