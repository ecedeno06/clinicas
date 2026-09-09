# Actualizacion aplicada a Neon (produccion)

Estado: `001` a `021` ya se aplicaron en Neon (verificado con
comparacion completa de esquema contra `.19`/`.17`; `007` certificada en
desarrollo y promovida el 2026-09-03; `008` aplicada el 2026-09-04;
`009`, `010` y `011` aplicadas el 2026-09-05; `012`-`018` aplicadas el
2026-09-06, comparacion de columnas de `sucursales`/`pacientes`/
`doctor_horarios`/`citas`/`campanas`/`campana_doctores`/`doctores` entre
`.17` y Neon confirmada identica; `019`-`021` aplicadas el 2026-09-07,
comparacion de columnas de `doctores`/`doctor_especialidades`/`citas`/
`pacientes` entre `.17` y Neon confirmada identica, backfill de
`doctor_especialidades` verificado 1:1). Ver tambien [README.md](./README.md)
para el registro vivo de que esta aplicado en cada entorno.

## Resumen

| # | Migracion | Que agrega | Estado en Neon |
|---|---|---|---|
| 1 | `001_signos_vitales.sql` | Tabla nueva `signos_vitales` | ✅ Aplicada |
| 2 | `002_glucosa_glicosilada.sql` | 1 columna nueva en `signos_vitales` | ✅ Aplicada |
| 3 | `003_recetas.sql` | 2 tablas nuevas: `recetas` y `receta_medicamentos` | ✅ Aplicada |
| 4 | `004_recetas_multiples.sql` | Permite varias recetas por cita | ✅ Aplicada |
| 5 | `005_pacientes_globales.sql` | `pacientes` pasa a ser global (multi-clinica) | ✅ Aplicada |
| 6 | `006_horarios_doctores.sql` | Tabla nueva `doctor_horarios` (horario semanal por doctor) | ✅ Aplicada |
| 7 | `007_laboratorio.sql` | Tablas nuevas `ordenes_laboratorio` y `orden_laboratorio_examenes` | ✅ Aplicada 2026-09-03 |
| 8 | `008_paciente_foto.sql` | Columna nueva `foto` (base64) en `pacientes` | ✅ Aplicada 2026-09-04 |
| 9 | `009_citas_reagendar.sql` | Agrega `'reagendar'` al check de `citas.estado` | ✅ Aplicada 2026-09-05 |
| 10 | `010_citas_log.sql` | Columna nueva `log` (jsonb) en `citas`: bitacora de auditoria | ✅ Aplicada 2026-09-05 |
| 11 | `011_recetas_creado_por.sql` | Columna nueva `creado_por` en `recetas` | ✅ Aplicada 2026-09-05 |
| 12 | `012_sucursales.sql` | Tabla nueva `sucursales`, columna `sucursal_id` en `doctor_horarios` y `citas` | ✅ Aplicada 2026-09-06 |
| 13 | `013_sucursales_telefono.sql` | Columna nueva `telefono` en `sucursales` | ✅ Aplicada 2026-09-06 |
| 14 | `014_sucursales_google_maps.sql` | Columna nueva `google_maps_url` en `sucursales` | ✅ Aplicada 2026-09-06 |
| 15 | `015_pacientes_acepta_whatsapp.sql` | Columna nueva `acepta_whatsapp` en `pacientes` | ✅ Aplicada 2026-09-06 |
| 16 | `016_campanas.sql` | Tablas nuevas `campanas` y `campana_doctores`, columna `campana_id` en `citas` | ✅ Aplicada 2026-09-06 |
| 17 | `017_campanas_google_maps.sql` | Columna nueva `google_maps_url` en `campanas` | ✅ Aplicada 2026-09-06 |
| 18 | `018_doctores_acepta_whatsapp.sql` | Columna nueva `acepta_whatsapp` en `doctores` | ✅ Aplicada 2026-09-06 |
| 19 | `019_doctor_especialidades.sql` | Tabla nueva `doctor_especialidades` (N:M doctor-especialidad con numero de colegiado); elimina `doctores.especialidad_id`/`numero_colegiado`; agrega `citas.especialidad_id` (sin FK) | ✅ Aplicada 2026-09-07 |
| 20 | `020_pacientes_google_maps.sql` | Columna nueva `google_maps_url` en `pacientes` | ✅ Aplicada 2026-09-07 |
| 21 | `021_citas_domicilio.sql` | Columna nueva `es_domicilio` en `citas` | ✅ Aplicada 2026-09-07 |
| 22 | `022_citas_urgencia.sql` | Columna nueva `es_urgencia` en `citas` | ✅ Aplicada 2026-09-07 |
| 23 | `023_pacientes_comparte_ubicacion.sql` | Columna nueva `comparte_ubicacion` en `pacientes` | ✅ Aplicada 2026-09-08 |
| 24 | `024_usuarios_telefono.sql` | Columnas nuevas `telefono`/`acepta_whatsapp` en `usuarios` | ✅ Aplicada 2026-09-08 |
| 25 | `025_direcciones_paciente.sql` | Tabla nueva `direcciones_paciente` (multiples direcciones por paciente, una principal); elimina `pacientes.direccion`/`google_maps_url`/`comparte_ubicacion` | ✅ Aplicada 2026-09-08 |
| 26 | `026_sesiones.sql` | Tabla nueva `sesiones` (bitacora de inicios de sesion: clinica/sucursal, token, expiracion, razon de salida) | ✅ Aplicada 2026-09-08 |
| 27 | `027_auth_2fa_pista.sql` | Columnas `pista`, `two_factor_enabled`/`two_factor_secret` en `usuarios` (2FA por app autenticadora) | ✅ Aplicada 2026-09-08 |

