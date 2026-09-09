-- Fuerza a un usuario a cambiar su contrasena en el siguiente login: se
-- activa cuando un admin crea el usuario o le resetea la contrasena desde
-- la pantalla de Usuarios (la contrasena que puso el admin es temporal,
-- ya que el admin la conoce). Se limpia sola cuando el propio usuario
-- cambia su contrasena via /auth/password (auto-servicio, con su
-- contrasena actual). Ver inspiracion en agro 1.1 (debe_cambiar_password).
alter table usuarios add column if not exists debe_cambiar_password boolean not null default false;
