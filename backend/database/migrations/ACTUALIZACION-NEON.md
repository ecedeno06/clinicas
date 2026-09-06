# Actualizacion aplicada a Neon (produccion)

Estado: `001` a `018` ya se aplicaron en Neon (verificado con
comparacion completa de esquema contra `.19`/`.17`; `007` certificada en
desarrollo y promovida el 2026-09-03; `008` aplicada el 2026-09-04;
`009`, `010` y `011` aplicadas el 2026-09-05; `012`-`018` aplicadas el
2026-09-06, comparacion de columnas de `sucursales`/`pacientes`/
`doctor_horarios`/`citas`/`campanas`/`campana_doctores`/`doctores` entre
`.17` y Neon confirmada identica). Ver tambien [README.md](./README.md)
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
