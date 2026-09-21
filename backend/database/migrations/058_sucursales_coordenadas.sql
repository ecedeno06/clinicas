-- Coordenadas reales de la sucursal (lat/lng), para poder ubicarla en
-- un mapa (ej. mapa de calor de diagnosticos por sucursal). Hasta ahora
-- solo se guardaba google_maps_url (texto) -- el selector de mapa
-- (mapa-selector.component.ts) ya calcula lat/lng al elegir el punto,
-- pero se descartaba antes de guardar.

alter table sucursales add column if not exists latitud numeric(10,7);
alter table sucursales add column if not exists longitud numeric(10,7);

-- Backfill best-effort desde el google_maps_url ya guardado, con los
-- mismos 2 patrones que ya reconoce extraerLatLng() en el frontend
-- (mapa-selector.component.ts) -- una sucursal cuyo link no calce
-- ninguno de los dos (ej. un link corto o de busqueda por nombre) queda
-- con latitud/longitud en null, y no aparece en el mapa de calor hasta
-- que alguien vuelva a elegir su ubicacion en el selector.
update sucursales
set latitud = (regexp_match(google_maps_url, '[?&]q=(-?[0-9]+\.?[0-9]*),(-?[0-9]+\.?[0-9]*)'))[1]::numeric,
    longitud = (regexp_match(google_maps_url, '[?&]q=(-?[0-9]+\.?[0-9]*),(-?[0-9]+\.?[0-9]*)'))[2]::numeric
where latitud is null and google_maps_url ~ '[?&]q=-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*';

update sucursales
set latitud = (regexp_match(google_maps_url, '@(-?[0-9]+\.?[0-9]*),(-?[0-9]+\.?[0-9]*)'))[1]::numeric,
    longitud = (regexp_match(google_maps_url, '@(-?[0-9]+\.?[0-9]*),(-?[0-9]+\.?[0-9]*)'))[2]::numeric
where latitud is null and google_maps_url ~ '@-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*';
