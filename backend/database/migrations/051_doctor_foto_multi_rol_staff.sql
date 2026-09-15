-- =========================================================
-- Migracion 051: foto del doctor + multi-rol de STAFF por clinica
-- =========================================================

-- Foto del doctor, base64 (data URI) -- mismo patron ya usado en
-- pacientes.foto (migracion 008), usuarios.avatar y empresas.logo. Es
-- global (el doctor es una entidad global), asi que la foto es la misma
-- vista desde cualquier clinica de la red.
alter table doctores add column if not exists foto text;

-- usuario_id ya viene desde el esquema base de doctores (no es nueva),
-- pero se deja aqui con IF NOT EXISTS por las dudas en instalaciones
-- viejas que pudieran no tenerla -- no-op en cualquier entorno que ya
-- la tenga (dev, .14, produccion).
alter table doctores add column if not exists usuario_id uuid references usuarios(id) on delete set null;

-- Amplia uq_usuarios_empresas_rol_staff (migracion 049) para permitir
-- MAS DE UN rol de staff simultaneo en la misma clinica (ej. un usuario
-- que es admin Y doctor a la vez ahi) -- antes el indice solo permitia
-- uno (usuario_id, empresa_id) sin importar cual; ahora se agrega "rol"
-- a la clave unica, asi que solo se sigue bloqueando repetir el MISMO
-- rol de staff dos veces. uq_usuarios_empresas_rol_paciente (rol
-- 'paciente') no cambia -- un usuario sigue teniendo a lo sumo un
-- acceso de paciente por clinica.
drop index if exists uq_usuarios_empresas_rol_staff;
create unique index if not exists uq_usuarios_empresas_rol_staff
  on usuarios_empresas_rol(usuario_id, empresa_id, rol) where rol <> 'paciente';
