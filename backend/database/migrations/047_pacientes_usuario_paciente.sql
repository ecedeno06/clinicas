-- Permite invitar a un paciente a tener su propia cuenta (rol 'paciente',
-- solo lectura de su propia informacion) desde la pantalla de Pacientes.
-- pacientes.usuario_id sigue el mismo patron ya usado en
-- doctores.usuario_id: nullable, on delete set null (el paciente puede
-- existir sin cuenta, o perder la cuenta sin que se borre su ficha).

alter table pacientes add column if not exists usuario_id uuid references usuarios(id) on delete set null;

create unique index if not exists uq_pacientes_usuario on pacientes(usuario_id) where usuario_id is not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'usuarios_empresas_rol'::regclass
      and conname = 'usuarios_empresas_rol_rol_check'
  ) then
    alter table usuarios_empresas_rol drop constraint usuarios_empresas_rol_rol_check;
  end if;
end $$;

alter table usuarios_empresas_rol add constraint usuarios_empresas_rol_rol_check
  check (rol in ('admin', 'doctor', 'recepcionista', 'paciente'));