---

## 4. `004_recetas_multiples.sql` — Varias recetas por cita

El diseño original limitaba a **una receta por cita** (`unique` en
`recetas.cita_id`). En la practica el doctor puede emitir mas de una receta
en la misma consulta, asi que se quita esa restriccion:

```sql
alter table recetas drop constraint if exists recetas_cita_id_key;
create index if not exists idx_recetas_cita on recetas(cita_id);
```

Esto tambien cambio el backend: antes `PUT`/`GET` de receta vivian bajo
`/citas/:citaId/receta` (una sola); ahora `GET`/`POST` de la lista siguen
bajo `/citas/:citaId/recetas` (plural), pero `PUT`/`DELETE` de una receta
puntual pasaron a `/recetas/:recetaId` (recurso propio), porque ya no hay
una unica receta por cita a la cual referirse implicitamente.

Validado con Postgres desechable: se simulo el estado actual de Neon (con
el `unique` todavia activo), se confirmo que una segunda receta para la
misma cita fallaba con `duplicate key value violates unique constraint
"recetas_cita_id_key"`, se aplico la migracion, y se confirmo que despues
la segunda receta se inserta sin problema.

---

## 5. `005_pacientes_globales.sql` — Paciente global (multi-clinica)

Cambio de modelo: `pacientes` deja de pertenecer a una sola clinica. Ahora
es una identidad global (misma logica que `usuarios`), y una nueva tabla
`pacientes_empresas` (N:M, paralela a `usuarios_empresas_rol`) vincula esa
identidad con cada clinica donde el paciente es atendido.

**Que hace la migracion, en orden:**
1. Crea `pacientes_empresas` (paciente_id, empresa_id, activo).
2. Migra cada `pacientes.empresa_id`/`activo` existente a un vinculo en
   la tabla nueva.
3. **Deduplica** pacientes con la misma `identificacion` registrados por
   separado en distintas clinicas antes de este cambio: fusiona las filas
   en una sola (conservando la mas antigua), reapunta `citas`,
   `historias_clinicas`, `signos_vitales` y `recetas` de las filas
   duplicadas hacia la sobreviviente, y traslada los vinculos de clinica.
   *(Verificado: no habia ningun caso real en `.19` ni en Neon al momento
   de escribir esta migracion, pero el bloque corre igual como
   salvaguarda -- probado por separado con datos sinteticos que si
   duplicaban).*
4. Quita `empresa_id` y `activo` de `pacientes` (ahora en
   `pacientes_empresas`).
5. Vuelve `identificacion` y `email` **unicos globalmente** en `pacientes`
   (antes `identificacion` era unico solo por clinica).

