-- Columna aditiva: enlace a Google Maps del lugar de la campana (mismo
-- patron que sucursales.google_maps_url, migracion 014). Texto libre, sin
-- validacion de formato -- solo se usa para mostrar un link "Ver en el
-- mapa" y para compartir la ubicacion por WhatsApp.
alter table campanas add column if not exists google_maps_url text;
