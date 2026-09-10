-- El campo "telefono" pasa a guardar codigo de pais + numero local pegado,
-- sin "+" ni espacios (formato que necesita wa.me para abrir el chat
-- correcto; ver frontend/src/app/core/components/telefono-input). Antes se
-- guardaba solo el numero local, asumiendo siempre Panama -- esta
-- migracion le agrega el "507" a los numeros existentes de 8 digitos o
-- menos (formato panameño de siempre), y de paso limpia guiones/espacios.
-- Idempotente: un numero ya migrado (11+ digitos) no vuelve a tocarse.
update pacientes
set telefono = '507' || regexp_replace(telefono, '\D', '', 'g')
where telefono is not null
  and length(regexp_replace(telefono, '\D', '', 'g')) between 1 and 8;

update doctores
set telefono = '507' || regexp_replace(telefono, '\D', '', 'g')
where telefono is not null
  and length(regexp_replace(telefono, '\D', '', 'g')) between 1 and 8;

update usuarios
set telefono = '507' || regexp_replace(telefono, '\D', '', 'g')
where telefono is not null
  and length(regexp_replace(telefono, '\D', '', 'g')) between 1 and 8;

-- contacto_emergencia es jsonb: { nombre, telefono, parentesco }.
update pacientes
set contacto_emergencia = jsonb_set(
  contacto_emergencia,
  '{telefono}',
  to_jsonb('507' || regexp_replace(contacto_emergencia->>'telefono', '\D', '', 'g'))
)
where contacto_emergencia ? 'telefono'
  and contacto_emergencia->>'telefono' is not null
  and length(regexp_replace(contacto_emergencia->>'telefono', '\D', '', 'g')) between 1 and 8;