**Cambio de comportamiento importante**: al registrar un paciente nuevo,
el backend ahora busca primero por `identificacion` en toda la red
(`GET /api/pacientes/buscar?identificacion=`). Si ya existe, no se crea un
registro duplicado — se reutiliza el existente (nombre, alergias, contacto
de emergencia, etc.) y solo se crea el vinculo con la clinica actual. El
frontend muestra un aviso y bloquea esos campos para edicion accidental
cuando detecta la coincidencia.

**Lo que NO cambia**: el aislamiento de datos clinicos entre clinicas.
`citas`, `historias_clinicas`, `signos_vitales` y `recetas` ya filtraban
por su propio `empresa_id` — eso sigue igual. El personal de una clinica
sigue sin ver el historial que el mismo paciente tiene en otra.

Ver [DISENO-PACIENTE-GLOBAL.md](../../../DISENO-PACIENTE-GLOBAL.md) para
el diseño completo, incluyendo lo que falta (portal del paciente, login
propio, invitacion por correo) que NO forma parte de esta migracion.

---

## 6. `006_horarios_doctores.sql` — Horario semanal por doctor (tablero de turnos)

Tabla nueva `doctor_horarios`: el patron recurrente de dias/horas en que
atiende cada doctor (puede tener varios bloques el mismo dia, ej. turno
partido manana/tarde). No modifica `citas` ni ninguna tabla existente, y
no es una restriccion dura — un doctor sin filas aqui sigue recibiendo
citas exactamente igual que antes.

Se usa para:
1. Un tablero de horario por doctor (pantalla nueva en Doctores, icono
   "Horario" en cada fila).
2. Un endpoint de disponibilidad (`GET /api/doctores/:id/disponibilidad?fecha=`)
   que combina ese horario con las citas ya agendadas ese dia, y devuelve
   franjas libres en bloques de 30 minutos — el formulario de "Nueva cita"
   las muestra como chips clicables que rellenan hora de inicio/fin (sin
   dejar de poder escribirlas a mano).

Validado con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y probado end-to-end contra `.19` con datos reales: horario
con turno partido, un dia sin atencion, y una cita ya agendada restando
correctamente su franja de las disponibles.

---

## 7. `007_laboratorio.sql` — Modulo de laboratorio (certificado y promovido a Neon el 2026-09-03)

Tablas nuevas `ordenes_laboratorio` (cabecera, N por cita) y
`orden_laboratorio_examenes` (lineas de examenes solicitados), con el
mismo patron ya usado en `recetas`/`receta_medicamentos`: se ata a
`cita_id`, no a `historia_clinica_id`, y las lineas se reemplazan como
conjunto en cada actualizacion (no se editan una a una).

Se probo primero solo en `.19` (desarrollo) por instruccion explicita,
incluyendo el card "Laboratorios pendientes" del tablero agregado
despues. Una vez certificado, se aplico a Neon y se verifico el esquema
contra `.19` (identico). Ver [LABORATORIO.md](../../../LABORATORIO.md)
en la raiz del proyecto para el diseno completo, el detalle de
endpoints y todo lo que se probo.

**Alcance de esta version (MVP)**: `resultado` y `valor_referencia` son
texto libre (soportan valores numericos y cualitativos, ej.
"Positivo"/"Negativo"). **No incluye archivos adjuntos** (PDF de
resultados, imagenes) — eso requiere definir almacenamiento de archivos
primero, ver `MEJORAS-PROPUESTAS.md` seccion 6.

---

## 8. `008_paciente_foto.sql` — Foto del paciente (base64)

Columna aditiva `foto text` en `pacientes` (mismo patron ya usado en
`usuarios.avatar` y `empresas.logo`). Se sube desde el formulario de
Pacientes (camara, archivo del equipo o pegar) y solo se persiste al
guardar el registro. Aplicada a Neon el 2026-09-04, verificada con
`\d pacientes` (columna `foto | text` presente).

---

## 9. `009_citas_reagendar.sql` — Estado `reagendar` en citas

