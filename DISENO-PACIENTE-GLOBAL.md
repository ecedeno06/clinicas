# Diseno: paciente como entidad global (portal multi-clinica)

> Informe de diseno. Objetivo: un paciente tiene **una sola cuenta** en
> toda la plataforma, y esa cuenta puede estar vinculada a N clinicas de
> la red. Desde su portal, el paciente ve su historial agregado de todas
> las clinicas donde tiene citas — pero el personal de cada clinica sigue
> viendo solo lo suyo, como hoy.
>
> **Estado (2026-09-02): Escenarios 1 y 2 implementados y probados**
> (migracion `005_pacientes_globales.sql`, aplicada en `.19`, pendiente en
> Neon). Es decir: el modelo de datos global y el flujo de "alta de
> paciente" (nuevo o ya existente en la red) ya funcionan. **Los
> escenarios 3 a 6 (portal, login, invitacion por correo) siguen sin
> implementar** — ver seccion 10 de este documento para lo que falta.

## 1. La idea central: mismo patron que ya existe para `usuarios`

Este problema ya esta resuelto en el sistema, para el personal:

```
usuarios (global: nombre, email, password_hash, avatar)
      |
usuarios_empresas_rol (N:M: que rol tiene este usuario en esta clinica)
      |
empresas
```

Un `usuario` no le pertenece a una clinica — puede trabajar en varias, cada
una con su propio rol. La propuesta es aplicar **exactamente el mismo
patron** a pacientes:

```
pacientes (global: nombre, identificacion, fecha_nacimiento, sexo,
           alergias, contacto_emergencia, email, password_hash)
      |
pacientes_empresas (N:M: activo en esta clinica, fecha de alta)
      |
empresas
```

Lo importante: **los datos clinicos operativos no se tocan**. `citas`,
`historias_clinicas`, `signos_vitales` y `recetas` ya tienen su propio
`empresa_id` — el aislamiento entre clinicas ya lo garantiza esa columna,
no la tabla `pacientes`. Que `pacientes` pase a ser global no debilita el
aislamiento de esas tablas en absoluto.

## 2. Que datos son "de la persona" vs "de la relacion con la clinica"

Esto es la decision de diseno mas importante y la que mas conviene fijar
bien desde el inicio:

| Campo | Hoy (en `pacientes`, por clinica) | Propuesta |
|---|---|---|
| `nombre` | por clinica | **Global** (una persona, un nombre) |
| `identificacion` | por clinica, unique(empresa_id, identificacion) | **Global**, unique a secas — es la clave para no duplicar personas |
| `fecha_nacimiento`, `sexo` | por clinica | **Global** — no cambian segun la clinica |
| `alergias` | por clinica | **Global**, y con razon de seguridad: si Clinica A registro una alergia, Clinica B **debe** verla, no solo si el paciente la repite |
| `contacto_emergencia` | por clinica | **Global** (mismo argumento) |
| `telefono`, `direccion`, `email` | por clinica | **Global** — el personal de cualquier clinica vinculada puede actualizarlo (igual que hoy pasa con `usuarios.nombre`/`avatar`) |
| `activo` | por clinica | **Pasa a `pacientes_empresas.activo`** — un paciente puede estar dado de baja en la Clinica A pero activo en la Clinica B |

## 3. Modelo de datos propuesto

```sql
-- pacientes: ahora es la identidad global de la persona
alter table pacientes
  drop constraint pacientes_empresa_id_fkey,
  drop column empresa_id,
  drop column activo,
  add column email text unique,
  add column password_hash text,
  add column token_activacion text,
  add column token_activacion_expira timestamptz;

-- identificacion pasa de unique(empresa_id, identificacion) a unique a secas
alter table pacientes drop constraint uq_pacientes_empresa_identificacion;
alter table pacientes add constraint uq_pacientes_identificacion unique (identificacion);

-- nueva tabla de enlace, mismo espiritu que usuarios_empresas_rol
create table pacientes_empresas (
    id           uuid primary key default gen_random_uuid(),
    paciente_id  uuid not null references pacientes(id) on delete cascade,
    empresa_id   uuid not null references empresas(id) on delete cascade,
    activo       boolean not null default true,
    created_at   timestamptz not null default now(),
    unique (paciente_id, empresa_id)
);
create index idx_pacientes_empresas_paciente on pacientes_empresas(paciente_id);
create index idx_pacientes_empresas_empresa on pacientes_empresas(empresa_id);
```

