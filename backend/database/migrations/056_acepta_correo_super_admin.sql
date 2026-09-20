-- Permite que cada super-admin decida si quiere recibir los correos de
-- notificacion de consentimiento (aceptacion/rechazo de compartir
-- historial entre clinicas, ver notificacionConsentimiento.js). Default
-- true para no romper el comportamiento actual (hoy TODOS los
-- super-admin con correo valido reciben esa notificacion).

alter table usuarios add column if not exists acepta_correo_super_admin boolean not null default true;