Agrega `'reagendar'` a los valores permitidos del check de `citas.estado`
(dropea y vuelve a crear `citas_estado_check`, ya que es un check inline,
no un tipo enum). Se usa cuando un admin elimina un bloque de horario de
un doctor (`DELETE /api/horarios/:id`): antes de borrar el bloque, el
backend marca como `reagendar` las citas que quedarian sin disponibilidad
(activas -- pendiente/confirmada --, no vencidas, y cuyo horario cae
dentro del bloque eliminado), y devuelve cuantas fueron afectadas para
que el frontend avise al usuario. El tablero muestra una pastilla "Citas
por reagendar" que enlaza a Citas filtrado por ese estado.

Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y luego end-to-end contra `.19`: una cita activa dentro del
bloque eliminado paso a `reagendar`; una cita `atendida` y otra ya
vencida dentro del mismo rango horario NO se tocaron. Aplicada a Neon
el 2026-09-05, verificada con `pg_get_constraintdef` (constraint
incluye `'reagendar'::text`).

---

## 10. `010_citas_log.sql` — Bitacora de auditoria de la cita

Columna aditiva `log jsonb not null default '[]'::jsonb` en `citas`: un
objeto `{fecha, usuario, nota}` por cada interaccion con la cita (crear,
editar, reagendar, cambiar estado, y marcar `reagendar` cuando se elimina
el bloque de horario del doctor que la cubria). Se agrega solo, nunca se
edita ni se borra una entrada existente. Helper compartido en
`backend/src/utils/citaLog.js` (`registrarEventoCita`/`primerEventoLog`),
usado desde `citas.controller.js` (`crear`/`actualizar`) y
`doctorHorarios.controller.js` (`eliminar`).

Se muestra en el panel de "Editar cita" (frontend), en un card debajo de
Observaciones, con las 3 entradas mas recientes visibles y scroll vertical
para el resto.

Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y luego end-to-end contra `.19` via curl: crear cita, cambiar
fecha/hora, cambiar estado, y eliminar un bloque de horario con una cita
afectada -- las 4 notas quedaron con el texto y usuario esperados.
Aplicada a Neon el 2026-09-05.

---

## 11. `011_recetas_creado_por.sql` — Autor de la receta

Columna aditiva `creado_por uuid references usuarios(id)` en `recetas`:
el usuario logueado que registro la receta (no el doctor al que se
atribuye medicamente). Se guarda al crear (`recetas.controller.js#crear`)
y se usa para restringir editar/eliminar solo a su autor -- tanto en el
backend (403 si no coincide) como en el frontend (los botones "Editar"/
"Eliminar" se ocultan; "Imprimir" sigue disponible para cualquiera).
Recetas anteriores a este campo (`creado_por` null, autor desconocido)
quedan sin restriccion para no bloquear registros historicos.

Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y luego end-to-end contra `.19`: un segundo usuario de la
misma clinica recibe 403 al intentar editar/eliminar la receta de otro,
y no ve esos botones en la UI; el autor si puede. Aplicada a Neon el
2026-09-05.

---

## 12. `012_sucursales.sql` — Sucursales (sedes) por empresa

Fase 1 de [DISENO-ZONA-HORARIA-SUCURSALES.md](../../../DISENO-ZONA-HORARIA-SUCURSALES.md).
Tabla nueva `sucursales` (id, empresa_id, nombre, direccion, zona_horaria
default `America/Panama`, hora_apertura/cierre nullable, activo). Columna
`sucursal_id` nueva en `doctor_horarios` (un doctor puede atender en mas
de una sucursal de su empresa, por eso vive ahi y no en `doctores`) y en
`citas` (no se puede heredar del doctor porque el mismo doctor puede
atender en varias sedes).

**Backfill automatico, sin pedir nada al usuario**: por cada empresa que
todavia no tenga ninguna sucursal, crea una `'Sede Principal'` (heredando
la `direccion` de la empresa), y reapunta todo `doctor_horarios`/`citas`
existente sin `sucursal_id` hacia ella. Una vez respaldado, ambas columnas
pasan a `not null`. El sistema sigue funcionando exactamente igual que
hoy para toda clinica de una sola sede — no hay cambios visibles en la UI
todavia (eso es Fase 2/3 del diseno).

