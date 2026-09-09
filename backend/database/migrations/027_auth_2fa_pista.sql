-- Pista de contrasena (hint mostrado en el login) y 2FA por app
-- autenticadora (TOTP). El secreto se guarda siempre cifrado (AES-256-CBC,
-- clave en env CRYPTO_SECRET_KEY) -- nunca en texto plano. two_factor_enabled
-- queda en false por defecto para todos los usuarios: el 2FA se implementa
-- completo pero nadie lo tiene activo hasta que se enrole explicitamente
-- desde la pantalla de seguridad (ver DISENO-AUTENTICACION-2FA-SESION.md).
alter table usuarios add column if not exists pista text;
alter table usuarios add column if not exists two_factor_enabled boolean not null default false;
alter table usuarios add column if not exists two_factor_secret text;
