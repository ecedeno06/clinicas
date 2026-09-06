-- Columna aditiva: indica si el telefono del doctor recibe WhatsApp.
-- Mismo patron que pacientes.acepta_whatsapp (migracion 015).
alter table doctores add column if not exists acepta_whatsapp boolean not null default false;