Probada con Postgres desechable: creacion limpia + re-ejecucion
idempotente (sin duplicar sedes ni reprocesar backfill ya hecho), y con
datos sinteticos (empresa + doctor + horario + cita) para confirmar que
el backfill efectivamente reapunta las filas existentes y no solo corre
en vacio. Aplicada a `.17` el 2026-09-06 (2 empresas existentes, cada una
recibio su `Sede Principal`, 0 filas quedaron sin `sucursal_id`).
**Aplicada a Neon el 2026-09-06** (1 empresa existente, backfill correcto,
0 filas sin `sucursal_id`, esquema verificado identico contra `.17`).

---

## 13. `013_sucursales_telefono.sql` — Telefono de la sucursal

Columna aditiva `telefono text` en `sucursales` (mismo patron que
`empresas.telefono`/`doctores.telefono`). Probada con Postgres desechable
(creacion limpia + re-ejecucion idempotente). Aplicada a `.17` y a Neon
el 2026-09-06.

---

## 14. `014_sucursales_google_maps.sql` — Enlace a Google Maps de la sucursal

Columna aditiva `google_maps_url text` en `sucursales`: enlace que el
administrador pega desde el boton "Compartir" de Google Maps. Texto libre,
sin validacion de formato -- solo se usa para mostrar un link "Ver en el
mapa" junto a la direccion. Probada con Postgres desechable (creacion
limpia + re-ejecucion idempotente). Aplicada a `.17` y a Neon el
2026-09-06.

---

## 15. `015_pacientes_acepta_whatsapp.sql` — Telefono valido para WhatsApp

Columna aditiva `acepta_whatsapp boolean not null default false` en
`pacientes`: indica si el telefono registrado recibe WhatsApp. Se usa en
Citas para decidir si ofrecer el boton "Compartir ubicacion por WhatsApp"
-- solo aparece si el paciente tiene telefono, esta marcado como que acepta
WhatsApp, y la sucursal de la cita tiene un enlace de mapa guardado.
Registros existentes quedan en `false` por defecto (no se asume nada hasta
que alguien lo marque explicitamente en el formulario de Pacientes).
Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente). Aplicada a `.17` y a Neon el 2026-09-06.

---

## 16. `016_campanas.sql` — Campañas de visitas médicas (Fase 1)

Fase 1 de [DISENO-CAMPANAS-MEDICAS.md](../../../DISENO-CAMPANAS-MEDICAS.md).
Tablas nuevas `campanas` (visita puntual a un lugar externo: oficina de un
cliente, feria de salud, evento comunitario -- con ciclo de vida
`borrador -> pendiente_aprobacion -> aprobada/rechazada -> en_curso ->
finalizada`, mas `cancelada`) y `campana_doctores` (reclutamiento:
invitado/confirmado/rechazado). Columna aditiva `citas.campana_id`
(nullable): una cita de campaña sigue siendo una cita normal, solo marcada
con de dónde vino -- ningún cambio en historias_clinicas/signos_vitales/
recetas/laboratorio.

CRUD backend completo para esta fase: crear/editar (solo en borrador o
rechazada)/listar/obtener campañas, transición de estado validada contra
el grafo de estados permitido (con motivo obligatorio al rechazar, y
`aprobado_por`/`fecha_aprobacion` registrados al aprobar), y reclutamiento
de doctores (invitar/confirmar-rechazar/quitar). Todo detrás de
`requireRol('admin')` — sin UI todavía (Fase 2 del diseño).

Probada con Postgres desechable (creación limpia + re-ejecución
idempotente, incluyendo el constraint `fecha_fin >= fecha_inicio`) y
luego end-to-end contra `.17` vía el controlador real: crear campaña,
invitar y confirmar un doctor, rechazar una transición de estado inválida
(borrador -> aprobada directo), aplicar la transición válida completa
(borrador -> pendiente_aprobacion -> aprobada), y verificar el log de
auditoría completo. Aplicada a `.17` y a Neon el 2026-09-06 (esquema
verificado idéntico).

---

## 17. `017_campanas_google_maps.sql` — Enlace a Google Maps de la campaña

