-- Permite que un mismo usuario tenga a lo sumo UN rol de staff
-- (admin/doctor/recepcionista) Y a lo sumo UN rol 'paciente' en la MISMA
-- clinica simultaneamente (ej. un admin que ademas es paciente de su
-- propia clinica) -- nunca dos roles de staff a la vez. Reemplaza el
-- unique(usuario_id, empresa_id) por dos indices unicos parciales.

alter table usuarios_empresas_rol drop constraint if exists usuarios_empresas_rol_usuario_id_empresa_id_key;

create unique index if not exists uq_usuarios_empresas_rol_staff
  on usuarios_empresas_rol(usuario_id, empresa_id) where rol <> 'paciente';
create unique index if not exists uq_usuarios_empresas_rol_paciente
  on usuarios_empresas_rol(usuario_id, empresa_id) where rol = 'paciente';
