-- La migracion 047 agrego el rol 'paciente' al check de
-- usuarios_empresas_rol, pero se paso por alto que sesiones.rol tiene su
-- propio check independiente (mismo listado de roles, tabla distinta) --
-- causaba un 23514 al seleccionar una clinica donde el usuario es
-- 'paciente' (emitirTokens escribe una fila en sesiones con ese rol).

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'sesiones'::regclass
      and conname = 'sesiones_rol_check'
  ) then
    alter table sesiones drop constraint sesiones_rol_check;
  end if;
end $$;

alter table sesiones add constraint sesiones_rol_check
  check (rol is null or rol in ('admin', 'doctor', 'recepcionista', 'paciente'));