Columna aditiva `google_maps_url text` en `campanas`, mismo patrón que
`sucursales.google_maps_url` (migración 014): el selector de ubicación en
mapa (Leaflet + OpenStreetMap + Nominatim, sin API key) ya construido para
Sucursales se reutilizó tal cual para el campo "Lugar" de una campaña —
mismo componente `app-mapa-selector`, mismo botón "Ver en el mapa" y
mismo botón de compartir por WhatsApp (con enlace de Waze incluido si se
pueden extraer coordenadas). Probada con Postgres desechable (creación
limpia + re-ejecución idempotente) y verificada end-to-end contra `.17`
(crear y actualizar una campaña con `google_maps_url`). Aplicada a `.17`
y a Neon el 2026-09-06.

---

## 18. `018_doctores_acepta_whatsapp.sql` — Telefono del doctor valido para WhatsApp

Columna aditiva `acepta_whatsapp boolean not null default false` en
`doctores`, mismo patrón que `pacientes.acepta_whatsapp` (migración 015).
Checkbox "Recibe WhatsApp" agregado junto al campo Teléfono en el
formulario de Doctores. Registros existentes quedan en `false` por
defecto. Probada con Postgres desechable (creación limpia + re-ejecución
idempotente) y verificada contra `.17`. Aplicada a `.17` y a Neon el
2026-09-06.

---

## 19. `019_doctor_especialidades.sql` — Un doctor puede tener varias especialidades

Pasa de 1:N (`doctores.especialidad_id`, unica y obligatoria) a N:M via
tabla puente `doctor_especialidades` (mismo patron que `campana_doctores`:
PK propia, `unique(doctor_id, especialidad_id)`, cascada en ambas FK,
indices, trigger `updated_at`). Cada fila lleva su propio numero de
colegiado (la junta medica certifica por especialidad), por eso
`doctores.numero_colegiado` tambien se elimina. Backfill: cada doctor
existente pasa a una fila con su especialidad y colegiado actuales, luego
se eliminan las columnas viejas (protegido con chequeo de
`information_schema.columns` para poder re-correr la migracion sin error
una vez ya aplicada).

`citas.especialidad_id` es nuevo pero **sin** `references especialidades(id)`:
es el filtro que el usuario elige al agendar (para acotar el selector de
doctor cuando tiene varias especialidades), guardado como dato informativo
para reportes/consultas futuras, no como llave protegida.

Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y luego end-to-end contra `.17` via los controladores reales:
crear/editar un doctor con multiples especialidades, crear una cita
guardando `especialidad_id`, y verificar que los joins de
`campanas.controller.js`/`pacientes.controller.js`/`laboratorio.controller.js`
(que antes asumian una sola especialidad por doctor) siguen funcionando
con el nuevo modelo agregado. Aplicada a `.17` y a Neon el 2026-09-07
(3 doctores -> 3 filas en `doctor_especialidades`, backfill 1:1, esquema
verificado identico).

---

## 20. `020_pacientes_google_maps.sql` — Enlace a Google Maps del paciente