`citas.paciente_id`, `historias_clinicas.paciente_id`, `signos_vitales.paciente_id`
y `recetas.paciente_id` **no cambian** — siguen apuntando a `pacientes(id)`,
solo que ahora ese id es global en vez de "propiedad" de una clinica.

### El problema real de la migracion: duplicados

Hoy, si "Juan Perez" (misma cedula) fue registrado independientemente en
la Clinica A y en la Clinica B, existen **dos filas distintas** en
`pacientes` con la misma `identificacion`. Al pasar a `unique(identificacion)`
global, esas filas chocan. Hace falta un script de deduplicacion **antes**
de aplicar el constraint:

1. Agrupar `pacientes` por `identificacion` (ignorando nulos/vacios, que
   quedan tal cual, sin fusionar).
2. Por cada grupo con mas de una fila: elegir una fila "sobreviviente"
   (ej. la mas antigua), reapuntar `citas`/`historias_clinicas`/
   `signos_vitales`/`recetas` de las filas duplicadas hacia la sobreviviente,
   crear una fila en `pacientes_empresas` por cada `empresa_id` que tenian
   las filas duplicadas, y borrar las filas duplicadas.
3. Recien ahi aplicar el `unique(identificacion)`.

Este script hay que correrlo y revisarlo manualmente contra `.19` primero
(hoy en dev ya existen "Juan Perez" y "Edwin Cedeno" en al menos una
clinica cada uno segun los datos de prueba — hay que confirmar si se
repiten en mas de una).

## 4. Flujo: alta de un paciente en una clinica

Reutilizando el patron ya probado de `usuarios.crear()`:

1. Recepcion registra un paciente nuevo, con `identificacion` obligatoria
   para hacer la busqueda.
2. Backend busca `select id from pacientes where identificacion = $1`.
   - **Si existe**: no se crea una fila nueva en `pacientes` (evita
     duplicar el nombre/alergias/etc. de una persona que ya esta en la
     red). Solo se inserta en `pacientes_empresas` (paciente_id, empresa_id).
     Si el paciente ya tiene datos (alergias, contacto de emergencia), la
     recepcionista los ve automaticamente — dato importante para seguridad
     clinica.
   - **Si no existe**: se crea la fila en `pacientes` con todos los datos
     capturados, y luego el enlace en `pacientes_empresas`.
3. Igual que con usuarios, si el paciente ya existe, el frontend deberia
   avisar "Ya existe un paciente con esta identificacion en la red:
   {{nombre}} — se va a asociar a tu clinica" antes de confirmar.

## 5. Flujo: activacion del portal (el paciente obtiene acceso)

El paciente **no se autoregistra libremente** — eso permitiria que
cualquiera reclame ser un paciente ya existente. El flujo es por invitacion:

1. Un miembro del staff (en cualquier clinica donde el paciente este
   vinculado), desde la ficha del paciente, hace clic en "Invitar al
   portal" y confirma/edita el email.
2. Backend genera un `token_activacion` (random, con expiracion ~48h),
   lo guarda en `pacientes`, y dispara un email con el link
   `https://.../portal/activar?token=...` (requiere un servicio de envio
   de correo, que hoy el proyecto no tiene integrado — ver seccion 8).
3. El paciente abre el link, define su contrasena
   (`POST /api/portal/activar { token, password }`), el backend valida el
   token, guarda `password_hash`, limpia el token.
4. De ahi en adelante, el paciente entra por `/portal/login` con
   email + password, sin pasar por ningun staff.

## 6. Login y token del portal

Distinto del login de staff (que negocia `empresa_id` activa). El portal
**no tiene "empresa activa"** — el paciente ve todo lo suyo de una vez:

```
POST /api/portal/auth/login { email, password }
  -> valida contra pacientes.email / password_hash
  -> jwt payload: { pacienteId, tipo: 'paciente' }  (sin empresa_id, sin rol)
```

Middleware nuevo `requirePaciente` (paralelo a `requireAuth`), que solo
acepta tokens con `tipo: 'paciente'` — separa completamente el mundo
"staff" del mundo "paciente" a nivel de autenticacion, para que un token
de portal nunca pueda usarse contra los endpoints de administracion y
viceversa.

## 7. Endpoints nuevos (namespace `/api/portal`)

Todos toman `pacienteId` **del token**, nunca de un parametro de la URL o
del body — asi no hay forma de que un paciente pida el historial de otro:

