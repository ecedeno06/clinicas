-- Columna aditiva: indica si el telefono del paciente recibe WhatsApp.
-- Se usa para no ofrecer "compartir ubicacion por WhatsApp" en Citas
-- cuando el numero registrado no es de WhatsApp.
alter table pacientes add column if not exists acepta_whatsapp boolean not null default false;