Columna aditiva `google_maps_url text` en `pacientes`, mismo patron que
`sucursales.google_maps_url` (migracion 014): reutiliza el mismo
`MapaSelectorComponent` tal cual. Pensada para que el medico pueda ubicar
y navegar hacia visitas a domicilio (link "Ver en el mapa" + "Abrir en
Waze" en el listado de Pacientes). Probada con Postgres desechable
(creacion limpia + re-ejecucion idempotente) y verificada end-to-end
contra `.17`. Aplicada a `.17` y a Neon el 2026-09-07.

---

## 21. `021_citas_domicilio.sql` — Visita a domicilio

Columna aditiva `es_domicilio boolean not null default false` en `citas`.
Se fija con un checkbox en el formulario de cita, editable solo mientras
la cita sigue `pendiente` (una vez confirmada/atendida/cancelada queda
fija, no se puede corregir retroactivamente). `sucursal_id` se mantiene
igual que en una campana: sigue siendo la sede que organiza/factura la
cita, no el lugar fisico donde se atiende. Cuando una consulta del
historial del paciente esta marcada como domicilio, aparece un boton de
WhatsApp que comparte con el doctor asignado la ubicacion guardada en el
paciente (fecha, hora, especialidad y motivo de la cita incluidos en el
mensaje) -- solo si el doctor tiene telefono y `acepta_whatsapp` activado.
Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y verificada end-to-end contra `.17`: crear cita como
domicilio, editar mientras pendiente (se aplica), confirmar y volver a
intentar editar (se ignora, sin entrada de log falsa). Aplicada a `.17`
y a Neon el 2026-09-07.

---

## 22. `022_citas_urgencia.sql` — Cita de urgencia

Columna aditiva `es_urgencia boolean not null default false` en `citas`.
Checkbox "Es una urgencia" en el formulario, editable solo mientras la cita
sigue `pendiente` (mismo criterio que `es_domicilio`). Permite asignar
cualquier doctor sin que su horario configurado (`doctor_horarios`) ni un
compromiso de campaña confirmado que se cruce lo bloqueen -- el choque
contra OTRA cita del mismo PACIENTE se sigue validando siempre, una
urgencia no lo omite. En el frontend, el nombre del paciente parpadea en
rojo luminoso (con leve pulso de tamaño) mientras la cita de urgencia
siga sin atender ni cancelar, y aparece un icono de sirena junto al
nombre en el tablero y en Citas.

Probada con Postgres desechable (creación limpia + re-ejecución
idempotente) y verificada end-to-end contra `.17`: crear/editar una cita
de urgencia que se cruza con un compromiso de campaña confirmado del
doctor (falla sin urgencia, pasa con urgencia); el choque de horario del
paciente se sigue bloqueando igual. Aplicada a `.17` y a Neon el
2026-09-07.

---

## 23. `023_pacientes_comparte_ubicacion.sql` — Consentimiento para compartir ubicacion

Columna aditiva `comparte_ubicacion boolean not null default false` en
`pacientes`. Checkbox "Comparte ubicacion" junto al enlace de Google Maps
en el formulario de Pacientes: controla si los botones de ubicacion (Ver
en el mapa, Waze en el listado; compartir por WhatsApp con el doctor en
una visita a domicilio, en el historial) se muestran, aunque el enlace ya
este guardado. Registros existentes quedan en `false` por defecto -- no
se asume consentimiento hasta que alguien lo marque explicitamente. Los
botones de llamada y de WhatsApp directo (agregados en la migracion
anterior, sin relacion con ubicacion) no dependen de este campo.

Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y verificada end-to-end contra `.17`. Aplicada a `.17` y a
Neon el 2026-09-08.

---

## 24. `024_usuarios_telefono.sql` — Telefono y WhatsApp del usuario del sistema

Columnas aditivas `telefono text` y `acepta_whatsapp boolean not null
default false` en `usuarios` (cuentas de acceso: admin, recepcionista,
doctor), mismo patron que `doctores`/`pacientes`. Campo "Telefono" +
checkbox "Recibe WhatsApp" agregados al formulario de Nuevo/Editar
usuario. Registros existentes quedan en `false` por defecto.

Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente) y verificada end-to-end contra `.17` via el controlador
real (crear, actualizar, listar). Aplicada a `.17` y a Neon el
2026-09-08.

---

## 25. `025_direcciones_paciente.sql` — Multiples direcciones por paciente

Reemplaza las columnas `pacientes.direccion`/`google_maps_url`/
`comparte_ubicacion` (migraciones 020 y 023) por una tabla puente
`direcciones_paciente` (1 paciente : N direcciones), con `pais`/
`provincia`/`distrito`/`corregimiento` y `comparte_ubicacion` por
direccion, y `es_principal` con indice unico parcial (a lo sumo una
principal por paciente) -- esa es la que usan Google Maps/Waze/WhatsApp
al doctor en las comunicaciones existentes. Mismo criterio ya aplicado en
la migracion 019 (doctor_especialidades): backfill de cada paciente con
direccion/`google_maps_url` actuales a una fila principal, luego se
eliminan las columnas viejas, protegido con chequeo de columna para
poder re-correrse sin error.

Se agrego tambien en esta fase (backend, sin migracion propia): endpoint
`GET /api/geocodificacion/reverse`, proxy hacia la API de Geocoding de
Google (key `MAPKEY`, solo en el backend, nunca en el frontend) para
autocompletar provincia/distrito de una direccion -- ver
`DISENO-GEOCODIFICACION-INVERSA.md` para el diseno completo, incluyendo
el hallazgo de que Google no provee el corregimiento para Panama.

