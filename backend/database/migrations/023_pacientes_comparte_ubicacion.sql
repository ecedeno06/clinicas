-- Columna aditiva: consentimiento explicito del paciente para compartir su
-- ubicacion (google_maps_url) con el personal/doctor -- controla si los
-- botones de ubicacion (Ver en el mapa, Waze, compartir por WhatsApp con
-- el doctor en una visita a domicilio) se muestran, aunque el enlace ya
-- este guardado. Registros existentes quedan en false por defecto (no se
-- asume consentimiento hasta que alguien lo marque explicitamente).
alter table pacientes add column if not exists comparte_ubicacion boolean not null default false;
