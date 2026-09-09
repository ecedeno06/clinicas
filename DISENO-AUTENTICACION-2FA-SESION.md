# Diseño: mejoras de autenticación (2FA, pista de contraseña, bitácora de sesiones, inactividad)

Inspirado en el proyecto `agro 1.1`, adaptado a las convenciones y arquitectura
de la clínica (multi-tenant, JWT stateless). Ver el reporte de investigación
de `agro 1.1` para el detalle del código original (no versionado aquí).

## Decisiones de diseño (confirmadas con el usuario)

1. **Arquitectura de sesión**: se mantiene JWT stateless como hoy. La tabla
   `sesiones` (migración 026, ya aplicada en `.17`) se usa **solo como
   bitácora** (se inserta una fila al hacer login completo, se cierra al
   hacer logout o al detectar inactividad) -- el middleware `requireAuth`
   NO consulta la tabla en cada request, sigue verificando únicamente la
   firma del JWT. Esto evita agregar una consulta a BD por cada petición
   autenticada.
2. **OTP**: 2FA con app autenticadora (TOTP, tipo Google Authenticator/Authy),
   igual que `agro 1.1` (`otplib` + `qrcode` + secreto cifrado con AES-256-CBC).
   No es un código por email/SMS (eso requeriría un servicio de envío que la
   clínica no tiene integrado).
3. **Contador en el header**: cronómetro de tiempo conectado (cuenta hacia
   arriba desde el login, `HH:MM:SS`), que cambia de estilo cuando el aviso
   de inactividad está activo -- igual que `agro 1.1`. El countdown regresivo
   real (`MM:SS` hasta el cierre) vive en el modal de aviso de inactividad.

## Fase 1 -- Migración de base de datos

Migración `027_auth_2fa_pista.sql`, aditiva (no rompe nada existente):

```sql
alter table usuarios add column if not exists pista text;
alter table usuarios add column if not exists two_factor_enabled boolean not null default false;
alter table usuarios add column if not exists two_factor_secret text; -- cifrado AES-256-CBC, nunca en texto plano
```

Nuevas variables de entorno (`.env.example`):

```
CRYPTO_SECRET_KEY=                       # 32 caracteres o 64 hex -- cifra two_factor_secret
PASSWORD_HINT_MAX_SIMILARITY=70          # % maximo de similitud pista/password (Levenshtein)
SESSION_INACTIVITY_LIMIT_MINUTES=15      # minutos de inactividad antes de cerrar sesion
SESSION_WARNING_BEFORE_MINUTES=2         # minutos antes de expirar en que se muestra el aviso
```

## Fase 2 -- Backend

- `auth.controller.js`:
  - `login`: si `usuarios.two_factor_enabled`, en vez de emitir el JWT final
    responde `{ requiere2FA: true, usuarioId }`. Si no, sigue igual que hoy
    y además inserta la fila en `sesiones` (empresa/sucursal/rol/token/
    expira_en) -- ver nota de sucursal abajo.
  - `verificar2FA` (`POST /auth/2fa/verify-login`): recibe `{ usuarioId, code }`,
    descifra el secreto, valida con `otplib`, y si es correcto continúa el
    mismo flujo de emisión de JWT + fila en `sesiones` que el login normal.
  - `setup2FA` / `enable2FA` / `disable2FA`: mismo flujo que agro (generar
    secreto + QR, confirmar con un código antes de activarlo, exigir un
    código válido para desactivarlo).
  - `logout` (`POST /auth/logout`, nuevo endpoint): cierra la fila de
    `sesiones` correspondiente al token actual (`activo=false`,
    `razon_salida`, `duracion_segundos`).
  - `cambiarPassword`: acepta `pista` opcional, valida similitud con
    Levenshtein contra `PASSWORD_HINT_MAX_SIMILARITY`, persiste `pista`.
  - `obtenerPista` (`GET /auth/pista?email=`, público, **con rate-limit** --
    a diferencia de agro, que no lo tenía): devuelve la pista si existe.
  - `sessionConfig` (`GET /auth/session-config`, público): expone los
    minutos de inactividad/aviso desde env para que el frontend no los
    tenga harcodeados.
  - **Nota sobre sucursal en `sesiones`**: hoy el login no tiene concepto de
    "sucursal activa" (ver `project_direcciones_paciente_geocodificacion`
    y el propio login). Se deja `sucursal_id`/`sucursal_nombre` en null por
    ahora -- no es parte de este alcance agregar selección de sucursal al
    login.

- Middleware nuevo, simple, de rate-limit en memoria para `GET /auth/pista`
  (por IP+email, ej. 5 intentos/hora) -- no se requiere una librería nueva
  ni tabla adicional para esto (basta un `Map` con limpieza periódica).

## Fase 3 -- Frontend

- `login.component`: paso adicional cuando el backend responde
  `requiere2FA` (input de 6 dígitos); botón "¿Olvidaste tu pista?" junto al
  campo de email que llama a `GET /auth/pista`.
- Pantalla nueva `features/seguridad` (ruta `/seguridad`, dentro del layout
  protegido): enrolar/deshabilitar 2FA (QR + confirmación), reemplaza el
  drawer de cambio de password actual del `layout.component` o lo
  complementa con el campo `pista`.
