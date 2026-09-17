-- =========================================================
-- Migracion 053: acepta_whatsapp en sucursales
-- =========================================================

-- Mismo patron ya usado en pacientes.acepta_whatsapp y
-- familiares_paciente.acepta_whatsapp (migracion 052) -- indica si el
-- telefono de la sucursal puede recibir mensajes de WhatsApp (el
-- mensaje al familiar ya incluye este numero, ver whatsappUrlFamiliar
-- en citas.component.ts).
alter table sucursales add column if not exists acepta_whatsapp boolean not null default false;
