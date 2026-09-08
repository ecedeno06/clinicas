-- Columnas aditivas: telefono de contacto del usuario del sistema y si
-- recibe WhatsApp. Mismo patron que doctores.telefono/acepta_whatsapp
-- (migracion 018) y pacientes.telefono/acepta_whatsapp (migracion 015).
alter table usuarios add column if not exists telefono text;
alter table usuarios add column if not exists acepta_whatsapp boolean not null default false;
