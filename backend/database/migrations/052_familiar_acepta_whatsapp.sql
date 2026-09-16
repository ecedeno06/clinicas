-- =========================================================
-- Migracion 052: acepta_whatsapp en familiares_paciente
-- =========================================================

-- Mismo patron ya usado en pacientes.acepta_whatsapp -- indica si ese
-- familiar puede recibir mensajes de WhatsApp (ej. para avisos cuando el
-- paciente titular no puede recibirlos el mismo).
alter table familiares_paciente add column if not exists acepta_whatsapp boolean not null default false;