Probada con Postgres desechable (creacion limpia + re-ejecucion
idempotente, con datos sinteticos de pacientes con y sin direccion) y
verificada end-to-end contra `.17` via el controlador real (crear con
varias direcciones, validar que solo una sea principal, reemplazo
completo al editar). Aplicada a `.17` y a Neon el 2026-09-08 (esquema
verificado identico, backfill 1:1 confirmado en ambos).

**Pendiente**: agregar la variable de entorno `MAPKEY` en Render cuando
se despliegue esta version (no aplica a Neon, es solo del backend).

---

## 26. `026_sesiones.sql` — Bitacora de sesiones de usuario

Tabla nueva `sesiones`: una fila por cada JWT final emitido (login
completo, seleccion de empresa, o verificacion de 2FA), con
`empresa_id`/`empresa_nombre`, `sucursal_id`/`sucursal_nombre`, `rol`,
`token`, `expira_en`, y al cerrarse `activo=false` + `razon_salida` +
`duracion_segundos`. Es solo auditoria: el middleware de autenticacion
sigue validando unicamente la firma del JWT (no consulta esta tabla en
cada request), asi que no agrega costo de base de datos por peticion.
Ver `DISENO-AUTENTICACION-2FA-SESION.md`.

Probada con Postgres desechable (instalacion limpia + migracion aislada
corrida dos veces sin error) y verificada end-to-end contra `.17` real
(login/logout con una cuenta de prueba, fila insertada y cerrada
correctamente con la razon y duracion esperadas). Aplicada a `.17` y a
Neon el 2026-09-08 (estructura de tabla verificada identica).

---

## 27. `027_auth_2fa_pista.sql` — 2FA por app autenticadora y pista de contrasena

Columnas nuevas en `usuarios`: `pista` (hint de contrasena, mostrado en
el login via `GET /auth/pista`, endpoint publico con rate-limit),
`two_factor_enabled`/`two_factor_secret` (verificacion en dos pasos con
apps tipo Google Authenticator/Authy -- `otplib` + `qrcode`, secreto
cifrado AES-256-CBC con la clave de entorno `CRYPTO_SECRET_KEY`, nunca en
texto plano). `two_factor_enabled` queda en `false` por defecto para
todos los usuarios existentes: el 2FA se implemento completo pero nadie
lo tiene activo hasta que se enrole explicitamente desde "Seguridad" en
el menu de usuario.

Probada con Postgres desechable (instalacion limpia + migracion aislada
idempotente) y verificada end-to-end contra `.17` real: ciclo completo de
setup/enable/verify-login/disable de 2FA con una cuenta de prueba (creada
y eliminada despues de la prueba), y cambio de contrasena con pista
(rechazando una pista con 100% de similitud, aceptando una razonable).
Tambien se verifico en un navegador real (Chrome vía DevTools Protocol)
el flujo de login con codigo 2FA y la apertura del drawer de "Seguridad"
en el menu. Aplicada a `.17` y a Neon el 2026-09-08 (columnas verificadas
identicas).

**Pendiente**: agregar `CRYPTO_SECRET_KEY` en Render cuando se despliegue
esta version (no aplica a Neon, es solo del backend; sin esta variable el
2FA no se puede activar en produccion).

---

## Como aplicarlo a Neon

Necesitas la cadena de conexion de Neon (Project Settings → Database →
**Direct connection**, no el pooler). Con Docker (sin instalar `psql`):

```bash
docker run --rm -i -e PGPASSWORD='<password-neon>' postgres:16 \
  psql -h <host-neon> -U <usuario-neon> -d <base-neon> < backend/database/migrations/007_laboratorio.sql
```

## Verificacion despues de aplicar

```sql
\d ordenes_laboratorio            -- debe existir, con sus fk a citas/pacientes/doctores y el check de estado
\d orden_laboratorio_examenes     -- debe existir, con su fk a ordenes_laboratorio

select count(*) from ordenes_laboratorio;  -- 0 es normal (nadie ha cargado ordenes todavia)
```

## Riesgo / reversibilidad

Migracion 100% aditiva: crea 2 tablas nuevas, no toca ninguna existente.
No hay riesgo de romper datos ni backend viejo. Revertirla es
`drop table orden_laboratorio_examenes; drop table ordenes_laboratorio;`
si hiciera falta (en ese orden, por la foreign key).