```
POST   /api/portal/auth/login
POST   /api/portal/auth/activar          { token, password }

GET    /api/portal/mis-clinicas          -- lista de clinicas donde esta vinculado
GET    /api/portal/mis-citas             -- de todas sus clinicas, o ?empresa_id= para filtrar una
GET    /api/portal/mi-historial          -- historias_clinicas + signos_vitales + recetas, agregado
GET    /api/portal/mis-recetas
```

Internamente, cada query hace:
```sql
where paciente_id = $1  -- del token
  and empresa_id in (select empresa_id from pacientes_empresas where paciente_id = $1 and activo = true)
```
La segunda condicion es la que garantiza que, si en el futuro se da de
baja a un paciente de una clinica, deja de ver el historial de esa
clinica especifica en su portal (mientras conserva el de las demas).

## 8. Frontend: un area completamente separada

Nueva seccion `frontend/src/app/portal/` (o una app separada si se
prefiere desacoplar el deploy), con:

- `PortalLoginComponent` — login propio, sin seleccion de empresa.
- `PortalLayoutComponent` — sin la sidebar de administracion; nav simple:
  Mis citas / Mi historial / Mis recetas / Mi perfil.
- Vistas de **solo lectura** (el paciente no edita su propia historia
  clinica ni sus recetas — eso lo sigue haciendo el doctor).
- Cada vista que agrega datos de varias clinicas deberia mostrar de que
  clinica viene cada registro (ej. columna "Clinica" en la tabla de citas),
  ya que ahora la fuente es plural.

## 9. Que NO cambia (para dejarlo explicito)

- El personal de la Clinica B **sigue sin ver** el historial que el
  paciente tiene en la Clinica A. El aislamiento por `empresa_id` para el
  staff no se toca — solo el **propio paciente**, desde su portal, ve el
  agregado. Si mas adelante se quiere permitir que un doctor de la Clinica
  B vea el historial de la Clinica A (ej. referencia/interconsulta), eso
  requeriria un mecanismo de consentimiento explicito del paciente — **no
  es parte de este diseno** y conviene tratarlo como una decision aparte,
  no como default.
- Los roles de staff (`admin`, `doctor`, `recepcionista`) no cambian.
- Las tablas `citas`, `historias_clinicas`, `signos_vitales`, `recetas`
  no cambian de estructura, solo cambia lo que hay "detras" de
  `paciente_id`.

## 10. Decisiones que hay que confirmar antes de construir

1. **Deduplicacion de pacientes existentes**: ¿corremos el script de
   fusion contra `.19` primero para ver el impacto real, o se hace en un
   ambiente de prueba aparte?
2. **Envio de correo**: el proyecto hoy no tiene ningun servicio de email
   integrado (ni para invitar usuarios, ni para nada). Hay que elegir uno
   (ej. Resend, SendGrid, SES) antes de poder implementar la invitacion
   por email — sin esto, el flujo de activacion no se puede completar de
   forma segura por si solo.
3. **¿Que pasa si dos clinicas distintas ya tenian datos distintos para
   "las mismas" alergias/contacto de emergencia de esa persona?** El
   script de fusion tiene que decidir un criterio (ej. concatenar, o
   quedarse con el mas reciente) — no es automatico sin revision humana
   en varios casos.
4. **¿El paciente puede editar su propio telefono/direccion/email desde
   el portal?** Recomendado que si (como hoy usuarios pueden cambiar su
   propio avatar), pero es una decision de producto, no tecnica.

## 11. Orden sugerido de implementacion

1. Migracion + script de deduplicacion (validado primero contra `.19`,
   revisado a mano antes de tocar Neon).
2. Backend: `pacientes_empresas`, ajustar `pacientes.controller.js` al
   patron "buscar por identificacion antes de crear" (igual que usuarios).
3. Backend: auth de portal (`/api/portal/auth/*`) + middleware
   `requirePaciente`.
4. Backend: endpoints de solo lectura (`mis-citas`, `mi-historial`,
   `mis-recetas`).
5. Integracion de envio de correo (bloqueante para el flujo de invitacion
   real; se puede simular a mano en dev generando el link directamente).
6. Frontend: portal completo (login, layout, vistas).
7. Frontend staff: agregar el boton "Invitar al portal" en la ficha de
   paciente, y el aviso de "ya existe en la red" al registrar uno nuevo.
