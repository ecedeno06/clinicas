-- Columna aditiva: enlace a Google Maps de la sucursal (texto libre, la URL
-- que el usuario copia de Google Maps -- no se valida formato, solo se usa
-- para mostrar un link "Ver en el mapa").
alter table sucursales add column if not exists google_maps_url text;
