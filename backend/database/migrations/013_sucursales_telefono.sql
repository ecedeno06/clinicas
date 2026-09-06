-- Columna aditiva: telefono de contacto de la sucursal (mismo patron que
-- empresas.telefono/doctores.telefono -- texto libre, nullable).
alter table sucursales add column if not exists telefono text;