- `SessionService` (nuevo, `core/services/session.service.ts`): detecta
  inactividad (eventos globales), doble temporizador (aviso + cierre),
  trae límites de `GET /auth/session-config`, dispara `auth.logout()` que
  ahora también llama a `POST /auth/logout` en el backend.
- Modal de aviso de inactividad (`app-inactividad`), montado en
  `layout.component.html`, con cuenta regresiva y botón "Continuar
  trabajando" (extiende el timer local; el JWT en sí no se renueva porque
  no hay endpoint de refresh en este alcance -- si el JWT expira durante
  ese tiempo, el interceptor 401 ya maneja la salida).
- Cronómetro de tiempo conectado en el topbar (`layout.component`), con
  clase de aviso cuando el modal de inactividad está activo.

## Actualización 2026-09-09 — access token corto + refresh token revocable

Se implementó el "término medio" entre JWT stateless puro y el patrón
completo de cookies `httpOnly` (evaluado y descartado por el costo de
infraestructura: exige HTTPS en `.17` y en dev local, y toca el
interceptor de autenticación, el punto de mayor radio de impacto posible
en la app):

- **Access token**: JWT normal, ahora corto (`JWT_EXPIRES_IN`, recomendado
  `30m`), verificado solo por firma en cada request (sin tocar la BD).
- **Refresh token**: opaco (`ref_` + 32 bytes hex), reemplaza el contenido
  de `sesiones.token` (mismo campo que ya existía para la bitácora --
  no hizo falta migración nueva). Vive `REFRESH_TOKEN_EXPIRES_IN_HOURS`
  (recomendado 12h) independientemente de la inactividad, y se valida
  contra `sesiones` solo al llamar `POST /auth/refresh` (no en cada
  request). **Rota en cada uso**: cada refresh devuelve un refresh token
  nuevo e invalida el anterior, para que uno filtrado no sirva dos veces
  sin ser detectado.
- **Frontend**: el interceptor de auth reintenta automáticamente ante un
  401 (renueva una vez con el refresh token y repite la petición
  original) antes de forzar logout; `SessionService` además renueva de
  forma proactiva cada `SESSION_REFRESH_INTERVAL_MINUTES` mientras el
  usuario sigue activo, para que el access token nunca llegue a expirar
  en uso normal.
- `POST /auth/logout` pasó a identificar la sesión por `refreshToken` (ya
  no por el JWT crudo) y dejó de requerir `requireAuth` -- no necesita
  ningún dato del token para cerrar la fila.
- Probado end-to-end (login → uso → refresh con rotación → refresh viejo
  rechazado → logout → refresh tras logout rechazado) y verificado en un
  navegador real que el interceptor renueva sola la sesión ante un access
  token corrompido, sin desloguear al usuario.

## Actualización 2026-09-09 — cambio de contraseña obligatorio (debe_cambiar_password)

Inspirado en `agro 1.1`: hoy en la clínica, cuando un admin crea un
usuario o le resetea la contraseña desde la pantalla de Usuarios, el
admin escribe directamente la contraseña que esa persona va a usar --
la conoce, y no había ningún paso de "cámbiala en tu primer login".

- Columna nueva `usuarios.debe_cambiar_password` (migración 028). Se
  activa al **crear** un usuario nuevo y al **resetear** la contraseña de
  uno existente desde `PUT /api/usuarios/:id` (un admin cambiando la
  contraseña de otro siempre es un reset temporal); NO se activa cuando
  el propio usuario cambia su contraseña via `/auth/password`
  (auto-servicio, con su contraseña actual) -- ese camino la limpia.
- **Aplicado servidor + cliente**: el flag viaja como claim en el access
  token (sin costo extra de BD, igual que `rol`/`empresa_id`) y
  `requireAuth` bloquea con 403 (`requiereCambioPassword: true`)
  cualquier ruta que no sea `/auth/password`, `/auth/logout` o
  `/auth/me`. El frontend fuerza el drawer de "Cambiar contraseña" sin
  botón de cerrar ni Cancelar mientras el flag siga activo.
- Al cambiar la contraseña exitosamente, el backend reemite el access
  token (`debe_cambiar_password: false`) en la misma respuesta, para que
  el desbloqueo sea inmediato -- sin esperar al próximo refresh
  proactivo (hasta `SESSION_REFRESH_INTERVAL_MINUTES` de retraso si no
  se hiciera esto).
- Probado end-to-end contra `.17` (creación de usuario, bloqueo de rutas,
  excepciones funcionando, cambio de contraseña desbloqueando, reset por
  admin re-activando el flag, edición sin contraseña sin tocarlo) y en
  navegador real (drawer forzado sin cerrar/cancelar tras el login,
  desbloqueo automático al guardar).

## Fuera de alcance (por ahora)

- Cookies `httpOnly` para el refresh token (evaluado, ver arriba) -- el
  refresh token sigue viajando en el body y guardándose en `localStorage`,
  igual que el access token.
- OTP por email/SMS.
- Selección de sucursal en el login / en la bitácora de sesiones.
- Panel de administración de "sesiones activas" (listar/forzar cierre de
  sesiones de otros usuarios) -- la bitácora queda lista para eso, pero la
  pantalla no se construye en este alcance.
