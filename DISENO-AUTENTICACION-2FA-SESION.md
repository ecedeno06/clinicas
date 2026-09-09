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

## Fuera de alcance (por ahora)

- Refresh token / renovación del JWT en sí (el JWT sigue expirando a las
  `JWT_EXPIRES_IN` horas como hoy; el logout por inactividad es un control
  de UX del lado del cliente, no extiende la vida real del JWT).
- OTP por email/SMS.
- Selección de sucursal en el login / en la bitácora de sesiones.
- Panel de administración de "sesiones activas" (listar/forzar cierre de
  sesiones de otros usuarios) -- la bitácora queda lista para eso, pero la
  pantalla no se construye en este alcance.
