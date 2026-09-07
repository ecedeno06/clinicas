-- Columna aditiva: marca si la cita es una visita a domicilio del paciente
-- (en vez de en la sucursal). sucursal_id se mantiene igual que en una
-- campana -- sigue siendo la sede que organiza/factura la cita, no el lugar
-- fisico donde se atiende. Se fija solo al crear la cita (no se edita
-- despues, mismo criterio que doctor_id/paciente_id).
alter table citas add column if not exists es_domicilio boolean not null default false;
