-- Columna aditiva: enlace a Google Maps de la direccion del paciente (texto
-- libre, mismo patron que sucursales.google_maps_url y
-- campanas.google_maps_url) -- pensado para que el medico pueda ubicar y
-- navegar hacia visitas a domicilio.
alter table pacientes add column if not exists google_maps_url text;
